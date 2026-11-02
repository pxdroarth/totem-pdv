// Conector Mercado Pago (Point em modo PDV, API Orders) contra uma API falsa: acha a maquininha pelo S/N,
// coloca em modo PDV, cartão crédito/débito e PIX na maquininha, recusa, desistência e pagamento tardio.
const http = require('http'), fs = require('fs'), path = require('path');
const { abrir, verificador } = require('./_base');
const { ok, fim } = verificador('mercadopago');

const TOKEN = 'TEST-1234-lisufit';
const SERIAL = '1733216565', TERMINAL = 'PAX_Q92__' + SERIAL;
let modoTerminal = 'STANDALONE';
const orders = new Map(); const chamadas = [];
let aprovarNaConsulta = 2, recusar = false;
const servidor = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', c => (corpo += c));
  req.on('end', () => {
    const json = corpo ? JSON.parse(corpo) : null;
    chamadas.push({ metodo: req.method, url: req.url, corpo: json, idem: req.headers['x-idempotency-key'], cancelavel: req.headers['x-allow-cancelable-status'] });
    const responder = (st, obj) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (req.headers.authorization !== 'Bearer ' + TOKEN) return responder(401, { message: 'invalid access token' });
    if (req.method === 'GET' && req.url.startsWith('/terminals/v1/list'))
      return responder(200, { data: { terminals: [{ id: 'NEWLAND_N950__N950NCB000000001', operating_mode: 'PDV' }, { id: TERMINAL, pos_id: 1, store_id: '9', operating_mode: modoTerminal }] } });
    if (req.method === 'PATCH' && req.url === '/terminals/v1/setup') { modoTerminal = json.terminals[0].operating_mode; return responder(200, json); }
    if (req.method === 'POST' && req.url === '/v1/orders') {
      if (json.config.point.terminal_id !== TERMINAL) return responder(400, { errors: [{ code: 'invalid_terminal', message: 'terminal inválido' }] });
      const id = 'ORD0000' + (orders.size + 1);
      orders.set(id, { id, corpo: json, consultas: 0, status: 'created' });
      return responder(201, { id, status: 'created', status_detail: 'created', transactions: { payments: [{ id: 'PAY' + id, amount: json.transactions.payments[0].amount, status: 'created' }] } });
    }
    const m = req.url.match(/^\/v1\/orders\/(ORD\d+)(\/cancel)?$/);
    const o = m && orders.get(m[1]);
    if (!o) return responder(404, { message: 'order not found' });
    if (req.method === 'POST' && m[2]) {
      if (o.status === 'processed') return responder(409, { errors: [{ code: 'cannot_cancel_order', message: 'order processed' }] });
      o.status = 'canceled'; return responder(200, { id: o.id, status: 'canceled' });
    }
    if (req.method === 'GET') {
      o.consultas++;
      if (['created', 'at_terminal'].includes(o.status)) o.status = o.consultas >= aprovarNaConsulta ? (recusar ? 'failed' : 'processed') : 'at_terminal';
      const tipo = o.corpo.config.payment_method.default_type;
      const pag = { id: 'PAY' + o.id, status: o.status, status_detail: o.status === 'failed' ? 'insufficient_amount' : o.status === 'processed' ? 'accredited' : o.status,
        reference_id: '7766' + o.id.slice(-1), payment_method: o.status === 'processed' ? { id: tipo === 'qr' ? 'pix' : tipo === 'debit_card' ? 'debmaster' : 'visa', type: tipo } : undefined };
      return responder(200, { id: o.id, status: o.status, status_detail: o.status, transactions: { payments: [pag] } });
    }
    responder(405, { message: 'método' });
  });
});

(async () => {
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  process.env.PDV_MP_API = `http://127.0.0.1:${servidor.address().port}`;
  const { app, pg, erros, shot, entrar, dadosDir } = await abrir('mercadopago');
  const ultimo = (metodo, filtro = () => true) => chamadas.filter(c => c.metodo === metodo && filtro(c)).at(-1);

  // ---- admin: testar conexão acha a Point pelo S/N e liga o modo PDV ----
  await entrar('1234');
  const provs = await pg.evaluate(() => pdv.provedoresPagamento());
  ok(provs.some(p => p.id === 'mercadopago' && p.pixNaMaquininha), 'Mercado Pago aparece na lista de gateways');
  const errada = await pg.evaluate(() => pdv.testarProvedor('mercadopago', { accessToken: 'TEST-errado', serialMaquininha: '1' }).then(r => r.mensagem, e => e.message));
  ok(/Access Token recusado/.test(errada), 'token errado: mensagem clara');
  const outra = await pg.evaluate(t => pdv.testarProvedor('mercadopago', { accessToken: t, serialMaquininha: '999' }).then(r => r.mensagem, e => e.message), TOKEN);
  ok(/999 não está nesta conta.*Encontrei/.test(outra), 'S/N errado: lista as maquininhas da conta — ' + outra);
  const certa = await pg.evaluate(([t, s]) => pdv.testarProvedor('mercadopago', { accessToken: t, serialMaquininha: s }).then(r => r.mensagem, e => e.message), [TOKEN, SERIAL]);
  ok(/TESTE/.test(certa) && certa.includes(TERMINAL) && /DESLIGUE E LIGUE/.test(certa) && modoTerminal === 'PDV', 'acha a Point pelo S/N e coloca em modo PDV — ' + certa);
  await pg.evaluate(([t, s]) => pdv.salvarConfig({ pagamentos: { provedorPix: 'mercadopago', provedorCartao: 'mercadopago', permitirManualSeFalhar: true,
    credenciais: { mercadopago: { accessToken: t, serialMaquininha: s, tipoCartao: 'perguntar', imprimirNaMaquininha: 'nao' } } } }), [TOKEN, SERIAL]);
  await pg.evaluate(() => trocarAba('config')); await pg.waitForTimeout(700);
  await shot('1-config');
  await pg.click('#btn-sair-admin'); await pg.waitForTimeout(300);
  await pg.evaluate(() => carregarDados()); await pg.waitForTimeout(300);
  const cfg = await pg.evaluate(() => estado.config.pagamentos);
  ok(cfg.cartao === 'mercadopago' && cfg.pixNaMaquininha && cfg.perguntarTipoCartao && !JSON.stringify(cfg).includes(TOKEN), 'totem configurado, sem receber o token');

  const comprarCafe = async () => {
    await pg.evaluate(() => mostrarTela('inicio')); await pg.waitForTimeout(200);
    await pg.click('#btn-comecar'); await pg.waitForTimeout(300);
    await pg.click('[data-cat="Cafés"]'); await pg.waitForTimeout(300);
    const cafe = await pg.evaluate(() => estado.produtos.find(p => p.nome === 'Café Expresso').id);
    await pg.click(`.card-produto[data-id="${cafe}"]`); await pg.waitForTimeout(300);
    await pg.click('#btn-finalizar'); await pg.waitForTimeout(400);
  };
  const esperarFim = async () => { for (let i = 0; i < 40 && await pg.evaluate(() => document.body.dataset.tela) !== 'fim'; i++) await pg.waitForTimeout(500); };
  const vendas = () => pg.evaluate(async () => { await pdv.entrarPainel('1234'); const v = await pdv.vendas({}); await pdv.sairPainel(); return v; });

  // ---- débito ----
  await comprarCafe();
  await pg.click('[data-forma=cartao]'); await pg.waitForTimeout(300);
  ok(await pg.isVisible('#cartao-tipo'), 'pergunta crédito ou débito');
  await pg.click('[data-tipo-cartao=debit]'); await pg.waitForTimeout(800);
  const post = ultimo('POST', c => c.url === '/v1/orders');
  ok(post.corpo.type === 'point' && post.corpo.config.point.terminal_id === TERMINAL && post.corpo.config.payment_method.default_type === 'debit_card' &&
    post.corpo.transactions.payments[0].amount === '5.00' && post.corpo.config.point.print_on_terminal === 'no_ticket' && post.idem && /^[A-Za-z0-9_-]+$/.test(post.corpo.external_reference),
    'order point: débito, "5.00", terminal certo, sem comprovante, com chave de idempotência');
  await esperarFim();
  let venda = (await vendas()).at(-1);
  ok(venda?.formaPagamento === 'cartao' && venda.pagamento?.provedor === 'mercadopago' && venda.pagamento.bandeira === 'Mastercard' && venda.pagamento.nsu,
    'aprovado: venda gravada com bandeira e referência do Mercado Pago');

  // ---- PIX na maquininha ----
  await comprarCafe();
  await pg.click('[data-forma=pix]'); await pg.waitForTimeout(800);
  ok(await pg.evaluate(() => document.querySelector('#tela-pix').dataset.maquininha) === '1' && ultimo('POST', c => c.url === '/v1/orders').corpo.config.payment_method.default_type === 'qr',
    'PIX: order com QR na maquininha');
  await shot('2-pix');
  await esperarFim();
  venda = (await vendas()).at(-1);
  ok(venda.formaPagamento === 'pix' && venda.pagamento?.bandeira === 'PIX', 'PIX aprovado e gravado');

  // ---- crédito recusado: mostra o motivo ----
  recusar = true;
  await comprarCafe();
  await pg.click('[data-forma=cartao]'); await pg.waitForTimeout(300);
  await pg.click('[data-tipo-cartao=credit]'); await pg.waitForTimeout(800);
  const cred = ultimo('POST', c => c.url === '/v1/orders').corpo.config.payment_method;
  ok(cred.default_type === 'credit_card' && cred.default_installments === 1, 'crédito à vista');
  for (let i = 0; i < 20 && !(await pg.isVisible('#btn-cartao-tentar')); i++) await pg.waitForTimeout(500);
  ok((await pg.textContent('#cartao-status')).includes('saldo insuficiente'), 'recusa mostra o motivo: ' + (await pg.textContent('#cartao-status')).trim());
  await shot('3-recusado');
  recusar = false;

  // ---- desistência cancela a order na maquininha ----
  aprovarNaConsulta = 99;
  await pg.click('#btn-cartao-tentar'); await pg.waitForTimeout(300);
  await pg.click('[data-tipo-cartao=debit]'); await pg.waitForTimeout(800);
  const idDesistencia = [...orders.keys()].at(-1);
  await pg.click('#tela-cartao [data-voltar]'); await pg.waitForTimeout(1200);
  const canc = ultimo('POST', c => c.url.endsWith('/cancel'));
  ok(canc?.url === `/v1/orders/${idDesistencia}/cancel` && canc.cancelavel === 'at_terminal' && orders.get(idDesistencia).status === 'canceled', 'voltar cancela a order na maquininha');

  // ---- pagou no último segundo: não cancela, vai para o registro ----
  await pg.click('[data-forma=cartao]'); await pg.waitForTimeout(300);
  await pg.click('[data-tipo-cartao=credit]'); await pg.waitForTimeout(600);
  const idTardio = [...orders.keys()].at(-1);
  aprovarNaConsulta = 1;
  await pg.click('#tela-cartao [data-voltar]'); await pg.waitForTimeout(1500);
  ok(orders.get(idTardio).status === 'processed' && !chamadas.some(c => c.url === `/v1/orders/${idTardio}/cancel`), 'order paga não é cancelada');
  const logs = path.join(dadosDir, 'logs');
  const log = fs.existsSync(logs) ? fs.readdirSync(logs).map(f => fs.readFileSync(path.join(logs, f), 'utf8')).join('') : '';
  ok(log.includes('APROVADO depois que o cliente saiu da tela'), 'pagamento tardio vai para o registro de erros');

  // ---- Mercado Pago fora do ar: modo manual ----
  servidor.close(); servidor.closeAllConnections?.();
  await pg.click('[data-forma=cartao]'); await pg.waitForTimeout(300);
  await pg.click('[data-tipo-cartao=debit]'); await pg.waitForTimeout(1500);
  ok(await pg.evaluate(() => document.querySelector('#tela-cartao').dataset.modo) === 'manual', 'sem conexão: volta para a maquininha avulsa com PIN');

  ok(!erros.length, 'sem erros no console' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await app.close();
  fim();
})().catch(e => { console.error(e); process.exit(1); });
