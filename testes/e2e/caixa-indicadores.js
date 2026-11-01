// Dinheiro no balcão, fluxo de caixa, indicadores, PIN do admin protegido, restaurar backup e registro de erros
const fs = require('fs'), path = require('path');
const { abrir, verificador } = require('./_base');
const { ok, fim } = verificador('caixa-indicadores');

(async () => {
  const { app, pg, erros, shot, entrar, dadosDir } = await abrir('caixa-indicadores');
  const dadosArq = path.join(dadosDir, 'dados.json');
  const lerDados = () => JSON.parse(fs.readFileSync(dadosArq, 'utf8'));

  // ---- PIN do admin nunca em texto ----
  let d = lerDados();
  ok(!('pinAdmin' in d.config) && /^[0-9a-f]+:[0-9a-f]+$/.test(d.config.pinAdminHash) && d.config.pinAdminPadrao === true, 'PIN do admin guardado só como hash (padrão marcado)');
  await entrar('1234');
  await pg.evaluate(() => trocarAba('config')); await pg.waitForTimeout(600);
  ok(await pg.isVisible('#aviso-pin-padrao'), 'aviso para trocar o PIN de fábrica');
  ok(await pg.inputValue('#form-config [name=pinAdmin]') === '', 'campo do PIN não mostra o PIN atual');
  // salvar sem digitar PIN mantém o atual e liga o "pagar no caixa" (a loja aceita dinheiro)
  await pg.check('#form-config [name=formaCaixa]');
  await pg.click('#form-config button[type=submit]'); await pg.waitForTimeout(500);
  ok((await pg.evaluate(() => pdv.configAdmin())).formasTotem.caixa === true, 'salvar sem PIN funciona (mantém o atual)');
  await pg.fill('#form-config [name=pinAdmin]', '4321');
  await pg.click('#form-config button[type=submit]'); await pg.waitForTimeout(500);
  const texto = fs.readFileSync(dadosArq, 'utf8');
  ok(!texto.includes('"4321"') && !lerDados().config.pinAdminPadrao, 'PIN novo gravado só como hash');
  ok(!(await pg.evaluate(() => pdv.configAdmin())).pinAdminHash, 'hash do PIN não vai para a tela');
  await pg.click('#btn-sair-admin'); await pg.waitForTimeout(300);
  ok(await pg.evaluate(() => pdv.entrarPainel('1234').then(() => 'entrou', e => e.message)) === 'PIN incorreto', 'PIN antigo não entra mais');

  // ---- vendas: PIX no totem + 2 pedidos "pagar no caixa" ----
  await pg.evaluate(() => carregarDados()); await pg.waitForTimeout(300);
  const prods = await pg.evaluate(() => pdv.produtos());
  const id = n => prods.find(p => p.nome === n).id;
  await pg.evaluate(async ([a, b]) => {
    await pdv.registrarVenda({ itens: [{ id: a, qtd: 2 }], formaPagamento: 'pix', status: 'paga' });       // 2 cafés  = 10,00
    await pdv.registrarVenda({ itens: [{ id: b, qtd: 1 }], formaPagamento: 'caixa', status: 'aguardando_caixa' }); // feijoada = 25,00
    await pdv.registrarVenda({ itens: [{ id: a, qtd: 1 }], formaPagamento: 'caixa', status: 'aguardando_caixa' }); // café = 5,00
  }, [id('Café Expresso'), id('Feijoada')]);

  // ---- atendente/admin recebe no balcão ----
  await entrar('4321');
  await pg.evaluate(() => trocarAba('vendas')); await pg.waitForTimeout(500);
  const pedidos = await pg.$$eval('[data-pagar]', b => b.map(x => Number(x.dataset.pagar)));
  ok(pedidos.length === 2, 'dois pedidos aguardando no balcão');
  await pg.click(`[data-pagar="${pedidos[0]}"]`); await pg.waitForTimeout(300);
  ok(await pg.isVisible('#modal-receber') && await pg.isDisabled('#btn-receber-confirmar'), 'receber pede a forma antes de confirmar');
  await pg.click('[data-receber=dinheiro]');
  await pg.fill('#receber-valor', '50'); await pg.waitForTimeout(100);
  ok((await pg.textContent('#receber-troco-valor')).replace(/\s/g, ' ') === 'R$ 25,00', 'troco calculado: R$ 25,00');
  await shot('1-receber-dinheiro');
  await pg.click('#btn-receber-confirmar'); await pg.waitForTimeout(600);
  await pg.click(`[data-pagar="${pedidos[1]}"]`); await pg.waitForTimeout(300);
  await pg.click('[data-receber=cartao]'); await pg.click('#btn-receber-confirmar'); await pg.waitForTimeout(600);
  const vendas = await pg.evaluate(() => pdv.vendas({}));
  ok(vendas.find(v => v.numero === pedidos[0]).recebidoComo === 'dinheiro' && vendas.find(v => v.numero === pedidos[1]).recebidoComo === 'cartao', 'venda guarda como foi recebida no balcão');
  const resumo = await pg.evaluate(() => pdv.resumoFechamento());
  ok(resumo.dinheiroCentavos === 2500 && resumo.caixaCentavos === 3000, 'fechamento mostra o dinheiro da gaveta (R$ 25,00)');

  // ---- indicadores ----
  await pg.evaluate(() => trocarAba('indicadores')); await pg.waitForTimeout(700);
  const cards = (await pg.textContent('#ind-cards')).replace(/\s+/g, ' ');
  ok(cards.includes('R$ 40,00') && cards.includes('Vendas pagas3') && cards.includes('R$ 13,33'), 'cards: faturamento R$ 40, 3 vendas, ticket R$ 13,33 — ' + cards.slice(0, 120));
  const fluxo = (await pg.textContent('#ind-fluxo')).replace(/\s+/g, ' ');
  ok(fluxo.includes('R$ 25,00') && fluxo.includes('R$ 10,00') && fluxo.includes('R$ 5,00') && fluxo.includes('R$ 40,00'), 'fluxo do dia: dinheiro 25, PIX 10, cartão 5, total 40');
  const meio = (await pg.textContent('#ind-meio')).replace(/\s+/g, ' ');
  ok(/Dinheiro.*63%/.test(meio) && /PIX.*25%/.test(meio), 'entradas por forma com percentual: ' + meio);
  ok((await pg.textContent('#ind-top')).includes('Café Expresso') && (await pg.textContent('#ind-categoria')).includes('Empório'), 'mais vendidos e faturamento por seção');
  await shot('2-indicadores-hoje');
  await pg.click('[data-periodo="7"]'); await pg.waitForTimeout(600);
  ok(await pg.$$eval('#ind-fluxo tr', t => t.length) === 7 && await pg.isVisible('#ind-fluxo-grafico svg'), '7 dias: uma linha por dia e gráfico de entradas');
  await shot('3-indicadores-7dias');

  // ---- backup e restauração ----
  await pg.evaluate(() => trocarAba('config')); await pg.waitForTimeout(600);
  await pg.click('#btn-backup-agora'); await pg.waitForTimeout(600);
  await pg.evaluate(() => carregarBackups()); await pg.waitForTimeout(300);
  const feij = prods.find(p => p.nome === 'Feijoada');
  await pg.evaluate(p => pdv.salvarProduto({ ...p, precoCentavos: 9900 }), feij);
  pg.once('dialog', dl => dl.accept());
  await pg.click('#btn-restaurar-backup'); await pg.waitForTimeout(900);
  const depois = (await pg.evaluate(() => pdv.produtos())).find(p => p.id === feij.id);
  ok(depois.precoCentavos === 2500, 'restaurar backup volta o preço da Feijoada');
  const pastaSeg = path.join(dadosDir, 'backups', 'seguranca');
  ok(fs.existsSync(pastaSeg) && fs.readdirSync(pastaSeg).length === 1, 'estado anterior guardado antes de restaurar');

  // ---- bloqueio de PIN e registro de erros ----
  await pg.click('#btn-sair-admin'); await pg.waitForTimeout(300);
  for (let i = 0; i < 5; i++) await pg.evaluate(() => pdv.entrarPainel('0001').catch(() => {}));
  const bloqueio = await pg.evaluate(() => pdv.entrarPainel('4321').then(() => 'entrou', e => e.message));
  ok(/Muitos PINs errados/.test(bloqueio), '5 PINs errados bloqueiam até o PIN certo: ' + bloqueio);
  const logs = path.join(dadosDir, 'logs');
  const log = fs.existsSync(logs) ? fs.readdirSync(logs).map(f => fs.readFileSync(path.join(logs, f), 'utf8')).join('') : '';
  ok(log.includes('[seguranca]') && log.includes('[backup] Backup restaurado'), 'registro de erros guarda o bloqueio e a restauração');

  ok(!erros.length, 'sem erros no console' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await app.close();
  fim();
})().catch(e => { console.error(e); process.exit(1); });
