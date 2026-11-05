// Instalação que já existia antes do catálogo: o botão "Carregar catálogo da loja" cadastra o que falta,
// põe foto em quem está sem e não mexe no preço de quem já existe. Rodar duas vezes não duplica.
const fs = require('fs');
const { abrir, verificador } = require('./_base');
const { ok, fim } = verificador('catalogo-carregar');

(async () => {
  const { app, pg, erros, shot, entrar } = await abrir('catalogo-carregar', { catalogo: 'exemplo' }); // base antiga, sem o catálogo
  await entrar('1234');
  const antes = await pg.evaluate(() => pdv.produtos());
  // a loja já tinha cadastrado o Café Expresso e o Whey Profit (com outro preço e sem foto)
  await pg.evaluate(async () => {
    await pdv.salvarProduto({ nome: 'Café Expresso', precoCentavos: 700, categoria: 'Snacks' });
    await pdv.salvarProduto({ nome: '100% WHEY PROFIT 900g', precoCentavos: 12500, categoria: 'Proteínas' });
  });
  pg.once('dialog', d => d.accept());
  await pg.click('.menu-planilha summary'); await pg.click('#btn-carregar-catalogo'); await pg.waitForTimeout(1500);
  const toast = await pg.textContent('#toast');
  const depois = await pg.evaluate(() => pdv.produtos());
  ok(depois.length === antes.length + 2 + 61, `cadastrou os 61 que faltavam (${depois.length - antes.length - 2}) — ${toast}`);
  const cafe = depois.filter(p => p.nome === 'Café Expresso');
  ok(cafe.length === 1 && cafe[0].precoCentavos === 700 && cafe[0].imagem && fs.existsSync(cafe[0].imagem), 'Café Expresso: não duplicou, manteve R$ 7,00 e ganhou foto');
  const whey = depois.filter(p => /whey profit/i.test(p.nome));
  ok(whey.length === 1 && whey[0].precoCentavos === 12500 && whey[0].imagem, 'Whey Profit (nome em maiúsculas): reconhecido, manteve preço e ganhou foto');
  ok(depois.filter(p => p.imagem).length >= 63, 'produtos do catálogo com foto');
  const cats = await pg.evaluate(() => pdv.categorias());
  ok(['Doces e Pastas', 'Mercearia', 'Farinhas e Naturais', 'Salgados'].every(n => cats.some(c => c.nome === n && c.secao === 'Empório')), 'categorias do Empório criadas');
  // de novo: nada muda
  pg.once('dialog', d => d.accept());
  await pg.click('.menu-planilha summary'); await pg.click('#btn-carregar-catalogo'); await pg.waitForTimeout(1200);
  ok((await pg.evaluate(() => pdv.produtos())).length === depois.length && (await pg.textContent('#toast')).startsWith('0 produto'), 'rodar de novo não duplica');
  await pg.click('#btn-sair-admin'); await pg.waitForTimeout(300);
  await pg.click('#btn-comecar'); await pg.waitForTimeout(400); await pg.click('[data-cat="Mercearia"]'); await pg.waitForTimeout(400);
  await shot('totem-mercearia');
  ok(await pg.$$eval('.card-produto img', i => i.filter(x => x.naturalWidth > 0).length) === 3, 'totem mostra a Mercearia com as fotos');
  ok(!erros.length, 'sem erros no console' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await app.close();
  fim();
})().catch(e => { console.error(e); process.exit(1); });
