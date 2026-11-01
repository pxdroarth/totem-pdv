// Produto com vários sabores (código por sabor), formas de pagamento no totem e estoque desligado
const path = require('path'), fs = require('fs');
const ExcelJS = require('exceljs');
const { abrir, verificador, SAIDA } = require('./_base');
const { ok, fim } = verificador('sabores-pagamentos');

(async () => {
  const ARQ = path.join(SAIDA, 'sabores-pagamentos-planilha'); fs.rmSync(ARQ, { recursive: true, force: true }); fs.mkdirSync(ARQ, { recursive: true });
  // planilha como a loja vai mandar: uma linha por sabor
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Produtos');
  ws.addRow(['Nome', 'Sabor', 'Código de barras', 'Preço', 'Categoria', 'Seção']);
  ws.addRow(['Whey Isolado Pro Fit 900g', 'Chocolate', '7891000000011', '199,90', 'Proteínas', 'Suplementos']);
  ws.addRow(['Whey Isolado Pro Fit 900g', 'Baunilha', '7891000000028', '199,90', 'Proteínas', 'Suplementos']);
  ws.addRow(['Whey Isolado Pro Fit 900g', 'Cookies', '7891000000035', '209,90', 'Proteínas', 'Suplementos']);
  ws.addRow(['Creatina Pro Fit 300g', '', '7891000000042', '99,90', 'Creatina', 'Suplementos']);
  ws.addRow(['Sabor com código repetido', 'Morango', '7890000000011', '50', 'Proteínas', '']); // código já do Whey Concentrado
  ws.getColumn(3).numFmt = '@';
  const planilha = path.join(ARQ, 'lisufit.xlsx'); await wb.xlsx.writeFile(planilha);

  const { app, pg, erros, set, shot } = await abrir('sabores-pagamentos', { catalogo: 'exemplo' });
  const pin = async p => { await pg.waitForSelector('#modal-pin.aberto'); await pg.keyboard.type(p); await pg.keyboard.press('Enter'); await pg.waitForTimeout(500); };
  const entrar = async p => { pg.evaluate(() => { abrirAdmin(); }); await pin(p); };
  const ler = async codigo => { await pg.keyboard.type(codigo, { delay: 5 }); await pg.keyboard.press('Enter'); await pg.waitForTimeout(400); };

  // ---- importar planilha com sabores ----
  await entrar('1234');
  await set('__abrir', planilha);
  await pg.evaluate(() => document.querySelector('#btn-importar-produtos').click()); await pg.waitForTimeout(800);
  const resumo = (await pg.textContent('#importar-resumo')).replace(/\s+/g, ' ');
  ok(/novos ?2/.test(resumo), 'prévia: 2 produtos novos (o Pro Fit com 3 sabores conta como 1) — ' + resumo);
  ok((await pg.textContent('#importar-erros')).includes('7890000000011') && (await pg.textContent('#importar-erros')).includes('Whey Protein Concentrado'), 'código repetido é apontado com o produto dono');
  await shot('1-previa');
  await pg.click('#btn-importar-confirmar'); await pg.waitForTimeout(800);
  const prods = await pg.evaluate(() => pdv.produtos());
  const pf = prods.find(p => p.nome === 'Whey Isolado Pro Fit 900g');
  const g = pf?.opcoes?.find(x => x.nome === 'Sabor');
  ok(pf && pf.precoCentavos === 19990 && g && g.min === 1 && g.max === 1 && g.itens.length === 3, 'Pro Fit virou um produto só, R$ 199,90, com grupo Sabor (escolhe 1)');
  ok(g && g.itens.map(i => `${i.nome}:${i.codigoBarras}:${i.precoCentavos}`).join() === 'Chocolate:7891000000011:0,Baunilha:7891000000028:0,Cookies:7891000000035:1000', 'cada sabor com seu código; Cookies +R$ 10,00');

  // editor mostra os códigos; código duplicado é barrado
  await pg.fill('#busca-admin', '7891000000028'); await pg.waitForTimeout(300);
  const linhas = await pg.$$eval('#tabela-produtos tr', t => t.length);
  ok(linhas === 1, 'busca do admin acha o produto pelo código do sabor');
  await pg.click(`[data-editar="${pf.id}"]`); await pg.waitForTimeout(400);
  const cods = await pg.$$eval('.i-codigo', e => e.map(x => x.value));
  ok(cods.join() === '7891000000011,7891000000028,7891000000035', 'editor mostra o código de cada sabor');
  await pg.evaluate(() => document.querySelector('.editor-opcoes').scrollIntoView()); await shot('2-editor');
  await pg.fill('.i-codigo >> nth=0', '7890000000028'); // código do Whey Isolado comum
  await pg.click('#form-produto button[type=submit]'); await pg.waitForTimeout(400);
  ok((await pg.textContent('#toast')).includes('já usado'), 'não deixa usar código de outro produto no sabor');
  await pg.click('#btn-cancelar-produto'); await pg.fill('#busca-admin', '');

  // exportar volta uma linha por sabor
  const exp = path.join(ARQ, 'export.xlsx'); await set('__salvar', exp);
  await pg.evaluate(() => document.querySelector('#btn-exportar-produtos').click()); await pg.waitForTimeout(1200);
  const wx = new ExcelJS.Workbook(); await wx.xlsx.readFile(exp);
  let linhasPF = []; wx.worksheets[0].eachRow(r => { if (r.getCell(1).value === 'Whey Isolado Pro Fit 900g') linhasPF.push(`${r.getCell(2).value}:${r.getCell(3).value}:${r.getCell(4).value}`); });
  ok(linhasPF.join() === 'Chocolate:7891000000011:199.9,Baunilha:7891000000028:199.9,Cookies:7891000000035:209.9', 'exportar: uma linha por sabor, com código e preço');

  // ---- configurações da Lisufit: sem "pagar no caixa" e sem controle de estoque ----
  await pg.evaluate(() => trocarAba('config')); await pg.waitForTimeout(500);
  await pg.uncheck('#form-config [name=formaCaixa]');
  await pg.uncheck('#form-config [name=controlarEstoqueGeral]');
  await pg.fill('#form-config [name=pixChave]', 'loja@exemplo.com'); await pg.fill('#form-config [name=pixNome]', 'Lisufit'); await pg.fill('#form-config [name=pixCidade]', 'Fortaleza');
  await pg.click('#form-config button[type=submit]'); await pg.waitForTimeout(400);
  const cfg = await pg.evaluate(() => pdv.configAdmin());
  ok(cfg.formasTotem.caixa === false && cfg.controlarEstoque === false, 'configurações salvas (sem pagar no caixa, sem estoque)');
  // zera o estoque de um produto: não pode ficar esgotado
  const creat = prods.find(p => p.codigoBarras === '7890000000035');
  await pg.evaluate(async id => { const p = (await pdv.produtos()).find(x => x.id === id); await pdv.salvarProduto({ ...p, estoque: 0 }); }, creat.id);
  await pg.click('#btn-sair-admin'); await pg.evaluate(() => carregarDados()); await pg.waitForTimeout(300);

  // ---- totem: leitor nos sabores ----
  await pg.click('#btn-comecar'); await pg.waitForTimeout(300);
  await ler('7891000000028');
  await ler('7891000000035');
  await ler('7891000000028');
  const carrinho = await pg.evaluate(() => [...estado.carrinho.values()].map(l => `${l.descricao}|${l.qtd}`));
  ok(carrinho.join() === 'Sabor: Baunilha|2,Sabor: Cookies|1', 'leitor: cada código entra no sabor certo (Baunilha x2, Cookies x1): ' + carrinho.join());
  ok(!(await pg.isVisible('#modal-opcoes')), 'sem precisar abrir a tela de escolha');
  ok(await pg.evaluate(() => totalCarrinho()) === 19990 * 2 + 20990, 'preço: Cookies sai R$ 209,90');
  await pg.click('[data-cat="Creatina"]'); await pg.waitForTimeout(300);
  const esgotado = await pg.$$eval('.card-produto.esgotado', e => e.length);
  ok(esgotado === 0, 'estoque desligado: produto com estoque 0 não aparece esgotado');
  await pg.click('[data-cat="Proteínas"]'); await pg.waitForTimeout(300);
  await pg.click(`.card-produto[data-id="${pf.id}"]`); await pg.waitForTimeout(400);
  ok(await pg.isVisible('#modal-opcoes') && (await pg.textContent('#opcoes-grupos')).includes('Cookies'), 'tocando no card, o cliente escolhe o sabor');
  await shot('3-escolher-sabor');
  await pg.click('#btn-opcoes-cancelar');
  await pg.click('#btn-finalizar'); await pg.waitForTimeout(400);
  ok(!(await pg.isVisible('.opcao[data-forma=caixa]')) && await pg.isVisible('.opcao[data-forma=pix]'), 'tela de pagamento sem "Pagar no caixa"');
  await shot('4-pagamento');
  const bloqueio = await pg.evaluate(() => pdv.registrarVenda({ itens: itensVenda(), formaPagamento: 'caixa', status: 'aguardando_caixa' }).then(() => 'passou', e => e.message));
  ok(bloqueio.includes('não está disponível'), 'sistema também recusa "pagar no caixa" desativado');
  await pg.click('[data-forma=pix]'); await pg.waitForTimeout(400);
  await pg.click('#btn-pix-pago'); await pin('0000'); await pg.waitForTimeout(1500);
  const venda = (await pg.evaluate(async () => { await pdv.entrarPainel('1234'); return pdv.vendas({}); })).pop();
  ok(venda && venda.itens.some(i => i.opcoes === 'Sabor: Cookies' && i.precoCentavos === 20990), 'venda grava o sabor e o preço');
  const pfDepois = (await pg.evaluate(() => pdv.produtos())).find(p => p.id === pf.id);
  ok(pfDepois.estoque === pf.estoque, 'estoque desligado: venda não baixa estoque');
  ok(!erros.length, 'sem erros no console' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await app.close();
  fim();
})().catch(e => { console.error(e); process.exit(1); });
