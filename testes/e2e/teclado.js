// Teclado na tela: busca do totem (com acento), cadastro de produto (Próximo, numérico), preço rápido (OK = Enter) e opção "Nunca"
const { abrir, verificador } = require('./_base');
const { ok, fim } = verificador('teclado');

(async () => {
  const { app, pg, erros, shot, entrar } = await abrir('teclado', { teclado: true });
  const tecla = async (...ts) => { for (const t of ts) await pg.click(`#teclado-virtual [data-t="${t}"]`); };
  const aberto = () => pg.isVisible('#teclado-virtual');

  // ---- totem: busca ----
  await pg.click('#btn-comecar'); await pg.waitForTimeout(300);
  await pg.click('#busca'); await pg.waitForTimeout(300);
  ok(await aberto(), 'tocar na busca abre o teclado');
  ok(await pg.isVisible('#teclado-virtual [data-t="shift"].tv-ativa'), 'campo vazio começa com maiúscula');
  await tecla('c', 'a', 'f', 'acento:´', 'e');
  ok(await pg.inputValue('#busca') === 'Café', 'digita "Café" com acento: ' + await pg.inputValue('#busca'));
  const nomes = await pg.$$eval('#grade-produtos [data-id]', c => c.map(x => x.textContent));
  ok(nomes.length >= 1 && nomes.every(n => /café/i.test(n)), 'a busca filtra enquanto digita (' + nomes.length + ' produto)');
  ok(await pg.evaluate(() => document.activeElement.id) === 'busca', 'o campo continua com o foco ao digitar');
  await shot('1-totem-busca');
  await tecla('apagar', 'apagar', 'apagar', 'apagar');
  ok(await pg.inputValue('#busca') === '', 'apagar limpa a busca');
  await tecla('fechar'); await pg.waitForTimeout(200);
  ok(!(await aberto()), '"Fechar teclado" esconde');
  await pg.click('#btn-cancelar-compra'); await pg.waitForTimeout(300);

  // ---- admin: novo produto ----
  await entrar('1234');
  await pg.evaluate(() => trocarAba('produtos')); await pg.waitForTimeout(400);
  await pg.click('#btn-novo-produto'); await pg.waitForTimeout(400);
  await pg.click('#form-produto [name=nome]'); await pg.waitForTimeout(250);
  ok(await aberto() && (await pg.textContent('.tv-rotulo b')).trim() === 'Nome', 'campo Nome abre o teclado com o nome do campo');
  await tecla('t', 'e', 's', 't', 'e', ' ', 'p', 'a', 'c', 'acento:~', 'a', 'o');
  ok(await pg.inputValue('#form-produto [name=nome]') === 'Teste pacão', 'nome digitado: ' + await pg.inputValue('#form-produto [name=nome]'));
  ok((await pg.textContent('.tv-ok')).includes('Próximo'), 'botão Próximo quando há outro campo');
  await tecla('ok'); await pg.waitForTimeout(250);
  ok(await pg.evaluate(() => document.activeElement.name) === 'codigoBarras', 'Próximo vai para o campo seguinte');
  await pg.click('#form-produto [name=preco]'); await pg.waitForTimeout(250);
  ok(await pg.isVisible('#teclado-virtual.tv-modo-numerico') && await pg.isVisible('#teclado-virtual [data-t=","]'), 'preço abre o teclado numérico com vírgula');
  await tecla('1', '2', ',', '5', '0');
  ok(await pg.inputValue('#form-produto [name=preco]') === '12,50', 'preço digitado: 12,50');
  const visivel = await pg.evaluate(() => {
    const r = document.querySelector('#form-produto [name=preco]').getBoundingClientRect();
    return r.bottom <= innerHeight - document.querySelector('#teclado-virtual').offsetHeight;
  });
  ok(visivel, 'o campo fica acima do teclado (não fica escondido)');
  ok(await pg.evaluate(() => document.querySelector('#form-produto [name=preco]').getAttribute('inputmode')) === 'none', 'teclado do Windows não abre junto (inputmode none enquanto digita)');
  await shot('2-admin-preco');
  await pg.click('#form-produto button[type=submit]'); await pg.waitForTimeout(600);
  const novo = (await pg.evaluate(() => pdv.produtos())).find(p => p.nome === 'Teste pacão');
  ok(novo && novo.precoCentavos === 1250, 'produto salvo com o que foi digitado no teclado da tela');
  ok(!(await aberto()), 'teclado some quando a janela fecha');
  ok(await pg.evaluate(() => document.querySelector('#form-produto [name=preco]').getAttribute('inputmode')) === 'decimal', 'campo volta ao inputmode original');

  // ---- preço rápido na tabela: OK funciona como Enter ----
  const id = await pg.evaluate(() => estado.produtos.find(p => p.nome === 'Empada de Frango').id);
  const sel = `[data-preco="${id}"]`;
  await pg.click(sel); await pg.waitForTimeout(250);
  await pg.evaluate(s => { const el = document.querySelector(s); el.setSelectionRange(0, el.value.length); }, sel);
  await tecla('8', ',', '0', '0');
  await tecla('ok'); await pg.waitForTimeout(700);
  const empada = (await pg.evaluate(() => pdv.produtos())).find(p => p.id === id);
  ok(empada.precoCentavos === 800, 'preço rápido salvo pelo OK do teclado: ' + empada.precoCentavos);

  // ---- configuração: Nunca ----
  await pg.evaluate(() => trocarAba('config')); await pg.waitForTimeout(600);
  ok(await pg.inputValue('#form-config [name=tecladoVirtual]') === 'sempre', 'padrão: teclado sempre');
  await pg.selectOption('#form-config [name=tecladoVirtual]', 'nunca');
  await pg.click('#form-config button[type=submit]'); await pg.waitForTimeout(600);
  await pg.click('#form-config [name=nomeLoja]'); await pg.waitForTimeout(250);
  ok(!(await aberto()), 'com "Nunca" o teclado não abre');
  await pg.selectOption('#form-config [name=tecladoVirtual]', 'sempre');
  await pg.click('#form-config button[type=submit]'); await pg.waitForTimeout(600);
  await pg.click('#form-config [name=nomeLoja]'); await pg.waitForTimeout(250);
  ok(await aberto(), 'de volta em "Sempre" abre de novo');
  await tecla('layout');
  ok(await pg.isVisible('#teclado-virtual [data-t="@"]') && await pg.isVisible('#teclado-virtual [data-t="#"]'), 'teclado de símbolos (?123)');
  await shot('3-config-simbolos');

  ok(!erros.length, 'sem erros no console' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await app.close();
  fim();
})().catch(e => { console.error(e); process.exit(1); });
