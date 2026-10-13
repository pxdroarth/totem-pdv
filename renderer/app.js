// Fluxo do cliente no totem
const estado = {
  config: {},
  produtos: [],
  categorias: [],
  carrinho: new Map(), // id -> qtd
  categoria: 'Todos',
  pixTxid: ''
};

async function carregarDados() {
  estado.config = await pdv.config();
  estado.produtos = await pdv.produtos();
  estado.categorias = await pdv.categorias();
  const nome = (estado.config.nomeLoja || 'Lisufit').toUpperCase();
  $('#logo-texto').textContent = nome;
  $('#topo-logo').textContent = nome;
  renderCategorias();
  renderProdutos();
  renderCarrinho();
}

// Produto aparece no totem se estiver ativo e a categoria dele não estiver oculta
const categoriaOculta = nome => estado.categorias.some(c => c.nome === nome && !c.ativo);
const ordemCategoria = nome => { const c = estado.categorias.find(x => x.nome === nome); return c ? c.ordem : 9999; };
const visiveis = () => estado.produtos
  .filter(p => p.ativo && !categoriaOculta(p.categoria))
  .sort((a, b) => ordemCategoria(a.categoria) - ordemCategoria(b.categoria) || a.nome.localeCompare(b.nome));
const produtoPorId = id => estado.produtos.find(p => p.id === id);
// produto feito na hora (controlarEstoque = false) nunca esgota
const temEstoque = (p, qtd) => p.controlarEstoque === false || qtd <= p.estoque;
const totalCarrinho = () => [...estado.carrinho].reduce((s, [id, q]) => s + (produtoPorId(id)?.precoCentavos || 0) * q, 0);

// ---------- catálogo ----------
function renderCategorias() {
  // só mostra categorias que têm produto disponível, agrupadas por seção (Suplementos, Empório...)
  const comProduto = new Set(visiveis().map(p => p.categoria));
  const cats = estado.categorias.filter(c => c.ativo && comProduto.has(c.nome));
  // produto com categoria que não está no cadastro (não deveria acontecer) vai para "Outros"
  for (const nome of comProduto) if (!cats.some(c => c.nome === nome)) cats.push({ nome, secao: 'Outros', icone: 'tag' });
  if (estado.categoria !== 'Todos' && !cats.some(c => c.nome === estado.categoria)) estado.categoria = 'Todos';
  const botao = (nome, ico) => `<button class="cat ${nome === estado.categoria ? 'ativo' : ''}" data-cat="${esc(nome)}">
      <span class="cat-ico">${icone(ico, 30)}</span><span>${esc(nome)}</span></button>`;
  const secoes = [...new Set(cats.map(c => c.secao))];
  $('#categorias').innerHTML = botao('Todos', 'grid') + secoes.map(sec =>
    (secoes.length > 1 ? `<p class="secao-titulo">${esc(sec)}</p>` : '') +
    cats.filter(c => c.secao === sec).map(c => botao(c.nome, ICONES[c.icone] ? c.icone : 'tag')).join('')).join('');
  $('#titulo-categoria').textContent = estado.categoria === 'Todos' ? 'Todos os produtos' : estado.categoria;
}

function renderProdutos() {
  const termo = $('#busca').value.trim().toLowerCase();
  const lista = visiveis().filter(p =>
    (estado.categoria === 'Todos' || p.categoria === estado.categoria) &&
    (!termo || p.nome.toLowerCase().includes(termo) || p.codigoBarras.includes(termo)));
  $('#grade-produtos').innerHTML = lista.length ? lista.map(p => {
    const esgotado = !temEstoque(p, 1);
    const img = p.imagem
      ? `<img src="${esc(urlArquivo(p.imagem))}" alt="">`
      : `<div class="sem-img">${icone(iconeCategoria(p.categoria), 56)}</div>`;
    const qtd = estado.carrinho.get(p.id) || 0;
    return `<button class="card-produto ${esgotado ? 'esgotado' : ''} ${qtd ? 'no-pedido' : ''}" data-id="${p.id}" ${esgotado ? 'disabled' : ''}>
      <span class="foto">${img}${qtd ? `<span class="selo-qtd">${qtd}</span>` : ''}
        ${p.controlarEstoque === false ? '<span class="tag-hora">Feito na hora</span>' : ''}</span>
      <span class="nome">${esc(p.nome)}</span>
      <span class="card-rodape"><span class="preco">${esgotado ? 'Esgotado' : reais(p.precoCentavos)}</span>
      ${esgotado ? '' : `<span class="mais">${icone('mais', 22)}</span>`}</span></button>`;
  }).join('') : '<p class="vazio">Nenhum produto encontrado.</p>';
}

// ---------- carrinho ----------
function adicionar(id) {
  const p = produtoPorId(id);
  if (!p) return;
  const atual = estado.carrinho.get(id) || 0;
  if (!temEstoque(p, atual + 1)) return toast(`Só temos ${p.estoque} unidade(s) de ${p.nome}.`, 'erro');
  estado.carrinho.set(id, atual + 1);
  renderCarrinho();
  toast(`${p.nome} adicionado`, 'ok');
}

function alterarQtd(id, delta) {
  const p = produtoPorId(id);
  const nova = (estado.carrinho.get(id) || 0) + delta;
  if (nova <= 0) estado.carrinho.delete(id);
  else if (!temEstoque(p, nova)) return toast(`Só temos ${p.estoque} unidade(s).`, 'erro');
  else estado.carrinho.set(id, nova);
  renderCarrinho();
}

function renderCarrinho() {
  const itens = [...estado.carrinho];
  $('#lista-carrinho').innerHTML = itens.length ? itens.map(([id, q]) => {
    const p = produtoPorId(id);
    const foto = p.imagem ? `<img src="${esc(urlArquivo(p.imagem))}" alt="">` : icone(iconeCategoria(p.categoria), 28);
    return `<li><span class="item-foto">${foto}</span>
      <div class="item-info"><span>${esc(p.nome)}</span><small>${reais(p.precoCentavos)} cada</small></div>
      <div class="qtd"><button data-menos="${id}" aria-label="Diminuir">${icone(q === 1 ? 'lixo' : 'menos', 20)}</button><b>${q}</b>
      <button data-mais="${id}" aria-label="Aumentar">${icone('mais', 20)}</button></div>
      <strong class="item-total">${reais(p.precoCentavos * q)}</strong></li>`;
  }).join('') : '<li class="vazio">Seu pedido está vazio.</li>';
  const total = reais(totalCarrinho());
  const n = itens.reduce((s, [, q]) => s + q, 0);
  $('#total-carrinho').textContent = total;
  $('#total-gaveta').textContent = total;
  $('#qtd-itens').textContent = n;
  $('#qtd-itens').classList.toggle('zero', !n);
  $('#btn-finalizar').disabled = !itens.length;
  $('#btn-ver-pedido-2').disabled = !itens.length;
  $('#btn-finalizar-gaveta').disabled = !itens.length;
  if (document.body.dataset.tela === 'loja') renderProdutos(); // atualiza selos de quantidade
}

function limparCompra() {
  estado.carrinho.clear();
  $('#busca').value = '';
  estado.categoria = 'Todos';
  renderCategorias(); renderProdutos(); renderCarrinho();
}

// ---------- pagamento ----------
const itensVenda = () => [...estado.carrinho].map(([id, qtd]) => ({ id, qtd }));

async function confirmarComPin() {
  if (!estado.config.confirmarPagamentoComPin) return true;
  const pin = await pedirPin('Atendente: confirme o pagamento');
  if (pin === null) return false;
  if (!(await pdv.verificarPinAtendente(pin))) { toast('PIN incorreto', 'erro'); return false; }
  return true;
}

async function finalizar(formaPagamento) {
  const status = formaPagamento === 'caixa' ? 'aguardando_caixa' : 'paga';
  try {
    const { venda, avisos } = await pdv.registrarVenda({ itens: itensVenda(), formaPagamento, status });
    avisos.forEach(a => console.warn(a));
    if (status === 'aguardando_caixa') {
      $('#fim-titulo').textContent = 'Pedido registrado!';
      $('#fim-pedido').textContent = `Pedido nº ${venda.numero}`;
      $('#fim-msg').textContent = `Leve os produtos e o ticket ao caixa e pague ${reais(venda.totalCentavos)}.`;
    } else {
      $('#fim-titulo').textContent = 'Compra concluída!';
      $('#fim-pedido').textContent = '';
      $('#fim-msg').textContent = 'Retire seu cupom. Obrigado e bons treinos!';
    }
    estado.produtos = await pdv.produtos(); // estoque atualizado
    limparCompra();
    mostrarTela('fim');
    setTimeout(() => { if (document.body.dataset.tela === 'fim') mostrarTela('inicio'); }, 10000);
  } catch (e) {
    toast(e.message, 'erro');
  }
}

async function abrirPix() {
  const total = totalCarrinho();
  estado.pixTxid = 'PDV' + Date.now().toString(36).toUpperCase();
  try {
    const { payload, qr } = await pdv.gerarPix(total, estado.pixTxid);
    $('#qr-pix').src = qr;
    $('#pix-payload').textContent = payload;
    $('#valor-pix').textContent = reais(total);
    mostrarTela('pix');
  } catch (e) { toast(e.message, 'erro'); }
}

// ---------- inatividade ----------
let ultimaAcao = Date.now();
['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => (ultimaAcao = Date.now()), true));
setInterval(() => {
  const tela = document.body.dataset.tela;
  if (['inicio', 'admin', 'fim'].includes(tela)) return;
  if ($('#modal-pin').classList.contains('aberto')) return;
  if (Date.now() - ultimaAcao > (estado.config.tempoInatividadeSeg || 90) * 1000) {
    limparCompra();
    fecharGaveta();
    mostrarTela('inicio');
  }
}, 5000);

// ---------- eventos ----------
$('#btn-comecar').onclick = () => mostrarTela('loja');
$('#btn-nova-compra').onclick = () => mostrarTela('inicio');
$('#btn-cancelar-compra').onclick = () => { limparCompra(); fecharGaveta(); mostrarTela('inicio'); };
$('#btn-voltar-carrinho').onclick = () => mostrarTela('loja');
$$('[data-voltar]').forEach(b => (b.onclick = () => mostrarTela(b.dataset.voltar)));

$('#categorias').onclick = e => {
  const b = e.target.closest('[data-cat]');
  if (!b) return;
  estado.categoria = b.dataset.cat;
  renderCategorias(); renderProdutos();
};
$('#busca').oninput = renderProdutos;
$('#grade-produtos').onclick = e => { const c = e.target.closest('[data-id]'); if (c) adicionar(c.dataset.id); };
$('#lista-carrinho').onclick = e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.mais) alterarQtd(b.dataset.mais, 1);
  if (b.dataset.menos) alterarQtd(b.dataset.menos, -1);
};

const abrirGaveta = () => $('#gaveta-pedido').classList.add('aberta');
const fecharGaveta = () => $('#gaveta-pedido').classList.remove('aberta');
$('#btn-ver-pedido').onclick = abrirGaveta;
$('#btn-ver-pedido-2').onclick = abrirGaveta;
$$('[data-fechar-gaveta]').forEach(b => (b.onclick = fecharGaveta));
const irParaPagamento = () => {
  if (!estado.carrinho.size) return;
  fecharGaveta();
  $('#valor-pagamento').textContent = reais(totalCarrinho());
  mostrarTela('pagamento');
};
$('#btn-finalizar').onclick = irParaPagamento;
$('#btn-finalizar-gaveta').onclick = irParaPagamento;
$$('.opcao').forEach(b => (b.onclick = () => {
  const forma = b.dataset.forma;
  if (forma === 'pix') abrirPix();
  if (forma === 'cartao') { $('#valor-cartao').textContent = reais(totalCarrinho()); mostrarTela('cartao'); }
  if (forma === 'caixa') finalizar('caixa');
}));
$('#btn-pix-pago').onclick = async () => { if (await confirmarComPin()) finalizar('pix'); };
$('#btn-cartao-pago').onclick = async () => { if (await confirmarComPin()) finalizar('cartao'); };

// Leitor de código de barras: em qualquer tela do cliente, adiciona ao carrinho
ouvirLeitor(codigo => {
  const tela = document.body.dataset.tela;
  if (!['inicio', 'loja', 'fim'].includes(tela)) return;
  const p = visiveis().find(x => x.codigoBarras === codigo);
  if (!p) return toast(`Produto não cadastrado (${codigo}). Chame um atendente.`, 'erro');
  if (tela !== 'loja') mostrarTela('loja');
  adicionar(p.id);
});

pdv.aoAbrirAdmin(() => abrirAdmin());
// Toque 5 vezes no logo da tela inicial também abre o admin (para tela touch sem teclado)
let toquesLogo = 0, timerLogo;
$('#logo-loja').onclick = () => {
  toquesLogo++;
  clearTimeout(timerLogo);
  timerLogo = setTimeout(() => (toquesLogo = 0), 2000);
  if (toquesLogo >= 5) { toquesLogo = 0; abrirAdmin(); }
};

// Logo: se existir assets/logo.png usa a imagem, senão mostra o nome em texto
const logoImg = $('#logo-img');
const usarLogo = () => $('#logo-loja').classList.add('com-imagem');
if (logoImg.complete && logoImg.naturalWidth) usarLogo(); // já carregou antes deste script
else {
  logoImg.addEventListener('load', usarLogo);
  logoImg.addEventListener('error', () => logoImg.remove());
}

aplicarIcones();
mostrarTela('inicio');
carregarDados().catch(e => toast(e.message, 'erro'));
