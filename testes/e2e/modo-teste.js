// Modo teste: vendas marcadas não entram em relatório, fechamento, indicadores nem planilha;
// apagar vendas de teste e zerar todas as vendas (com cópia de segurança).
const fs = require('fs'), path = require('path');
const ExcelJS = require('exceljs');
const { abrir, verificador, SAIDA } = require('./_base');
const { ok, fim } = verificador('modo-teste');

(async () => {
  const { app, pg, erros, shot, entrar, set, dadosDir } = await abrir('modo-teste');
  await entrar('1234');
  const prods = await pg.evaluate(() => pdv.produtos());
  const cafe = prods.find(p => p.nome === 'Café Expresso').id;
  const vender = (forma = 'pix', status = 'paga') => pg.evaluate(([id, f, st]) => pdv.registrarVenda({ itens: [{ id, qtd: 1 }], formaPagamento: f, status: st }), [cafe, forma, status]);
  await vender(); // 1 venda de verdade (R$ 5,00)
  // liga o modo teste pela tela
  await pg.evaluate(() => trocarAba('config')); await pg.waitForTimeout(600);
  await pg.check('#form-config [name=modoTesteVendas]');
  await pg.click('#form-config button[type=submit]'); await pg.waitForTimeout(500);
  await pg.evaluate(() => carregarDados()); await pg.waitForTimeout(300);
  ok(await pg.isVisible('#faixa-teste'), 'totem mostra a faixa MODO TESTE');
  const t1 = await vender(); const t2 = await vender('caixa', 'aguardando_caixa');
  ok(t1.venda.teste && t1.venda.numero === 900001 && t2.venda.numero === 900002, 'venda de teste marcada e com numeração própria (900001…)');
  // relatórios
  const lista = await pg.evaluate(() => pdv.vendas({}));
  ok(lista.length === 1 && !lista.some(v => v.teste), 'lista de vendas/relatórios só tem a venda de verdade');
  const ind = await pg.evaluate(() => pdv.indicadores({}));
  ok(ind.vendas === 1 && ind.faturamentoCentavos === 500, 'indicadores ignoram o teste');
  const fech = await pg.evaluate(() => pdv.resumoFechamento());
  ok(fech.totalCentavos === 500 && fech.vendasPagas === 1 && fech.aguardando === 0, 'fechamento de caixa ignora o teste');
  const exp = path.join(SAIDA, 'modo-teste', 'arquivos', 'vendas.xlsx'); await set('__salvar', exp);
  await pg.evaluate(() => pdv.exportarVendas({}));
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(exp);
  const nums = []; wb.worksheets[0].eachRow((r, i) => { if (i > 1 && typeof r.getCell(1).value === 'number') nums.push(r.getCell(1).value); });
  ok(nums.join() === '1', 'planilha de vendas sem o teste: ' + nums.join());
  // o pedido de teste do balcão aparece para receber (para treinar), marcado
  await pg.evaluate(() => trocarAba('vendas')); await pg.waitForTimeout(600);
  ok((await pg.textContent('#tabela-aguardando')).includes('teste'), 'pedido de teste do balcão aparece para treinar, com selo');
  await shot('1-vendas');
  // apagar vendas de teste
  await pg.evaluate(() => trocarAba('config')); await pg.waitForTimeout(600);
  ok((await pg.textContent('#info-teste')).includes('1 venda(s) de verdade e 2 de teste'), 'Configurações mostra quantas são de teste');
  pg.once('dialog', d => d.accept());
  await pg.click('#btn-apagar-teste'); await pg.waitForTimeout(600);
  const todas = await pg.evaluate(() => pdv.vendas({ incluirTeste: true }));
  ok(todas.length === 1 && !todas[0].teste, 'apagar vendas de teste deixa só a de verdade');
  await shot('2-config');
  // zerar tudo
  pg.on('dialog', d => d.accept());
  await pg.click('#btn-zerar-vendas'); await pg.waitForTimeout(800);
  ok((await pg.evaluate(() => pdv.vendas({ incluirTeste: true }))).length === 0, 'zerar apaga todas as vendas');
  const copias = fs.readdirSync(path.join(dadosDir, 'backups')).filter(f => f.startsWith('antes-de-zerar-vendas'));
  ok(copias.length === 1, 'cópia de segurança antes de zerar');
  await pg.uncheck('#form-config [name=modoTesteVendas]');
  await pg.click('#form-config button[type=submit]'); await pg.waitForTimeout(400);
  const nova = await vender();
  ok(nova.venda.numero === 1 && !nova.venda.teste, 'depois de zerar e desligar o teste, a numeração volta para 1');
  ok(!erros.length, 'sem erros no console' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await app.close();
  fim();
})().catch(e => { console.error(e); process.exit(1); });
