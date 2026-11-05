// Sincronização do catálogo (sem abrir o app): o que o Pedro muda no catálogo chega na loja pelo "Atualizar",
// sem passar por cima do que a loja mudou por conta própria.
const fs = require('fs'), os = require('os'), path = require('path');
const { Banco } = require('../../src/db');
const { verificador } = require('./_base');
const { ok, fim } = verificador('catalogo-sync');

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'lisufit-sync-'));
const b = new Banco(pasta);
const original = Banco.entradasCatalogo;
ok(!b.catalogoDesatualizado() && b.dados.produtos.length === 76, 'instalação nova já nasce sincronizada');

// a loja muda o preço do JoyPro e oculta a Coca-Cola por conta própria
const p = n => b.dados.produtos.find(x => x.nome === n);
p('JoyPro Protein Shark Pro 900g').precoCentavos = 15900;
p('Coca-Cola Lata 350ml').ativo = false;

// o Pedro muda o catálogo: produto novo, preços do JoyPro e da Megalodon, foto e sabor novo no Whey Profit
Banco.entradasCatalogo = () => original().map(e => {
  if (e.nome === 'JoyPro Protein Shark Pro 900g') return { ...e, preco: 15500 };
  if (e.nome === 'Megalodon Pré-Treino Abacaxi 300g') return { ...e, preco: 9490 };
  if (e.nome === '100% Whey Profit 900g') return { ...e, foto: 'whey-pride', sabores: [...e.sabores, ['Cookies', '']] };
  if (e.nome === 'Feijoada') return { ...e, preco: 2800, exemplo: false };
  return e;
}).concat([{ nome: 'Dorme Bem Melatonina 30ml', categoria: 'Vitaminas', preco: 4990, foto: 'ginseng', sabores: [], exemplo: false, feitoNaHora: false }]);
ok(b.catalogoDesatualizado(), 'mudança no catálogo é percebida');
const r = b.sincronizarCatalogo();
ok(r.novos.length === 1 && p('Dorme Bem Melatonina 30ml')?.precoCentavos === 4990 && fs.existsSync(p('Dorme Bem Melatonina 30ml').imagem), 'produto novo entra com preço e foto');
ok(p('Megalodon Pré-Treino Abacaxi 300g').precoCentavos === 9490, 'preço mudado pelo Pedro chega na loja');
ok(p('JoyPro Protein Shark Pro 900g').precoCentavos === 15900, 'preço que a loja mudou por conta própria não é sobrescrito');
ok(p('Feijoada').precoCentavos === 2800 && !p('Feijoada').precoExemplo, 'Empório: preço definitivo tira o selo de exemplo');
const whey = p('100% Whey Profit 900g');
ok(path.basename(whey.imagem) === 'catalogo-whey-pride.webp' && whey.opcoes[0].itens.map(i => i.nome).join() === 'Baunilha,Chocolate,Morango,Cookies', 'foto e sabor novo do Whey Profit');
ok(p('Coca-Cola Lata 350ml').ativo === false, 'produto oculto pela loja continua oculto');
ok(b.dados.produtos.length === 77 && !b.catalogoDesatualizado(), 'nada apagado e catálogo em dia');
ok(b.sincronizarCatalogo().novos.length === 0 && b.dados.produtos.length === 77, 'rodar de novo não muda nada');
// base antiga, sem registro do catálogo (instalação do Pedro): na 1ª vez só completa, não mexe nos preços
const pasta2 = fs.mkdtempSync(path.join(os.tmpdir(), 'lisufit-sync2-'));
const b2 = new Banco(pasta2);
delete b2.dados.catalogo;
b2.dados.produtos.find(x => x.nome === 'Megalodon Pré-Treino Abacaxi 300g').precoCentavos = 8500;
b2.dados.produtos = b2.dados.produtos.filter(x => x.nome !== 'Feijoada');
const r2 = b2.sincronizarCatalogo();
ok(r2.novos.join() === 'Feijoada' && b2.dados.produtos.find(x => x.nome.startsWith('Megalodon')).precoCentavos === 8500, 'base antiga: completa o que falta e mantém os preços da loja');
Banco.entradasCatalogo = original;

// produto SEM PREÇO (preço 0 no catálogo): entra oculto; aparece sozinho quando a loja digita o preço
const pac = p('Paçoquita Zero Santa Helena 18g');
ok(pac.semPreco === true && pac.ativo === false && pac.precoCentavos === 0, 'sem preço: entra oculto do totem');
let erro = '';
try { b.salvarProduto({ ...pac, ativo: true }); } catch (e) { erro = e.message; }
ok(/preço maior que zero/.test(erro), 'sem preço não dá para mostrar no totem antes de ter preço');
const salvo = b.salvarProduto({ ...pac, precoCentavos: 250 });
ok(salvo.ativo === true && !salvo.semPreco && p('Paçoquita Zero Santa Helena 18g').precoCentavos === 250, 'com preço digitado: aparece no totem e perde o selo');
const hal = p('Halls Extra Forte 27,5g');
b.produtosEmMassa([hal.id], 'mostrar');
ok(p('Halls Extra Forte 27,5g').ativo === false, '"Mostrar no totem" em massa não libera produto sem preço');
fim();
