// Catálogo do Empório já cadastrado, modelo de planilha, filtros, preço rápido, ações em massa e duplicar
const path = require('path'), fs = require('fs');
const ExcelJS = require('exceljs');
const { abrir, verificador, SAIDA } = require('./_base');
const { ok, fim } = verificador('catalogo-admin');
const OUT = path.join(SAIDA, 'catalogo-admin');
(async () => {
  const { app, pg, erros, set, shot } = await abrir('catalogo-admin');
  // ---- catálogo inicial ----
  const prods = await pg.evaluate(() => pdv.produtos());
  ok(prods.length === 28, `abre com os 28 produtos do Empório (veio ${prods.length})`);
  ok(prods.every(p => p.imagem && fs.existsSync(p.imagem)), 'todos com foto copiada para a pasta do sistema');
  ok(prods.every(p => p.precoExemplo && p.precoCentavos > 0), 'todos com preço de exemplo marcado');
  const shake = prods.find(p => p.nome === 'Shake Protein Premium');
  ok(shake && shake.opcoes[0].itens.length === 6 && shake.opcoes[0].itens[0].descricao.startsWith('Suco de maçã'), 'Shake Protein Premium com 6 sabores e ingredientes');
  ok(!prods.some(p => /Whey Protein Concentrado/.test(p.nome)), 'sem os produtos fictícios de suplementos');
  await pg.click('#btn-comecar'); await pg.waitForTimeout(500);
  const cats = await pg.$$eval('[data-cat]', b => b.map(x => x.dataset.cat));
  ok(['Salgados', 'Refeições', 'Shakes', 'Sucos', 'Cafés', 'Sobremesas', 'Bebidas'].every(c => cats.includes(c)) && !cats.includes('Proteínas'),
    'totem mostra as categorias do Empório (e esconde as vazias): ' + cats.join(', '));
  await pg.click('[data-cat="Bebidas"]'); await pg.waitForTimeout(400);
  ok(await pg.$$eval('.card-produto.esgotado', e => e.length) === 0, 'latas não aparecem esgotadas (estoque desligado na Lisufit)');
  await shot('1-totem-bebidas');
  await pg.evaluate(() => mostrarTela('inicio')).catch(() => {});

  // ---- admin ----
  pg.evaluate(() => { abrirAdmin(); }); await pg.waitForSelector('#modal-pin.aberto'); await pg.keyboard.type('1234'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(700);
  ok(await pg.isVisible('#aviso-exemplo') && (await pg.textContent('#aviso-exemplo')).includes('28'), 'aviso: 28 produtos com preço de exemplo');
  await shot('2-admin-lista');

  // preço rápido
  const cafe = prods.find(p => p.nome === 'Café Expresso');
  await pg.fill(`[data-preco="${cafe.id}"]`, '6,50'); await pg.press(`[data-preco="${cafe.id}"]`, 'Enter'); await pg.waitForTimeout(500);
  let c2 = (await pg.evaluate(() => pdv.produtos())).find(p => p.id === cafe.id);
  ok(c2.precoCentavos === 650 && !c2.precoExemplo, 'preço rápido: Café Expresso R$ 6,50 e sai do "exemplo"');
  const croi = prods.find(p => p.nome === 'Croissant');
  await pg.press(`[data-preco="${croi.id}"]`, 'Enter'); await pg.waitForTimeout(500);
  c2 = (await pg.evaluate(() => pdv.produtos())).find(p => p.id === croi.id);
  ok(c2.precoCentavos === 900 && !c2.precoExemplo, 'Enter sem mudar confirma o preço de exemplo');
  // formulário salvo sem mexer no preço mantém o "exemplo"
  const misto = prods.find(p => p.nome === 'Misto Quente');
  await pg.click(`[data-editar="${misto.id}"]`); await pg.waitForTimeout(300);
  await pg.click('#form-produto button[type=submit]'); await pg.waitForTimeout(500);
  c2 = (await pg.evaluate(() => pdv.produtos())).find(p => p.id === misto.id);
  ok(c2.precoExemplo, 'salvar o formulário sem mudar o preço mantém o selo de exemplo');

  // filtros
  await pg.selectOption('#filtro-estoque-admin', 'exemplo'); await pg.waitForTimeout(300);
  ok(await pg.$$eval('#tabela-produtos tr', t => t.length) === 26, 'filtro "Preço de exemplo": 26');
  await pg.selectOption('#filtro-estoque-admin', ''); await pg.selectOption('#filtro-categoria-admin', 'Bebidas'); await pg.waitForTimeout(300);
  ok(await pg.$$eval('#tabela-produtos tr', t => t.length) === 6, 'filtro por categoria Bebidas: 6');

  // ações em massa: selecionar todas as bebidas, ocultar, mudar categoria, confirmar preço
  await pg.check('#sel-todos'); await pg.waitForTimeout(300);
  ok(await pg.isVisible('#barra-massa') && (await pg.textContent('#massa-qtd')).includes('6'), 'barra de ações com 6 selecionados');
  await shot('3-massa');
  await pg.click('[data-massa=ocultar]'); await pg.waitForTimeout(500);
  let bebidas = (await pg.evaluate(() => pdv.produtos())).filter(p => p.categoria === 'Bebidas');
  ok(bebidas.every(p => !p.ativo), 'ocultar em massa');
  await pg.click('[data-massa=mostrar]'); await pg.waitForTimeout(500);
  await pg.click('[data-massa=confirmarPreco]'); await pg.waitForTimeout(500);
  bebidas = (await pg.evaluate(() => pdv.produtos())).filter(p => p.categoria === 'Bebidas');
  ok(bebidas.every(p => p.ativo && !p.precoExemplo), 'mostrar e confirmar preço em massa');
  await pg.click('[data-massa=limpar]'); await pg.selectOption('#filtro-categoria-admin', ''); await pg.waitForTimeout(300);
  // chave "no totem" direto na linha
  const feij = prods.find(p => p.nome === 'Feijoada');
  await pg.click(`tr:has([data-ativo="${feij.id}"]) .chave`); await pg.waitForTimeout(500);
  ok((await pg.evaluate(() => pdv.produtos())).find(p => p.id === feij.id).ativo === false, 'chave "No totem" oculta a Feijoada');
  // mudar categoria em massa
  const sucos = prods.filter(p => p.nome.startsWith('Suco Desintox'));
  for (const s of sucos) await pg.check(`[data-sel="${s.id}"]`);
  await pg.selectOption('#massa-categoria', 'Shakes'); await pg.waitForTimeout(500);
  ok((await pg.evaluate(() => pdv.produtos())).filter(p => p.nome.startsWith('Suco Desintox')).every(p => p.categoria === 'Shakes'), 'mudar categoria em massa');
  await pg.click('[data-massa=limpar]');

  // duplicar
  const sal = prods.find(p => p.nome === 'Salada de Fruta com Iogurte 500ml');
  await pg.click(`[data-duplicar="${sal.id}"]`); await pg.waitForTimeout(300);
  ok((await pg.textContent('#produto-titulo')).includes('cópia') && await pg.inputValue('#form-produto [name=nome]') === 'Salada de Fruta com Iogurte 500ml (cópia)', 'duplicar abre o formulário como novo');
  await pg.fill('#form-produto [name=nome]', 'Salada de Fruta com Iogurte 700ml'); await pg.fill('#form-produto [name=preco]', '19,90');
  await pg.click('#form-produto button[type=submit]'); await pg.waitForTimeout(500);
  const todos = await pg.evaluate(() => pdv.produtos());
  const nova = todos.find(p => p.nome === 'Salada de Fruta com Iogurte 700ml');
  ok(todos.length === 29 && nova && nova.imagem === sal.imagem && nova.categoria === 'Sobremesas' && !nova.precoExemplo, 'cópia salva com a foto e a categoria do original');

  // ---- modelo de planilha ----
  const modelo = path.join(OUT, 'arquivos', 'modelo.xlsx'); fs.rmSync(modelo, { force: true });
  await set('__salvar', modelo);
  await pg.click('.menu-planilha summary'); await pg.waitForTimeout(200); await shot('4-menu-planilha');
  await pg.click('#btn-modelo-produtos'); await pg.waitForTimeout(1000);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(modelo);
  const ws = wb.worksheets[0]; const linhas = [];
  ws.eachRow(r => linhas.push(r.getCell(1).value));
  ok(linhas[0] === 'Nome' && linhas.slice(1).every(n => String(n).startsWith('(exemplo)')) && linhas.length === 5 && wb.worksheets[1].name === 'Como preencher',
    'modelo: cabeçalho, 4 linhas de exemplo e aba de ajuda');
  // importar o modelo como veio: nada entra; com uma linha real a mais, só ela entra
  ws.addRow(['Tapioca de Frango', '', '', 12, 4.5, 'Salgados', 'Empório', '', '', 'Sim', 'Sim']);
  await wb.xlsx.writeFile(modelo);
  await set('__abrir', modelo);
  await pg.click('.menu-planilha summary'); await pg.click('#btn-importar-produtos'); await pg.waitForTimeout(800);
  const resumo = (await pg.textContent('#importar-resumo')).replace(/\s+/g, ' ');
  ok(/novos ?1/.test(resumo) && /problema ?0/.test(resumo), 'importar modelo: linhas de exemplo ignoradas, só a Tapioca entra — ' + resumo);
  await pg.click('#btn-importar-confirmar'); await pg.waitForTimeout(600);
  ok((await pg.evaluate(() => pdv.produtos())).length === 30, 'produtos que não estavam na planilha continuam cadastrados');
  ok((await pg.evaluate(() => pdv.produtos())).find(p => p.nome === 'Tapioca de Frango').custoCentavos === 450, 'coluna Custo importada (R$ 4,50)');
  // importar preço pela planilha tira o "exemplo"
  const exp = path.join(OUT, 'arquivos', 'export.xlsx'); await set('__salvar', exp);
  await pg.click('.menu-planilha summary'); await pg.click('#btn-exportar-produtos'); await pg.waitForTimeout(1000);
  const w2 = new ExcelJS.Workbook(); await w2.xlsx.readFile(exp);
  w2.worksheets[0].eachRow(r => { if (r.getCell(1).value === 'Empada de Frango') r.getCell(4).value = 7.5; });
  await w2.xlsx.writeFile(exp); await set('__abrir', exp);
  await pg.click('.menu-planilha summary'); await pg.click('#btn-importar-produtos'); await pg.waitForTimeout(800);
  await pg.click('#btn-importar-confirmar'); await pg.waitForTimeout(600);
  const emp = (await pg.evaluate(() => pdv.produtos())).find(p => p.nome === 'Empada de Frango');
  ok(emp.precoCentavos === 750 && !emp.precoExemplo, 'preço vindo da planilha conta como definitivo');
  ok(!(await pg.isVisible('.menu-planilha-itens')), 'menu da planilha fecha depois de usar');
  await pg.selectOption('#filtro-estoque-admin', 'exemplo'); await pg.waitForTimeout(300); await shot('5-filtro-exemplo');
  ok(!erros.length, 'sem erros no console' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await app.close();
  fim();
})().catch(e => { console.error(e); process.exit(1); });
