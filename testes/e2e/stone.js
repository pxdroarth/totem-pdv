// Conector Stone (Stone Connect 2.0) contra uma API falsa da Pagar.me: cartão crédito/débito e PIX na
// maquininha, fechamento do pedido, desistência do cliente e pagamento aprovado depois que ele saiu da tela.
const http = require('http'), fs = require('fs'), path = require('path');
const { abrir, verificador } = require('./_base');
const { ok, fim } = verificador('stone');

const CHAVE = 'sk_test_lisufit';
const pedidos = new Map(); const chamadas = [];
let aprovarNaConsulta = 2; // a partir de quantas consultas o pedido fica pago
const servidor = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', c => (corpo += c));
  req.on('end', () => {
    const json = corpo ? JSON.parse(corpo) : null;
    chamadas.push({ metodo: req.method, url: req.url, corpo: json, referer: req.headers.servicereferername, auth: req.headers.authorization });
    const responder = (st, obj) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (req.headers.authorization !== 'Basic ' + Buffer.from(CHAVE + ':').toString('base64')) return responder(401, { message: 'Authorization has been denied for this request.' });
    if (req.method === 'GET' && req.url.startsWith('/orders?')) return responder(200, { data: [], paging: { total: 0 } });
    if (req.method === 'POST' && req.url === '/orders') {
      const id = 'or_' + (pedidos.size + 1);
      pedidos.set(id, { id, corpo: json, consultas: 0, status: 'pending', closed: false });
      return responder(200, { id, status: 'pending', closed: false });
    }
    const m = req.url.match(/^\/orders\/(or_\d+)(\/closed)?$/);
    const p = m && pedidos.get(m[1]);
    if (!p) return responder(404, { message: 'Order not found' });
    if (req.method === 'PATCH' && m[2]) {
      if (json.status === 'canceled' && p.status === 'paid') return responder(412, { message: 'Order already paid' });
      p.closed = true; if (json.status === 'canceled') p.status = 'canceled';
      return responder(200, { id: p.id, status: p.status, closed: true });
    }
    if (req.method === 'GET') {
      p.consultas++;
      if (p.status === 'pending' && p.consultas >= aprovarNaConsulta) p.status = 'paid';
      const tipo = p.corpo.poi_payment_settings.payment_setup.type;
      return responder(200, { id: p.id, status: p.status, closed: p.closed, charges: p.status !== 'paid' ? [] : [{
        status: 'paid', payment_method: tipo === 'pix' ? 'pix' : tipo + '_card',
        last_transaction: { acquirer_nsu: '000' + p.id.slice(3) + '42', acquirer_auth_code: 'AUT' + p.id.slice(3), card: tipo === 'pix' ? undefined : { brand: 'Mastercard' } } }] });
    }
    responder(405, { message: 'método' });
  });
});

(async () => {
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  process.env.PDV_STONE_API = `http://127.0.0.1:${servidor.address().port}`;
  const { app, pg, erros, shot, entrar, dadosDir } = await abrir('stone');
  const ultimo = (metodo, filtro = () => true) => chamadas.filter(c => c.metodo === metodo && filtro(c)).at(-1);

  // ---- admin: testar conexão e ligar a Stone para PIX e cartão ----
  await entrar('1234');
  const provs = await pg.evaluate(() => pdv.provedoresPagamento());
  ok(provs.some(p => p.id === 'stone' && p.pixNaMaquininha && p.campos.some(c => c.chave === 'serialMaquininha')), 'Stone aparece na lista de gateways com os campos dela');
  const errada = await pg.evaluate(() => pdv.testarProvedor('stone', { secretKey: 'sk_test_errada', serialMaquininha: 'SN1' }).then(r => r.mensagem, e => e.message));
  ok(/Secret Key recusada/.test(errada), 'chave errada: mensagem clara — ' + errada);
  const certa = await pg.evaluate(k => pdv.testarProvedor('stone', { secretKey: k, serialMaquininha: 'SN1' }).then(r => r.mensagem, e => e.message), CHAVE);
  ok(/TESTE/.test(certa), 'chave de teste conecta e avisa que é teste — ' + certa);
  await pg.evaluate(k => pdv.salvarConfig({ pagamentos: { provedorPix: 'stone', provedorCartao: 'stone', permitirManualSeFalhar: true,
    credenciais: { stone: { secretKey: k, serviceRefererName: 'PARCEIRO-123', serialMaquininha: 'SN-Q92-0001', tipoCartao: 'perguntar', imprimirNaMaquininha: 'nao' } } } }), CHAVE);
  await pg.evaluate(() => trocarAba('config')); await pg.waitForTimeout(700);
  await shot('1-config-gateway');
  await pg.click('#btn-sair-admin'); await pg.waitForTimeout(300);
  await pg.evaluate(() => carregarDados()); await pg.waitForTimeout(300);
  const cfg = await pg.evaluate(() => estado.config.pagamentos);
  ok(cfg.cartao === 'stone' && cfg.pixNaMaquininha && cfg.perguntarTipoCartao && !JSON.stringify(cfg).includes(CHAVE), 'totem sabe que é maquininha integrada, sem receber a chave');

  const comprarCafe = async () => {
    await pg.evaluate(() => mostrarTela('inicio')); await pg.waitForTimeout(200);
    await pg.click('#btn-comecar'); await pg.waitForTimeout(300);
    await pg.click('[data-cat="Cafés"]'); await pg.waitForTimeout(300);
    const cafe = await pg.evaluate(() => estado.produtos.find(p => p.nome === 'Café Expresso').id);
    await pg.click(`.card-produto[data-id="${cafe}"]`); await pg.waitForTimeout(300);
    await pg.click('#btn-finalizar'); await pg.waitForTimeout(400);
  };
  const esperarFim = async () => { for (let i = 0; i < 40 && await pg.evaluate(() => document.body.dataset.tela) !== 'fim'; i++) await pg.waitForTimeout(500); };

  // ---- cartão: cliente escolhe débito, valor vai para a maquininha, pedido é fechado ----
  await comprarCafe();
  await pg.click('[data-forma=cartao]'); await pg.waitForTimeout(300);
  ok(await pg.isVisible('#cartao-tipo') && !(await pg.isVisible('#cartao-status')), 'cartão: pergunta crédito ou débito antes de mandar');
  await shot('2-credito-debito');
  await pg.click('[data-tipo-cartao=debit]'); await pg.waitForTimeout(800);
  const post = ultimo('POST');
  const ps = post.corpo.poi_payment_settings;
  ok(post.referer === 'PARCEIRO-123' && ps.devices_serial_number[0] === 'SN-Q92-0001' && ps.payment_setup.type === 'debit' && post.corpo.closed === false &&
    post.corpo.items[0].amount === 500 && ps.print_order_receipt === false, 'pedido direto: débito, R$ 5,00, maquininha certa, ServiceRefererName');
  await shot('3-aguardando-maquininha');
  await esperarFim();
  let venda = (await pg.evaluate(async () => { await pdv.entrarPainel('1234'); const v = await pdv.vendas({}); await pdv.sairPainel?.(); return v; })).at(-1);
  ok(venda && venda.formaPagamento === 'cartao' && venda.pagamento?.provedor === 'stone' && venda.pagamento.bandeira === 'Mastercard' && venda.pagamento.nsu,
    'aprovado: venda gravada com NSU e bandeira da Stone');
  ok(ultimo('PATCH', c => c.url === '/orders/or_1/closed')?.corpo.status === 'paid', 'pedido fechado como pago (libera a fila da maquininha)');
  const consultas = chamadas.filter(c => c.metodo === 'GET' && c.url === '/orders/or_1');
  ok(consultas.length >= 2, `consultas espaçadas (${consultas.length} consultas)`);
  await pg.evaluate(() => pdv.sairPainel && pdv.sairPainel());

  // ---- PIX: QR na maquininha, não na tela ----
  await comprarCafe();
  await pg.click('[data-forma=pix]'); await pg.waitForTimeout(800);
  ok(await pg.evaluate(() => document.querySelector('#tela-pix').dataset.maquininha) === '1' && !(await pg.isVisible('.qr-moldura')) && await pg.isVisible('.passos-maquininha'),
    'PIX: tela manda pagar no QR da maquininha');
  ok(ultimo('POST').corpo.poi_payment_settings.payment_setup.type === 'pix', 'pedido PIX enviado para a maquininha');
  await shot('4-pix-maquininha');
  await esperarFim();
  venda = (await pg.evaluate(async () => { await pdv.entrarPainel('1234'); return pdv.vendas({}); })).at(-1);
  ok(venda.formaPagamento === 'pix' && venda.pagamento?.provedor === 'stone', 'PIX aprovado e gravado');
  await pg.evaluate(() => pdv.sairPainel && pdv.sairPainel());

  // ---- cliente desiste: pedido sai da maquininha ----
  aprovarNaConsulta = 99;
  await comprarCafe();
  await pg.click('[data-forma=cartao]'); await pg.waitForTimeout(300);
  await pg.click('[data-tipo-cartao=credit]'); await pg.waitForTimeout(800);
  const credito = ultimo('POST');
  ok(credito.corpo.poi_payment_settings.payment_setup.type === 'credit' && credito.corpo.poi_payment_settings.payment_setup.installments === 1, 'crédito à vista');
  await pg.click('#tela-cartao [data-voltar]'); await pg.waitForTimeout(1200);
  ok(ultimo('PATCH')?.corpo.status === 'canceled' && ultimo('PATCH').url === '/orders/or_3/closed', 'voltar cancela o pedido na maquininha');

  // ---- pagou no último segundo e saiu da tela: não cancela e fica no registro ----
  await pg.click('[data-forma=cartao]'); await pg.waitForTimeout(300);
  await pg.click('[data-tipo-cartao=credit]'); await pg.waitForTimeout(600);
  aprovarNaConsulta = 1;
  await pg.click('#tela-cartao [data-voltar]'); await pg.waitForTimeout(1500);
  ok(!chamadas.some(c => c.metodo === 'PATCH' && c.url === '/orders/or_4/closed' && c.corpo.status === 'canceled'), 'pedido pago não é cancelado');
  const logs = path.join(dadosDir, 'logs');
  const log = fs.existsSync(logs) ? fs.readdirSync(logs).map(f => fs.readFileSync(path.join(logs, f), 'utf8')).join('') : '';
  ok(log.includes('APROVADO depois que o cliente saiu da tela'), 'pagamento aprovado depois da desistência vai para o registro de erros');

  // ---- Stone fora do ar: totem cai para o modo manual ----
  servidor.close(); servidor.closeAllConnections?.();
  await pg.click('[data-forma=cartao]'); await pg.waitForTimeout(300);
  await pg.click('[data-tipo-cartao=debit]'); await pg.waitForTimeout(1500);
  ok(await pg.evaluate(() => document.querySelector('#tela-cartao').dataset.modo) === 'manual', 'sem conexão com a Stone: volta para a maquininha avulsa com PIN');

  ok(!erros.length, 'sem erros no console' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await app.close();
  fim();
})().catch(e => { console.error(e); process.exit(1); });
