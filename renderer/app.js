// Fluxo do cliente no totem
const estado = {
  config: {},
  produtos: [],
  categorias: [],
  // chave -> { id, qtd, escolhas, adicionalCentavos, descricao }
  // (o mesmo produto com sabores diferentes vira linhas diferentes)
  carrinho: new Map(),
  categoria: 'Todos',
  cliente: null, // { nome, local } quando o totem pergunta antes de pagar
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
// quandoEsgotar = 'ocultar': produto zerado some do totem até repor
const escondidoPorEstoque = p => estado.config.quandoEsgotar === 'ocultar' && p.controlarEstoque !== false && p.estoque <= 0;
const visiveis = () => estado.produtos
  .filter(p => p.ativo && !categoriaOculta(p.categoria) && !escondidoPorEstoque(p))
  .sort((a, b) => ordemCategoria(a.categoria) - ordemCategoria(b.categoria) || a.nome.localeCompare(b.nome));
const produtoPorId = id => estado.produtos.find(p => p.id === id);
// produto feito na hora (controlarEstoque = false) nunca esgota
const temEstoque = (p, qtd) => p.controlarEstoque === false || estado.config.quandoEsgotar === 'vender' || qtd <= p.estoque;
const temOpcoes = p => Array.isArray(p.opcoes) && p.opcoes.length > 0;
const precoLinha = l => (produtoPorId(l.id)?.precoCentavos || 0) + (l.adicionalCentavos || 0);
const totalCarrinho = () => [...estado.carrinho.values()].reduce((s, l) => s + precoLinha(l) * l.qtd, 0);
// quantidade de um produto somando todas as variações (para estoque e selo do card)
const qtdProduto = id => [...estado.carrinho.values()].filter(l => l.id === id).reduce((s, l) => s + l.qtd, 0);

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
    const qtd = qtdProduto(p.id);
    return `<button class="card-produto ${esgotado ? 'esgotado' : ''} ${qtd ? 'no-pedido' : ''}" data-id="${p.id}" ${esgotado ? 'disabled' : ''}>
      <span class="foto">${img}${qtd ? `<span class="selo-qtd">${qtd}</span>` : ''}
        ${p.controlarEstoque === false ? '<span class="tag-hora">Feito na hora</span>' : ''}</span>
      <span class="nome">${esc(p.nome)}</span>
      <span class="card-rodape"><span class="preco">${esgotado ? 'Esgotado' : reais(p.precoCentavos)}</span>
      ${esgotado ? '' : `<span class="mais">${icone('mais', 22)}</span>`}</span></button>`;
  }).join('') : '<p class="vazio">Nenhum produto encontrado.</p>';
}

// ---------- carrinho ----------
// produto com variações abre a tela de escolha; sem variações entra direto
function adicionar(id) {
  const p = produtoPorId(id);
  if (!p) return;
  if (temOpcoes(p)) return abrirOpcoes(p);
  adicionarLinha(p, {}, 0, '');
}

function adicionarLinha(p, escolhas, adicionalCentavos, descricao) {
  if (!temEstoque(p, qtdProduto(p.id) + 1)) return toast(`Só temos ${p.estoque} unidade(s) de ${p.nome}.`, 'erro');
  const chave = p.id + '|' + JSON.stringify(Object.keys(escolhas).sort().map(k => [k, [...escolhas[k]].sort()]));
  const linha = estado.carrinho.get(chave);
  if (linha) linha.qtd++;
  else estado.carrinho.set(chave, { id: p.id, qtd: 1, escolhas, adicionalCentavos, descricao });
  renderCarrinho();
  toast(`${p.nome} adicionado`, 'ok');
}

function alterarQtd(chave, delta) {
  const l = estado.carrinho.get(chave);
  if (!l) return;
  const p = produtoPorId(l.id);
  if (l.qtd + delta <= 0) estado.carrinho.delete(chave);
  else if (delta > 0 && !temEstoque(p, qtdProduto(l.id) + delta)) return toast(`Só temos ${p.estoque} unidade(s).`, 'erro');
  else l.qtd += delta;
  renderCarrinho();
}

function renderCarrinho() {
  const itens = [...estado.carrinho];
  $('#lista-carrinho').innerHTML = itens.length ? itens.map(([chave, l]) => {
    const p = produtoPorId(l.id);
    const foto = p.imagem ? `<img src="${esc(urlArquivo(p.imagem))}" alt="">` : icone(iconeCategoria(p.categoria), 28);
    const k = esc(chave);
    return `<li><span class="item-foto">${foto}</span>
      <div class="item-info"><span>${esc(p.nome)}</span>
        ${l.descricao ? `<small class="item-opcoes">${esc(l.descricao)}</small>` : ''}
        <small>${reais(precoLinha(l))} cada</small></div>
      <div class="qtd"><button data-menos="${k}" aria-label="Diminuir">${icone(l.qtd === 1 ? 'lixo' : 'menos', 20)}</button><b>${l.qtd}</b>
      <button data-mais="${k}" aria-label="Aumentar">${icone('mais', 20)}</button></div>
      <strong class="item-total">${reais(precoLinha(l) * l.qtd)}</strong></li>`;
  }).join('') : '<li class="vazio">Seu pedido está vazio.</li>';
  const total = reais(totalCarrinho());
  const n = itens.reduce((s, [, l]) => s + l.qtd, 0);
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
  estado.cliente = null;
  $('#busca').value = '';
  estado.categoria = 'Todos';
  renderCategorias(); renderProdutos(); renderCarrinho();
}

// ---------- pagamento ----------
const itensVenda = () => [...estado.carrinho.values()].map(l => ({ id: l.id, qtd: l.qtd, escolhas: l.escolhas }));

// ---------- escolha de variações (sabor, frutas, adicionais) ----------
let escolhaAtual = null; // { p, sel: { grupoId: Set(itemId) } }

const regraGrupo = g => g.min === 0
  ? (g.max === 1 ? 'Opcional' : `Opcional, até ${g.max}`)
  : g.min === g.max ? `Escolha ${g.min}` : `Escolha de ${g.min} a ${g.max}`;

function abrirOpcoes(p) {
  escolhaAtual = { p, sel: Object.fromEntries(p.opcoes.map(g => [g.id, new Set()])) };
  $('#opcoes-nome').textContent = p.nome;
  $('#opcoes-foto').innerHTML = p.imagem ? `<img src="${esc(urlArquivo(p.imagem))}" alt="">` : icone(iconeCategoria(p.categoria), 40);
  renderOpcoes();
  $('#modal-opcoes').classList.add('aberto');
}

function calcularEscolha() {
  const { p, sel } = escolhaAtual;
  let adicional = 0; const partes = []; const faltando = [];
  for (const g of p.opcoes) {
    const itens = g.itens.filter(i => sel[g.id].has(i.id));
    adicional += itens.reduce((s, i) => s + i.precoCentavos, 0);
    if (itens.length) partes.push(`${g.nome}: ${itens.map(i => i.nome).join(', ')}`);
    if (itens.length < g.min) faltando.push(g.nome);
  }
  return { adicional, descricao: partes.join('; '), faltando };
}

function renderOpcoes() {
  const { p, sel } = escolhaAtual;
  $('#opcoes-grupos').innerHTML = p.opcoes.map(g => `
    <section class="grupo-opcao">
      <header><h3>${esc(g.nome)}</h3><span class="regra ${g.min > 0 ? 'obrigatorio' : ''}">${regraGrupo(g)}</span></header>
      <div class="chips-opcao">${g.itens.map(i => `
        <button class="chip-opcao ${sel[g.id].has(i.id) ? 'ativo' : ''}" data-grupo="${g.id}" data-item="${i.id}">
          <span>${esc(i.nome)}</span>${i.precoCentavos ? `<small>+ ${reais(i.precoCentavos)}</small>` : ''}
        </button>`).join('')}</div>
    </section>`).join('');
  const { adicional, faltando } = calcularEscolha();
  const btn = $('#btn-opcoes-adicionar');
  btn.disabled = faltando.length > 0;
  btn.innerHTML = `<span>Adicionar ao pedido</span><strong>${reais(p.precoCentavos + adicional)}</strong>`;
  $('#opcoes-aviso').textContent = faltando.length ? `Falta escolher: ${faltando.join(', ')}` : '';
}

const fecharOpcoes = () => { $('#modal-opcoes').classList.remove('aberto'); escolhaAtual = null; };

$('#opcoes-grupos').onclick = e => {
  const b = e.target.closest('[data-grupo]');
  if (!b || !escolhaAtual) return;
  const g = escolhaAtual.p.opcoes.find(x => x.id === b.dataset.grupo);
  const set = escolhaAtual.sel[g.id], id = b.dataset.item;
  if (set.has(id)) set.delete(id);
  else if (g.max === 1) { set.clear(); set.add(id); }       // escolha única: troca
  else if (set.size >= g.max) return toast(`Em ${g.nome}, escolha no máximo ${g.max}.`, 'erro');
  else set.add(id);
  renderOpcoes();
};
$('#btn-opcoes-cancelar').onclick = fecharOpcoes;
$('#btn-opcoes-adicionar').onclick = () => {
  if (!escolhaAtual) return;
  const { p, sel } = escolhaAtual;
  const { adicional, descricao, faltando } = calcularEscolha();
  if (faltando.length) return;
  const escolhas = Object.fromEntries(Object.entries(sel).filter(([, v]) => v.size).map(([k, v]) => [k, [...v]]));
  fecharOpcoes();
  adicionarLinha(p, escolhas, adicional, descricao);
};

// devolve o PIN digitado (fica registrado quem confirmou), '' se não precisa de PIN, ou null se cancelou/errou
async function confirmarComPin() {
  if (!estado.config.confirmarPagamentoComPin) return '';
  const pin = await pedirPin('Atendente: confirme o pagamento');
  if (pin === null) return null;
  if (!(await pdv.verificarPinAtendente(pin))) { toast('PIN incorreto', 'erro'); return null; }
  return pin;
}

async function finalizar(formaPagamento, pin = '') {
  const status = formaPagamento === 'caixa' ? 'aguardando_caixa' : 'paga';
  try {
    const { venda, avisos } = await pdv.registrarVenda({ itens: itensVenda(), formaPagamento, status, pin, cliente: estado.cliente });
    avisos.forEach(a => console.warn(a));
    const temPreparo = venda.itens.some(i => i.preparo);
    if (status === 'aguardando_caixa') {
      $('#fim-titulo').textContent = 'Pedido registrado!';
      $('#fim-pedido').textContent = `Pedido nº ${venda.numero}`;
      $('#fim-msg').textContent = `Leve o ticket ao caixa e pague ${reais(venda.totalCentavos)}.` +
        (temPreparo ? ' Seu pedido será preparado após o pagamento.' : '');
    } else if (temPreparo) {
      $('#fim-titulo').textContent = 'Pedido confirmado!';
      $('#fim-pedido').textContent = `Senha ${venda.numero}`;
      const nome = venda.cliente?.nome;
      $('#fim-msg').textContent = (nome ? `${nome}, retire` : 'Retire') + ' seu cupom e aguarde ser chamado(a) para pegar o pedido.';
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
    fecharOpcoes();
    fecharCliente();
    limparCompra();
    fecharGaveta();
    mostrarTela('inicio');
  }
}, 5000);

// ---------- eventos ----------
$('#btn-comecar').onclick = () => mostrarTela('loja');
$('#btn-nova-compra').onclick = () => mostrarTela('inicio');
$('#btn-cancelar-compra').onclick = () => { fecharOpcoes(); fecharCliente(); limparCompra(); fecharGaveta(); mostrarTela('inicio'); };
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
  if ((estado.config.pedirNomeCliente || estado.config.perguntarLocal) && !estado.cliente) return abrirCliente();
  $('#valor-pagamento').textContent = reais(totalCarrinho());
  mostrarTela('pagamento');
};

// ---------- nome do cliente e comer aqui/levar (opcional) ----------
let clienteRascunho = { nome: '', local: '' };
const TECLAS = ['QWERTYUIOP', 'ASDFGHJKLÇ', 'ZXCVBNM'];
function abrirCliente() {
  clienteRascunho = { nome: '', local: '' };
  $('#cliente-bloco-nome').hidden = !estado.config.pedirNomeCliente;
  $('#cliente-bloco-local').hidden = !estado.config.perguntarLocal;
  $('#teclado-letras').innerHTML = TECLAS.map(l => `<div class="linha-teclas">${[...l].map(k =>
    `<button type="button" class="tecla-letra" data-letra="${k}">${k}</button>`).join('')}</div>`).join('') +
    `<div class="linha-teclas"><button type="button" class="tecla-letra tecla-espaco" data-letra=" ">espaço</button>
     <button type="button" class="tecla-letra tecla-apagar" data-apagar aria-label="Apagar">${icone('voltar', 26)}</button></div>`;
  renderCliente();
  $('#modal-cliente').classList.add('aberto');
}
const fecharCliente = () => $('#modal-cliente').classList.remove('aberto');
function clienteValido() {
  const faltando = [];
  if (estado.config.pedirNomeCliente && clienteRascunho.nome.trim().length < 2) faltando.push('seu nome');
  if (estado.config.perguntarLocal && !clienteRascunho.local) faltando.push('comer aqui ou levar');
  return faltando;
}
function renderCliente() {
  const n = clienteRascunho.nome;
  $('#cliente-nome').innerHTML = n ? esc(n) + '<span class="cursor"></span>' : '<span class="nome-vazio">Toque nas letras</span>';
  $$('.opcao-local').forEach(b => b.classList.toggle('ativo', b.dataset.local === clienteRascunho.local));
  const faltando = clienteValido();
  $('#btn-cliente-continuar').disabled = faltando.length > 0;
  $('#cliente-aviso').textContent = faltando.length ? `Falta: ${faltando.join(' e ')}` : '';
}
function digitar(letra) {
  let n = clienteRascunho.nome;
  if (letra === null) n = n.slice(0, -1);
  else if (letra === ' ') { if (n && !n.endsWith(' ')) n += ' '; }
  else if (n.length < 20) n += (n === '' || n.endsWith(' ')) ? letra : letra.toLowerCase();
  clienteRascunho.nome = n;
  renderCliente();
}
$('#teclado-letras').onclick = e => {
  const b = e.target.closest('button');
  if (!b) return;
  digitar(b.dataset.apagar !== undefined ? null : b.dataset.letra);
};
// teclado físico também funciona (útil no balcão e nos testes)
document.addEventListener('keydown', e => {
  if (!$('#modal-cliente').classList.contains('aberto') || !estado.config.pedirNomeCliente) return;
  if (e.key === 'Backspace') digitar(null);
  else if (/^[\p{L} ]$/u.test(e.key)) digitar(e.key.toUpperCase());
  else return;
  e.preventDefault();
});
$$('.opcao-local').forEach(b => (b.onclick = () => { clienteRascunho.local = b.dataset.local; renderCliente(); }));
$('#btn-cliente-voltar').onclick = fecharCliente;
$('#btn-cliente-continuar').onclick = () => {
  if (clienteValido().length) return;
  estado.cliente = { nome: clienteRascunho.nome.trim(), local: clienteRascunho.local };
  fecharCliente();
  irParaPagamento();
};
$('#btn-finalizar').onclick = irParaPagamento;
$('#btn-finalizar-gaveta').onclick = irParaPagamento;
$$('.opcao').forEach(b => (b.onclick = () => {
  const forma = b.dataset.forma;
  if (forma === 'pix') abrirPix();
  if (forma === 'cartao') { $('#valor-cartao').textContent = reais(totalCarrinho()); mostrarTela('cartao'); }
  if (forma === 'caixa') finalizar('caixa');
}));
$('#btn-pix-pago').onclick = async () => { const pin = await confirmarComPin(); if (pin !== null) finalizar('pix', pin); };
$('#btn-cartao-pago').onclick = async () => { const pin = await confirmarComPin(); if (pin !== null) finalizar('cartao', pin); };

// Leitor de código de barras: em qualquer tela do cliente, adiciona ao carrinho
ouvirLeitor(codigo => {
  const tela = document.body.dataset.tela;
  if (!['inicio', 'loja', 'fim'].includes(tela)) return;
  if ($('#modal-opcoes').classList.contains('aberto') || $('#modal-cliente').classList.contains('aberto')) return;
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
