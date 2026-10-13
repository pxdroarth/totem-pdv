// Painel administrativo (protegido por PIN)
const formas = { pix: 'PIX', cartao: 'Cartão', caixa: 'Caixa' };
const statusNome = { paga: 'Paga', aguardando_caixa: 'Aguardando caixa', cancelada: 'Cancelada' };
let produtoEditando = null;
let categoriaEditando = null;
let aoSalvarCategoria = null; // usado quando a categoria é criada de dentro do cadastro de produto

async function abrirAdmin() {
  if (document.body.dataset.tela === 'admin') return;
  const pin = await pedirPin('PIN do administrador');
  if (pin === null) return;
  if (!(await pdv.verificarPinAdmin(pin))) return toast('PIN incorreto', 'erro');
  mostrarTela('admin');
  trocarAba('produtos');
}

function trocarAba(nome) {
  $$('.aba').forEach(a => a.classList.toggle('ativa', a.dataset.aba === nome));
  $$('.aba-conteudo').forEach(c => c.classList.toggle('ativa', c.id === 'aba-' + nome));
  if (nome === 'produtos') renderTabelaProdutos();
  if (nome === 'categorias') renderTabelaCategorias();
  if (nome === 'vendas') carregarVendas();
  if (nome === 'config') carregarConfig();
}

// ---------- produtos ----------
async function renderTabelaProdutos() {
  estado.produtos = await pdv.produtos();
  estado.categorias = await pdv.categorias();
  const filtro = $('#filtro-categoria-admin');
  const atual = filtro.value;
  filtro.innerHTML = '<option value="">Todas as categorias</option>' + opcoesCategorias();
  filtro.value = estado.categorias.some(c => c.nome === atual) ? atual : '';
  const termo = $('#busca-admin').value.trim().toLowerCase();
  const lista = estado.produtos
    .filter(p => !filtro.value || p.categoria === filtro.value)
    .filter(p => !termo || p.nome.toLowerCase().includes(termo) || p.codigoBarras.includes(termo))
    .sort((a, b) => a.nome.localeCompare(b.nome));
  $('#tabela-produtos').innerHTML = lista.map(p => `
    <tr class="${p.ativo ? '' : 'inativo'}">
      <td>${p.imagem ? `<img class="mini" src="${esc(urlArquivo(p.imagem))}" alt="">` : ''}</td>
      <td>${esc(p.nome)}${p.ativo ? '' : ' <small>(oculto)</small>'}</td>
      <td>${esc(p.codigoBarras)}</td>
      <td><span class="cat-tabela">${icone(iconeCategoria(p.categoria), 18)} ${esc(p.categoria)}</span></td>
      <td>${reais(p.precoCentavos)}</td>
      <td class="${p.controlarEstoque !== false && p.estoque <= 3 ? 'alerta' : ''}">${p.controlarEstoque === false ? '<small>feito na hora</small>' : p.estoque}</td>
      <td><button class="btn btn-pequeno" data-editar="${p.id}">Editar</button></td>
    </tr>`).join('');
}

// <option>s agrupados por seção
function opcoesCategorias() {
  const secoes = [...new Set(estado.categorias.map(c => c.secao))];
  return secoes.map(sec => `<optgroup label="${esc(sec)}">` +
    estado.categorias.filter(c => c.secao === sec)
      .map(c => `<option value="${esc(c.nome)}">${esc(c.nome)}${c.ativo ? '' : ' (oculta)'}</option>`).join('') +
    '</optgroup>').join('');
}

function preencherSelectCategoria(valor) {
  const sel = $('#sel-categoria-produto');
  sel.innerHTML = opcoesCategorias();
  if (valor && estado.categorias.some(c => c.nome === valor)) sel.value = valor;
}

function abrirProduto(p) {
  produtoEditando = p ? { ...p } : { imagem: '', ativo: true, estoque: 0 };
  const f = $('#form-produto');
  f.produtoId.value = produtoEditando.id || '';
  f.nome.value = produtoEditando.nome || '';
  f.codigoBarras.value = produtoEditando.codigoBarras || '';
  f.preco.value = produtoEditando.precoCentavos ? (produtoEditando.precoCentavos / 100).toFixed(2).replace('.', ',') : '';
  f.estoque.value = produtoEditando.estoque ?? 0;
  preencherSelectCategoria(produtoEditando.categoria || $('#filtro-categoria-admin').value);
  f.ativo.checked = produtoEditando.ativo !== false;
  f.controlarEstoque.checked = produtoEditando.controlarEstoque !== false;
  f.estoque.disabled = !f.controlarEstoque.checked;
  $('#produto-titulo').textContent = p ? 'Editar produto' : 'Novo produto';
  $('#btn-excluir-produto').style.visibility = p ? 'visible' : 'hidden';
  atualizarPreview();
  $('#modal-produto').classList.add('aberto');
  setTimeout(() => f.nome.focus(), 50);
}

function atualizarPreview() {
  const img = $('#produto-preview');
  img.src = urlArquivo(produtoEditando.imagem);
  img.style.visibility = produtoEditando.imagem ? 'visible' : 'hidden';
}

const fecharProduto = () => $('#modal-produto').classList.remove('aberto');

$('#form-produto').onsubmit = async e => {
  e.preventDefault();
  const f = e.target;
  try {
    await pdv.salvarProduto({
      id: f.produtoId.value || undefined,
      nome: f.nome.value,
      codigoBarras: f.codigoBarras.value,
      precoCentavos: paraCentavos(f.preco.value),
      estoque: f.estoque.value,
      categoria: f.categoria.value,
      ativo: f.ativo.checked,
      controlarEstoque: f.controlarEstoque.checked,
      imagem: produtoEditando.imagem
    });
    fecharProduto();
    toast('Produto salvo', 'ok');
    await renderTabelaProdutos();
    await carregarDados();
  } catch (err) { toast(err.message, 'erro'); }
};
// Enter do leitor no campo de código não deve enviar o formulário
$('#form-produto').codigoBarras.addEventListener('keydown', e => { if (e.key === 'Enter') e.preventDefault(); });

$('#btn-imagem').onclick = async () => {
  const caminho = await pdv.escolherImagem();
  if (caminho) { produtoEditando.imagem = caminho; atualizarPreview(); }
};
$('#btn-remover-imagem').onclick = () => { produtoEditando.imagem = ''; atualizarPreview(); };
$('#btn-cancelar-produto').onclick = fecharProduto;
$('#btn-excluir-produto').onclick = async () => {
  if (!confirm(`Excluir "${produtoEditando.nome}"? As vendas antigas continuam no relatório.`)) return;
  await pdv.excluirProduto(produtoEditando.id);
  fecharProduto();
  await renderTabelaProdutos();
  await carregarDados();
};
$('#form-produto').controlarEstoque.onchange = e => ($('#form-produto').estoque.disabled = !e.target.checked);
$('#btn-novo-produto').onclick = () => abrirProduto(null);
$('#busca-admin').oninput = renderTabelaProdutos;
$('#filtro-categoria-admin').onchange = renderTabelaProdutos;
$('#btn-categoria-rapida').onclick = () => abrirCategoria(null, async nova => {
  estado.categorias = await pdv.categorias();
  preencherSelectCategoria(nova.nome);
});

// ---------- categorias ----------
async function renderTabelaCategorias() {
  estado.categorias = await pdv.categorias();
  estado.produtos = await pdv.produtos();
  const qtd = nome => estado.produtos.filter(p => p.categoria === nome).length;
  const n = estado.categorias.length;
  $('#tabela-categorias').innerHTML = estado.categorias.map((c, i) => `
    <tr class="${c.ativo ? '' : 'inativo'}">
      <td class="ordem">
        <button class="btn-mini" data-subir="${c.id}" ${i === 0 ? 'disabled' : ''} aria-label="Subir">${icone('cima', 18)}</button>
        <button class="btn-mini" data-descer="${c.id}" ${i === n - 1 ? 'disabled' : ''} aria-label="Descer">${icone('baixo', 18)}</button>
      </td>
      <td><span class="ico-tabela">${icone(ICONES[c.icone] ? c.icone : 'tag', 22)}</span></td>
      <td><b>${esc(c.nome)}</b></td><td>${esc(c.secao)}</td><td>${qtd(c.nome)}</td>
      <td>${c.ativo ? 'Sim' : 'Oculta'}</td>
      <td><button class="btn btn-pequeno" data-editar-cat="${c.id}">Editar</button></td>
    </tr>`).join('') || '<tr><td class="vazio" colspan="7">Nenhuma categoria.</td></tr>';
}

function abrirCategoria(c, callback) {
  categoriaEditando = c ? { ...c } : { icone: 'tag', ativo: true, secao: '' };
  aoSalvarCategoria = callback || null;
  const f = $('#form-categoria');
  f.categoriaId.value = categoriaEditando.id || '';
  f.nome.value = categoriaEditando.nome || '';
  f.secao.value = categoriaEditando.secao || '';
  f.ativo.checked = categoriaEditando.ativo !== false;
  $('#lista-secoes').innerHTML = [...new Set(['Suplementos', 'Empório', ...estado.categorias.map(x => x.secao)])]
    .map(sec => `<option value="${esc(sec)}">`).join('');
  $('#categoria-titulo').textContent = c ? 'Editar categoria' : 'Nova categoria';
  $('#btn-excluir-categoria').style.visibility = c ? 'visible' : 'hidden';
  renderGradeIcones();
  $('#modal-categoria').classList.add('aberto');
  setTimeout(() => f.nome.focus(), 50);
}

function renderGradeIcones() {
  $('#grade-icones').innerHTML = ICONES_CATEGORIA.map(nome =>
    `<button type="button" class="opcao-icone ${nome === categoriaEditando.icone ? 'ativo' : ''}" data-icone-cat="${nome}">${icone(nome, 26)}</button>`).join('');
}

const fecharCategoria = () => $('#modal-categoria').classList.remove('aberto');

$('#grade-icones').onclick = e => {
  const b = e.target.closest('[data-icone-cat]');
  if (!b) return;
  categoriaEditando.icone = b.dataset.iconeCat;
  renderGradeIcones();
};

$('#form-categoria').onsubmit = async e => {
  e.preventDefault();
  const f = e.target;
  try {
    const salva = await pdv.salvarCategoria({
      id: f.categoriaId.value || undefined,
      nome: f.nome.value, secao: f.secao.value, icone: categoriaEditando.icone, ativo: f.ativo.checked
    });
    fecharCategoria();
    toast('Categoria salva', 'ok');
    if (aoSalvarCategoria) await aoSalvarCategoria(salva);
    else await renderTabelaCategorias();
    await carregarDados();
  } catch (err) { toast(err.message, 'erro'); }
};
$('#btn-cancelar-categoria').onclick = fecharCategoria;
$('#btn-excluir-categoria').onclick = async () => {
  if (!confirm(`Excluir a categoria "${categoriaEditando.nome}"?`)) return;
  try {
    await pdv.excluirCategoria(categoriaEditando.id);
    fecharCategoria();
    toast('Categoria excluída');
    await renderTabelaCategorias();
    await carregarDados();
  } catch (err) { toast(err.message, 'erro'); }
};
$('#btn-nova-categoria').onclick = () => abrirCategoria(null);
$('#tabela-categorias').onclick = async e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.editarCat) return abrirCategoria(estado.categorias.find(c => c.id === b.dataset.editarCat));
  if (b.dataset.subir) await pdv.moverCategoria(b.dataset.subir, -1);
  if (b.dataset.descer) await pdv.moverCategoria(b.dataset.descer, 1);
  await renderTabelaCategorias();
  await carregarDados();
};
$('#tabela-produtos').onclick = e => {
  const b = e.target.closest('[data-editar]');
  if (b) abrirProduto(estado.produtos.find(p => p.id === b.dataset.editar));
};

// ---------- vendas ----------
async function carregarVendas() {
  if (!$('#vendas-de').value) $('#vendas-de').value = hojeLocal();
  if (!$('#vendas-ate').value) $('#vendas-ate').value = hojeLocal();
  const vendas = await pdv.vendas({ de: $('#vendas-de').value, ate: $('#vendas-ate').value });
  const pagas = vendas.filter(v => v.status === 'paga');
  const soma = arr => arr.reduce((s, v) => s + v.totalCentavos, 0);
  const porForma = f => soma(pagas.filter(v => v.formaPagamento === f));

  $('#resumo-vendas').innerHTML = [
    ['Faturamento', reais(soma(pagas))],
    ['Vendas pagas', pagas.length],
    ['Ticket médio', reais(pagas.length ? Math.round(soma(pagas) / pagas.length) : 0)],
    ['PIX', reais(porForma('pix'))],
    ['Cartão', reais(porForma('cartao'))],
    ['Caixa', reais(porForma('caixa'))]
  ].map(([t, v]) => `<div class="card-resumo"><small>${t}</small><strong>${v}</strong></div>`).join('');

  // pedidos "pagar no caixa" de qualquer dia que ainda não foram resolvidos
  const aguardando = (await pdv.vendas({})).filter(v => v.status === 'aguardando_caixa');
  $('#tabela-aguardando').innerHTML = aguardando.length ? aguardando.map(v => `
    <tr><td><b>Pedido ${v.numero}</b></td><td>${new Date(v.data).toLocaleString('pt-BR')}</td>
    <td>${v.itens.map(i => `${i.qtd}× ${esc(i.nome)}`).join('<br>')}</td><td><b>${reais(v.totalCentavos)}</b></td>
    <td><button class="btn btn-primario btn-pequeno" data-pagar="${v.numero}">Marcar como pago</button>
        <button class="btn btn-perigo btn-pequeno" data-cancelar="${v.numero}">Cancelar</button></td></tr>`).join('')
    : '<tr><td class="vazio">Nenhum pedido aguardando.</td></tr>';

  const top = {};
  pagas.forEach(v => v.itens.forEach(i => {
    top[i.nome] = top[i.nome] || { qtd: 0, total: 0 };
    top[i.nome].qtd += i.qtd; top[i.nome].total += i.totalCentavos;
  }));
  const ranking = Object.entries(top).sort((a, b) => b[1].qtd - a[1].qtd).slice(0, 10);
  $('#tabela-top').innerHTML = ranking.length
    ? ranking.map(([n, d], i) => `<tr><td>${i + 1}º</td><td>${esc(n)}</td><td>${d.qtd} un.</td><td>${reais(d.total)}</td></tr>`).join('')
    : '<tr><td class="vazio">Sem vendas no período.</td></tr>';

  $('#tabela-vendas').innerHTML = vendas.slice().reverse().map(v => `
    <tr class="${v.status === 'cancelada' ? 'inativo' : ''}">
      <td>${v.numero}</td><td>${new Date(v.data).toLocaleString('pt-BR')}</td>
      <td>${v.itens.reduce((s, i) => s + i.qtd, 0)}</td><td>${formas[v.formaPagamento]}</td>
      <td>${statusNome[v.status]}</td><td>${reais(v.totalCentavos)}</td>
      <td><button class="btn btn-pequeno" data-reimprimir="${v.numero}">Reimprimir</button>
      ${v.status === 'paga' ? `<button class="btn btn-pequeno btn-perigo" data-cancelar="${v.numero}">Cancelar</button>` : ''}</td>
    </tr>`).join('') || '<tr><td class="vazio" colspan="7">Sem vendas no período.</td></tr>';
}

$('#btn-filtrar-vendas').onclick = carregarVendas;
$('#aba-vendas').onclick = async e => {
  const b = e.target.closest('button');
  if (!b) return;
  try {
    if (b.dataset.pagar) {
      const { avisos } = await pdv.atualizarVenda(Number(b.dataset.pagar), { status: 'paga' });
      toast(avisos[0] || 'Pedido marcado como pago', avisos.length ? 'erro' : 'ok');
    } else if (b.dataset.cancelar) {
      if (!confirm(`Cancelar a venda ${b.dataset.cancelar}? O estoque será devolvido se ela estava paga.`)) return;
      await pdv.atualizarVenda(Number(b.dataset.cancelar), { status: 'cancelada' });
      toast('Venda cancelada');
    } else if (b.dataset.reimprimir) {
      await pdv.reimprimir(Number(b.dataset.reimprimir));
      toast('Enviado para a impressora', 'ok');
      return;
    } else return;
    await carregarVendas();
    await carregarDados();
  } catch (err) { toast(err.message, 'erro'); }
};

// ---------- configurações ----------
async function carregarConfig() {
  const c = await pdv.configAdmin();
  const f = $('#form-config');
  ['nomeLoja', 'cnpj', 'endereco', 'mensagemCupom', 'pixChave', 'pixNome', 'pixCidade',
    'pinAdmin', 'pinAtendente', 'tempoInatividadeSeg'].forEach(k => (f[k].value = c[k] ?? ''));
  f.confirmarPagamentoComPin.checked = !!c.confirmarPagamentoComPin;
  f.imprimirCupom.checked = !!c.imprimirCupom;
  f.fiscalModo.value = c.fiscal?.modo || 'desativado';
  f.fiscalPasta.value = c.fiscal?.pastaIntegracao || '';
  try {
    const imps = await pdv.impressoras();
    $('#sel-impressora').innerHTML = '<option value="">(impressora padrão do Windows)</option>' +
      imps.map(i => `<option value="${esc(i.nome)}">${esc(i.nome)}${i.padrao ? ' — padrão' : ''}</option>`).join('');
  } catch { /* sem impressoras */ }
  f.impressoraCupom.value = c.impressoraCupom || '';
}

$('#form-config').onsubmit = async e => {
  e.preventDefault();
  const f = e.target;
  if (!/^\d{4,8}$/.test(f.pinAdmin.value) || !/^\d{4,8}$/.test(f.pinAtendente.value))
    return toast('Os PINs devem ter de 4 a 8 números.', 'erro');
  if (f.fiscalModo.value === 'pasta' && !f.fiscalPasta.value)
    return toast('Escolha a pasta de integração fiscal.', 'erro');
  try {
    await pdv.salvarConfig({
      nomeLoja: f.nomeLoja.value, cnpj: f.cnpj.value, endereco: f.endereco.value, mensagemCupom: f.mensagemCupom.value,
      pixChave: f.pixChave.value.trim(), pixNome: f.pixNome.value, pixCidade: f.pixCidade.value,
      pinAdmin: f.pinAdmin.value, pinAtendente: f.pinAtendente.value,
      confirmarPagamentoComPin: f.confirmarPagamentoComPin.checked,
      tempoInatividadeSeg: Math.max(30, Number(f.tempoInatividadeSeg.value) || 90),
      imprimirCupom: f.imprimirCupom.checked, impressoraCupom: f.impressoraCupom.value,
      fiscal: { modo: f.fiscalModo.value, pastaIntegracao: f.fiscalPasta.value }
    });
    await carregarDados();
    toast('Configurações salvas', 'ok');
  } catch (err) { toast(err.message, 'erro'); }
};
$('#btn-pasta-fiscal').onclick = async () => {
  const p = await pdv.escolherPasta();
  if (p) $('#form-config').fiscalPasta.value = p;
};
$('#btn-backup').onclick = async () => {
  try { const arq = await pdv.backup(); if (arq) toast('Backup salvo em ' + arq, 'ok'); }
  catch (err) { toast(err.message, 'erro'); }
};
$('#btn-fechar-sistema').onclick = () => { if (confirm('Fechar o PDV?')) pdv.sair(); };

$$('.aba').forEach(a => (a.onclick = () => trocarAba(a.dataset.aba)));
$('#btn-sair-admin').onclick = () => { carregarDados(); mostrarTela('inicio'); };
