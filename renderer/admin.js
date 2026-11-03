// Painel administrativo (protegido por PIN)
const formas = { pix: 'PIX', cartao: 'Cartão', caixa: 'Caixa' };
const meiosNome = { dinheiro: 'Dinheiro', pix: 'PIX', cartao: 'Cartão', balcao: 'Balcão (sem forma)' };
const statusNome = { paga: 'Paga', aguardando_caixa: 'Aguardando caixa', cancelada: 'Cancelada' };
let produtoEditando = null;
let categoriaEditando = null;
let aoSalvarCategoria = null; // usado quando a categoria é criada de dentro do cadastro de produto

// O PIN diz quem entrou: admin vê tudo; atendente vê só Vendas e o fechamento do caixa
let quemEstaNoPainel = null;
async function abrirAdmin() {
  if (document.body.dataset.tela === 'admin') return;
  const pin = await pedirPin('Digite seu PIN');
  if (pin === null) return;
  try { quemEstaNoPainel = await pdv.entrarPainel(pin); }
  catch { return toast('PIN incorreto', 'erro'); }
  document.body.dataset.perfil = quemEstaNoPainel.perfil;
  $('#painel-quem').textContent = quemEstaNoPainel.nome;
  $('.admin-topo h1').textContent = quemEstaNoPainel.perfil === 'admin' ? 'Painel da loja' : 'Caixa';
  mostrarTela('admin');
  trocarAba(quemEstaNoPainel.perfil === 'admin' ? 'produtos' : 'vendas');
}

function trocarAba(nome) {
  if (quemEstaNoPainel?.perfil !== 'admin' && nome !== 'vendas') nome = 'vendas';
  $$('.aba').forEach(a => a.classList.toggle('ativa', a.dataset.aba === nome));
  $$('.aba-conteudo').forEach(c => c.classList.toggle('ativa', c.id === 'aba-' + nome));
  if (nome === 'produtos') renderTabelaProdutos();
  if (nome === 'categorias') renderTabelaCategorias();
  if (nome === 'vendas') carregarVendas();
  if (nome === 'indicadores') carregarIndicadores();
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
  const fEstoque = $('#filtro-estoque-admin').value;
  const baixos = estado.produtos.filter(estoqueBaixo);
  const zerados = baixos.filter(p => p.estoque <= 0);
  const aviso = $('#aviso-estoque');
  aviso.hidden = !baixos.length || !!fEstoque;
  aviso.innerHTML = `${icone('alerta', 20)} <b>${baixos.length} produto(s) com estoque baixo</b>` +
    (zerados.length ? ` — ${zerados.length} esgotado(s)` : '') + ' <u>Ver lista</u>';
  const exemplos = estado.produtos.filter(p => p.precoExemplo);
  const avisoEx = $('#aviso-exemplo');
  avisoEx.hidden = !exemplos.length || fEstoque === 'exemplo';
  avisoEx.innerHTML = `${icone('alerta', 20)} <b>${exemplos.length} produto(s) com preço de exemplo</b> — confira antes de abrir a loja <u>Ver lista</u>`;
  const situacao = {
    baixo: estoqueBaixo,
    zerado: p => p.controlarEstoque !== false && p.estoque <= 0,
    exemplo: p => p.precoExemplo,
    semFoto: p => !p.imagem,
    ocultos: p => !p.ativo
  }[fEstoque];
  const lista = estado.produtos
    .filter(p => !filtro.value || p.categoria === filtro.value)
    .filter(p => !situacao || situacao(p))
    .filter(p => !termo || p.nome.toLowerCase().includes(termo) || p.codigoBarras.includes(termo) ||
      (p.opcoes || []).some(g => g.itens.some(i => (i.codigoBarras || '').includes(termo))))
    .sort((a, b) => a.nome.localeCompare(b.nome));
  estado.listaAdmin = lista.map(p => p.id);
  // loja sem controle de estoque: a coluna Estoque não diz nada, some da tabela
  $('.tabela-produtos').classList.toggle('sem-estoque', estado.config.controlarEstoque === false);
  for (const id of [...selecionados]) if (!estado.produtos.some(p => p.id === id)) selecionados.delete(id);
  const precoTexto = c => (c / 100).toFixed(2).replace('.', ',');
  $('#tabela-produtos').innerHTML = lista.map(p => `
    <tr class="${p.ativo ? '' : 'inativo'} ${selecionados.has(p.id) ? 'selecionada' : ''}">
      <td><input type="checkbox" data-sel="${p.id}" ${selecionados.has(p.id) ? 'checked' : ''} aria-label="Selecionar ${esc(p.nome)}"></td>
      <td>${p.imagem ? `<img class="mini" src="${esc(urlArquivo(p.imagem))}" alt="">` : ''}</td>
      <td>${esc(p.nome)}${p.ativo ? '' : ' <small>(oculto)</small>'}${(p.opcoes || []).length ? `<br><small class="ajuda">Variações: ${p.opcoes.map(g => esc(g.nome)).join(', ')}</small>` : ''}</td>
      <td>${esc(p.codigoBarras)}</td>
      <td><span class="cat-tabela">${icone(iconeCategoria(p.categoria), 18)} ${esc(p.categoria)}</span></td>
      <td class="celula-preco"><label class="preco-rapido">R$ <input inputmode="decimal" data-preco="${p.id}" value="${precoTexto(p.precoCentavos)}" aria-label="Preço de ${esc(p.nome)}"></label>
        ${p.precoExemplo ? '<small class="selo-exemplo" title="Preço de exemplo: digite o preço certo ou aperte Enter para confirmar">exemplo</small>' : ''}</td>
      <td class="col-estoque ${estoqueBaixo(p) ? 'alerta' : ''}">${p.controlarEstoque === false ? '<small>feito na hora</small>' : `${p.estoque} <small class="ajuda">mín. ${p.estoqueMinimo ?? 3}</small>`}</td>
      <td><label class="chave"><input type="checkbox" data-ativo="${p.id}" ${p.ativo ? 'checked' : ''} aria-label="${esc(p.nome)} no totem"><span></span></label></td>
      <td class="acoes"><button class="btn btn-pequeno" data-editar="${p.id}">Editar</button><button class="btn btn-pequeno btn-fantasma" data-duplicar="${p.id}">Duplicar</button></td>
    </tr>`).join('') || '<tr><td class="vazio" colspan="9">Nenhum produto com esse filtro.</td></tr>';
  atualizarBarraMassa();
}

// ---------- seleção e ações em massa ----------
const selecionados = new Set();
function atualizarBarraMassa() {
  const n = selecionados.size;
  $('#barra-massa').hidden = !n;
  $('#massa-qtd').textContent = `${n} selecionado(s)`;
  $('#massa-categoria').innerHTML = '<option value="">Mudar categoria…</option>' + opcoesCategorias();
  const visiveis = estado.listaAdmin || [];
  const todos = $('#sel-todos');
  todos.checked = visiveis.length > 0 && visiveis.every(id => selecionados.has(id));
  todos.indeterminate = !todos.checked && visiveis.some(id => selecionados.has(id));
}
$('#sel-todos').onchange = e => {
  for (const id of estado.listaAdmin || []) e.target.checked ? selecionados.add(id) : selecionados.delete(id);
  renderTabelaProdutos();
};
async function aplicarEmMassa(acao, valor) {
  const ids = [...selecionados];
  if (!ids.length) return;
  if (acao === 'excluir' && !confirm(`Excluir ${ids.length} produto(s)? Vendas antigas continuam no histórico.`)) return;
  try {
    const n = await pdv.produtosEmMassa(ids, acao, valor);
    const msg = { mostrar: 'agora aparecem no totem', ocultar: 'ocultos do totem', confirmarPreco: 'com preço confirmado',
      categoria: `movidos para ${valor}`, excluir: 'excluídos' }[acao];
    toast(`${n} produto(s) ${msg}`, 'ok');
    if (acao === 'excluir') selecionados.clear();
    await renderTabelaProdutos();
    await carregarDados();
  } catch (err) { toast(err.message, 'erro'); }
}
$('#barra-massa').onclick = e => {
  const b = e.target.closest('[data-massa]');
  if (!b) return;
  if (b.dataset.massa === 'limpar') { selecionados.clear(); return renderTabelaProdutos(); }
  aplicarEmMassa(b.dataset.massa);
};
$('#massa-categoria').onchange = e => { if (e.target.value) aplicarEmMassa('categoria', e.target.value); };

// preço direto na tabela: Enter ou sair do campo salva; Enter sem mudar confirma o preço de exemplo
async function salvarPrecoRapido(input) {
  const p = estado.produtos.find(x => x.id === input.dataset.preco);
  if (!p) return;
  const centavos = Math.round(Number(input.value.replace(/[^\d,.]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')) * 100);
  if (!centavos || centavos <= 0) { toast('Preço inválido', 'erro'); input.value = (p.precoCentavos / 100).toFixed(2).replace('.', ','); return; }
  if (centavos === p.precoCentavos && !p.precoExemplo) return;
  try {
    await pdv.salvarProduto({ ...p, precoCentavos: centavos, confirmarPreco: true });
    toast(`${p.nome}: ${reais(centavos)}`, 'ok');
    await renderTabelaProdutos();
    await carregarDados();
  } catch (err) { toast(err.message, 'erro'); }
}
$('#tabela-produtos').addEventListener('keydown', e => {
  if (e.target.dataset.preco && e.key === 'Enter') { e.preventDefault(); e.target.dataset.enviado = '1'; salvarPrecoRapido(e.target); }
});
$('#tabela-produtos').addEventListener('focusout', e => {
  if (e.target.dataset.preco && !e.target.dataset.enviado) {
    const p = estado.produtos.find(x => x.id === e.target.dataset.preco);
    const mudou = p && e.target.value !== (p.precoCentavos / 100).toFixed(2).replace('.', ',');
    if (mudou) salvarPrecoRapido(e.target);
  }
});
$('#tabela-produtos').addEventListener('change', async e => {
  if (e.target.dataset.sel) {
    e.target.checked ? selecionados.add(e.target.dataset.sel) : selecionados.delete(e.target.dataset.sel);
    e.target.closest('tr').classList.toggle('selecionada', e.target.checked);
    return atualizarBarraMassa();
  }
  if (e.target.dataset.ativo) {
    const p = estado.produtos.find(x => x.id === e.target.dataset.ativo);
    try {
      await pdv.salvarProduto({ ...p, ativo: e.target.checked });
      toast(e.target.checked ? `${p.nome} aparece no totem` : `${p.nome} oculto do totem`, 'ok');
      await renderTabelaProdutos();
      await carregarDados();
    } catch (err) { toast(err.message, 'erro'); }
  }
});

// abaixo (ou igual) do mínimo cadastrado no produto; feito na hora nunca entra
const estoqueBaixo = p => estado.config.controlarEstoque !== false && p.controlarEstoque !== false && p.estoque <= (p.estoqueMinimo ?? 3);

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

function abrirProduto(p, { novo = false } = {}) {
  produtoEditando = p ? { ...p } : { imagem: '', ativo: true, estoque: 0 };
  produtoEditando.opcoes = JSON.parse(JSON.stringify(produtoEditando.opcoes || []));
  renderEditorOpcoes();
  const f = $('#form-produto');
  f.produtoId.value = produtoEditando.id || '';
  f.nome.value = produtoEditando.nome || '';
  f.codigoBarras.value = produtoEditando.codigoBarras || '';
  f.preco.value = produtoEditando.precoCentavos ? (produtoEditando.precoCentavos / 100).toFixed(2).replace('.', ',') : '';
  f.custo.value = produtoEditando.custoCentavos ? (produtoEditando.custoCentavos / 100).toFixed(2).replace('.', ',') : '';
  f.estoque.value = produtoEditando.estoque ?? 0;
  f.estoqueMinimo.value = produtoEditando.estoqueMinimo ?? 3;
  preencherSelectCategoria(produtoEditando.categoria || $('#filtro-categoria-admin').value);
  f.ativo.checked = produtoEditando.ativo !== false;
  f.controlarEstoque.checked = produtoEditando.controlarEstoque !== false;
  f.estoque.disabled = f.estoqueMinimo.disabled = !f.controlarEstoque.checked;
  const editando = p && !novo;
  $('#produto-titulo').textContent = editando ? 'Editar produto' : novo ? 'Novo produto (cópia)' : 'Novo produto';
  $('#btn-excluir-produto').style.visibility = editando ? 'visible' : 'hidden';
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
      custoCentavos: f.custo.value.trim() ? paraCentavos(f.custo.value) : 0,
      estoque: f.estoque.value,
      estoqueMinimo: f.estoqueMinimo.value,
      categoria: f.categoria.value,
      ativo: f.ativo.checked,
      controlarEstoque: f.controlarEstoque.checked,
      imagem: produtoEditando.imagem,
      opcoes: lerEditorOpcoes()
    });
    fecharProduto();
    toast('Produto salvo', 'ok');
    await renderTabelaProdutos();
    await carregarDados();
  } catch (err) { toast(err.message, 'erro'); }
};
// Enter do leitor no campo de código não deve enviar o formulário
$('#form-produto').codigoBarras.addEventListener('keydown', e => { if (e.key === 'Enter') e.preventDefault(); });

// foto do produto: qualquer formato, reduzida e convertida para WebP leve
$('#btn-imagem').onclick = async () => {
  try {
    const [arq] = await pdv.escolherImagens(false);
    if (!arq) return;
    const { dados } = await otimizarImagem(await pdv.lerImagem(arq.caminho));
    produtoEditando.imagem = await pdv.salvarImagem(dados);
    atualizarPreview();
    toast(`Foto otimizada: ${tamanhoArquivo(arq.bytes)} → ${tamanhoArquivo(dados.length)}`, 'ok');
  } catch (err) { toast(err.message, 'erro'); }
};

// ---------- importar várias fotos ----------
// nome do arquivo = código de barras (ou nome do produto) -> foto vai direto para ele
let fotosPlano = null;
function produtoDaFoto(nomeArquivo) {
  const base = nomeArquivo.replace(/\.[^.]+$/, '').trim();
  const codigo = (base.match(/\d{6,14}/) || [])[0];
  const porCodigo = codigo && estado.produtos.find(p => p.codigoBarras && p.codigoBarras === codigo);
  if (porCodigo) return porCodigo;
  const norm = t => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s*\(\d+\)$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  return estado.produtos.find(p => norm(p.nome) === norm(base));
}
$('#btn-importar-fotos').onclick = async () => {
  try {
    const arquivos = await pdv.escolherImagens(true);
    if (!arquivos.length) return;
    estado.produtos = await pdv.produtos();
    const porProduto = new Map(), semProduto = [];
    for (const a of arquivos) {
      const p = produtoDaFoto(a.nome);
      if (p) porProduto.set(p.id, { arquivo: a, produto: p }); // duas fotos para o mesmo produto: fica a última
      else semProduto.push(a.nome);
    }
    const repetidas = arquivos.length - semProduto.length - porProduto.size;
    const jaTem = [...porProduto.values()].filter(x => x.produto.imagem).length;
    fotosPlano = [...porProduto.values()];
    $('#fotos-resumo').innerHTML = [['Fotos escolhidas', arquivos.length], ['Com produto', porProduto.size], ['Sem produto', semProduto.length]]
      .map(([t, v]) => `<div class="card-resumo"><small>${t}</small><strong>${v}</strong></div>`).join('');
    $('#fotos-substituir-linha').hidden = !jaTem;
    $('#fotos-substituir-texto').textContent = `Substituir a foto de ${jaTem} produto(s) que já têm foto`;
    $('#fotos-detalhes').innerHTML =
      (repetidas ? `<p class="ajuda">${repetidas} foto(s) eram do mesmo produto de outra; ficou a última.</p>` : '') +
      (semProduto.length ? `<p><b>Sem produto com esse código ou nome (ficam de fora):</b></p><ul class="lista-erros">${semProduto.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : '');
    $('#fotos-progresso').hidden = true;
    $('#btn-fotos-confirmar').disabled = !fotosPlano.length;
    $('#btn-fotos-confirmar').textContent = fotosPlano.length ? `Importar ${fotosPlano.length} foto(s)` : 'Nada para importar';
    $('#btn-fotos-cancelar').disabled = false;
    $('#btn-fotos-cancelar').textContent = 'Cancelar';
    $('#modal-fotos').classList.add('aberto');
  } catch (err) { toast(err.message, 'erro'); }
};
$('#btn-fotos-cancelar').onclick = () => $('#modal-fotos').classList.remove('aberto');
$('#btn-fotos-confirmar').onclick = async () => {
  const substituir = $('#fotos-substituir').checked;
  const fila = fotosPlano.filter(x => substituir || !x.produto.imagem);
  $('#btn-fotos-confirmar').disabled = $('#btn-fotos-cancelar').disabled = true;
  $('#fotos-progresso').hidden = false;
  let ok = 0, antes = 0, depois = 0;
  const erros = [];
  for (const [i, { arquivo, produto }] of fila.entries()) {
    $('#fotos-progresso-texto').textContent = `Otimizando ${i + 1} de ${fila.length}: ${arquivo.nome}`;
    $('#fotos-barra').style.width = `${(i / fila.length) * 100}%`;
    try {
      const { dados } = await otimizarImagem(await pdv.lerImagem(arquivo.caminho));
      await pdv.definirImagemProduto(produto.id, await pdv.salvarImagem(dados));
      ok++; antes += arquivo.bytes; depois += dados.length;
    } catch (err) { erros.push(`${arquivo.nome}: ${err.message}`); }
  }
  $('#fotos-barra').style.width = '100%';
  $('#fotos-progresso-texto').textContent = `${ok} foto(s) aplicada(s). Tamanho total: ${tamanhoArquivo(antes)} → ${tamanhoArquivo(depois)}.`;
  if (erros.length) $('#fotos-detalhes').innerHTML = `<p><b>Não deu para usar:</b></p><ul class="lista-erros">${erros.map(e => `<li>${esc(e)}</li>`).join('')}</ul>`;
  $('#btn-fotos-cancelar').disabled = false;
  $('#btn-fotos-cancelar').textContent = 'Fechar';
  toast(`${ok} foto(s) importada(s)`, erros.length ? 'erro' : 'ok');
  await renderTabelaProdutos();
  await carregarDados();
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
// ---------- editor de variações (sabor, frutas, adicionais) ----------
const centavosParaTexto = c => c ? (c / 100).toFixed(2).replace('.', ',') : '';

function renderEditorOpcoes() {
  const grupos = produtoEditando.opcoes;
  $('#lista-grupos-opcoes').innerHTML = grupos.map((g, gi) => `
    <div class="grupo-edit" data-g="${gi}">
      <div class="grupo-edit-topo">
        <label>Nome do grupo<input class="g-nome" value="${esc(g.nome || '')}" placeholder="Ex.: Sabor"></label>
        <label class="curto">Mínimo<input class="g-min" type="number" min="0" value="${g.min ?? 1}"></label>
        <label class="curto">Máximo<input class="g-max" type="number" min="1" value="${g.max ?? 1}"></label>
        <button type="button" class="btn-mini" data-rem-g="${gi}" aria-label="Remover grupo">${icone('lixo', 18)}</button>
      </div>
      ${(g.itens || []).map((i, ii) => `
        <div class="item-edit">
          <input class="i-nome" value="${esc(i.nome || '')}" placeholder="Opção (ex.: Morango)">
          <input class="i-preco" value="${centavosParaTexto(i.precoCentavos)}" placeholder="+ R$ 0,00" inputmode="decimal">
          <input class="i-codigo" value="${esc(i.codigoBarras || '')}" placeholder="Código (opcional)" inputmode="numeric" title="Código de barras deste sabor, se ele tiver embalagem própria">
          <button type="button" class="btn-mini" data-rem-i="${gi}:${ii}" aria-label="Remover opção">${icone('fechar', 16)}</button>
          <input class="i-desc" value="${esc(i.descricao || '')}" placeholder="Ingredientes ou descrição (opcional, aparece no totem)" maxlength="160">
        </div>`).join('')}
      <button type="button" class="btn btn-pequeno" data-add-i="${gi}">+ Opção</button>
    </div>`).join('');
}

// lê o que está na tela de volta para produtoEditando.opcoes (mantendo os ids já salvos)
function lerEditorOpcoes() {
  produtoEditando.opcoes = $$('#lista-grupos-opcoes .grupo-edit').map(el => {
    const antigo = produtoEditando.opcoes[Number(el.dataset.g)] || {};
    return {
      id: antigo.id, nome: el.querySelector('.g-nome').value.trim(),
      min: Number(el.querySelector('.g-min').value) || 0, max: Number(el.querySelector('.g-max').value) || 1,
      itens: [...el.querySelectorAll('.item-edit')].map((it, ii) => ({
        id: (antigo.itens || [])[ii]?.id, nome: it.querySelector('.i-nome').value.trim(),
        precoCentavos: paraCentavos(it.querySelector('.i-preco').value || '0'),
        codigoBarras: it.querySelector('.i-codigo').value.trim(),
        descricao: it.querySelector('.i-desc').value.trim()
      }))
    };
  });
  return produtoEditando.opcoes;
}

$('#btn-add-grupo').onclick = () => {
  lerEditorOpcoes();
  produtoEditando.opcoes.push({ nome: '', min: 1, max: 1, itens: [{ nome: '', precoCentavos: 0 }] });
  renderEditorOpcoes();
  $$('#lista-grupos-opcoes .g-nome').pop().focus();
};
$('#lista-grupos-opcoes').onclick = e => {
  const b = e.target.closest('button');
  if (!b) return;
  lerEditorOpcoes();
  const grupos = produtoEditando.opcoes;
  if (b.dataset.addI !== undefined) grupos[Number(b.dataset.addI)].itens.push({ nome: '', precoCentavos: 0 });
  if (b.dataset.remG !== undefined) grupos.splice(Number(b.dataset.remG), 1);
  if (b.dataset.remI !== undefined) { const [gi, ii] = b.dataset.remI.split(':').map(Number); grupos[gi].itens.splice(ii, 1); }
  renderEditorOpcoes();
  if (b.dataset.addI !== undefined) $$(`#lista-grupos-opcoes .grupo-edit[data-g="${b.dataset.addI}"] .i-nome`).pop().focus();
};

$('#form-produto').controlarEstoque.onchange = e => {
  const f = $('#form-produto');
  f.estoque.disabled = f.estoqueMinimo.disabled = !e.target.checked;
};
$('#filtro-estoque-admin').onchange = renderTabelaProdutos;
$('#aviso-estoque').onclick = () => { $('#filtro-estoque-admin').value = 'baixo'; renderTabelaProdutos(); };
$('#aviso-exemplo').onclick = () => { $('#filtro-estoque-admin').value = 'exemplo'; renderTabelaProdutos(); };

// ---------- planilhas ----------
const fecharMenuPlanilha = () => $('.menu-planilha').removeAttribute('open');
$('#btn-modelo-produtos').onclick = async () => {
  fecharMenuPlanilha();
  try { const arq = await pdv.baixarModelo(); if (arq) toast('Modelo salvo em ' + arq, 'ok'); }
  catch (err) { toast(err.message, 'erro'); }
};
$('#btn-exportar-produtos').onclick = async () => {
  fecharMenuPlanilha();
  try { const arq = await pdv.exportarProdutos(); if (arq) toast('Planilha salva em ' + arq, 'ok'); }
  catch (err) { toast(err.message, 'erro'); }
};
$('#btn-importar-produtos').onclick = async () => {
  fecharMenuPlanilha();
  try {
    const r = await pdv.lerPlanilhaProdutos();
    if (!r) return;
    $('#importar-arquivo').textContent = r.arquivo;
    $('#importar-resumo').innerHTML = [
      ['Produtos novos', r.novos], ['Produtos atualizados', r.atualizados],
      ['Linhas com problema', r.erros.length]
    ].map(([t, v]) => `<div class="card-resumo"><small>${t}</small><strong>${v}</strong></div>`).join('');
    $('#importar-erros').innerHTML =
      (r.categoriasNovas.length ? `<p class="ajuda">Categorias que serão criadas: <b>${r.categoriasNovas.map(esc).join(', ')}</b></p>` : '') +
      (r.erros.length ? `<p><b>Estas linhas vão ficar de fora:</b></p><ul class="lista-erros">${r.erros.map(e =>
        `<li><b>Linha ${e.linha}:</b> ${esc(e.erro)}</li>`).join('')}</ul>` : '');
    const total = r.novos + r.atualizados;
    $('#btn-importar-confirmar').disabled = !total;
    $('#btn-importar-confirmar').textContent = total ? `Importar ${total} produto(s)` : 'Nada para importar';
    $('#modal-importar').classList.add('aberto');
  } catch (err) { toast(err.message, 'erro'); }
};
$('#btn-importar-cancelar').onclick = () => $('#modal-importar').classList.remove('aberto');
$('#btn-importar-confirmar').onclick = async () => {
  try {
    const r = await pdv.importarProdutos();
    $('#modal-importar').classList.remove('aberto');
    toast(`Importado: ${r.novos} novo(s), ${r.atualizados} atualizado(s)`, 'ok');
    await renderTabelaProdutos();
    await carregarDados();
  } catch (err) { toast(err.message, 'erro'); }
};
$('#btn-exportar-vendas').onclick = async () => {
  try {
    const arq = await pdv.exportarVendas({ de: $('#vendas-de').value, ate: $('#vendas-ate').value });
    if (arq) toast('Planilha salva em ' + arq, 'ok');
  } catch (err) { toast(err.message, 'erro'); }
};
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
  if (b) return abrirProduto(estado.produtos.find(p => p.id === b.dataset.editar));
  const d = e.target.closest('[data-duplicar]');
  if (d) duplicarProduto(estado.produtos.find(p => p.id === d.dataset.duplicar));
};

// copia o produto (foto, categoria, variações) e abre como novo; códigos de barras ficam em branco
function duplicarProduto(p) {
  const copia = JSON.parse(JSON.stringify(p));
  delete copia.id; delete copia.precoExemplo;
  copia.nome = p.nome + ' (cópia)';
  copia.codigoBarras = '';
  for (const g of copia.opcoes || []) { delete g.id; for (const i of g.itens) { delete i.id; delete i.codigoBarras; } }
  abrirProduto(copia, { novo: true });
  setTimeout(() => $('#form-produto').nome.select(), 60);
}

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
    ['Pago no balcão', reais(porForma('caixa'))],
    ['Dinheiro', reais(soma(pagas.filter(v => v.formaPagamento === 'caixa' && v.recebidoComo === 'dinheiro')))]
  ].map(([t, v]) => `<div class="card-resumo"><small>${t}</small><strong>${v}</strong></div>`).join('');

  // pedidos "pagar no caixa" de qualquer dia que ainda não foram resolvidos
  const aguardando = (await pdv.vendas({})).filter(v => v.status === 'aguardando_caixa');
  $('#tabela-aguardando').innerHTML = aguardando.length ? aguardando.map(v => `
    <tr><td><b>Pedido ${v.numero}</b></td><td>${new Date(v.data).toLocaleString('pt-BR')}</td>
    <td>${v.itens.map(i => `${i.qtd}× ${esc(i.nome)}${i.opcoes ? ` <small class="ajuda">(${esc(i.opcoes)})</small>` : ''}`).join('<br>')}</td><td><b>${reais(v.totalCentavos)}</b></td>
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
      <td>${v.itens.reduce((s, i) => s + i.qtd, 0)}</td><td>${formas[v.formaPagamento]}${v.recebidoComo ? ` <small class="ajuda">· ${meiosNome[v.recebidoComo]}</small>` : ''}</td>
      <td>${statusNome[v.status]}${quemFez(v)}</td><td>${reais(v.totalCentavos)}</td>
      <td><button class="btn btn-pequeno" data-reimprimir="${v.numero}">Reimprimir</button>
      ${v.status === 'paga' && podeCancelarPaga() ? `<button class="btn btn-pequeno btn-perigo" data-cancelar="${v.numero}">Cancelar</button>` : ''}</td>
    </tr>`).join('') || '<tr><td class="vazio" colspan="7">Sem vendas no período.</td></tr>';
  await carregarFechamentos();
}

// "por Ana" embaixo da situação; passando o mouse mostra o histórico completo
const podeCancelarPaga = () => quemEstaNoPainel?.perfil === 'admin' || !!estado.config.atendentePodeCancelar;
const acoesNome = { pedido: 'Pedido criado', paga: 'Pago', cancelada: 'Cancelado' };
function quemFez(v) {
  const h = v.historico || [];
  if (!h.length) return '';
  const ult = h[h.length - 1];
  const tudo = h.map(x => `${acoesNome[x.acao] || x.acao} — ${x.por} — ${new Date(x.em).toLocaleString('pt-BR')}`).join('\n');
  return `<br><small class="ajuda" title="${esc(tudo)}">por ${esc(ult.por)}</small>`;
}

// ---------- receber pedido no balcão: dinheiro, PIX ou cartão (entra certo no fluxo de caixa) ----------
let receber = null;
async function abrirReceber(numero) {
  const v = (await pdv.vendas({})).find(x => x.numero === numero);
  if (!v) return toast('Pedido não encontrado', 'erro');
  receber = { numero, total: v.totalCentavos, meio: '' };
  $('#receber-titulo').textContent = `Receber pedido ${numero}`;
  $('#receber-total').textContent = reais(v.totalCentavos);
  $('#receber-valor').value = '';
  $('#receber-troco-valor').textContent = reais(0);
  $('#receber-troco').hidden = true;
  $$('[data-receber]').forEach(x => x.classList.remove('ativo'));
  $('#btn-receber-confirmar').disabled = true;
  $('#modal-receber').classList.add('aberto');
}
const lerReais = t => Math.round(Number(String(t).replace(/[^\d,.]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')) * 100) || 0;
function atualizarTroco() {
  const recebido = lerReais($('#receber-valor').value);
  const troco = recebido - receber.total;
  $('#receber-troco-valor').textContent = recebido ? (troco >= 0 ? reais(troco) : `faltam ${reais(-troco)}`) : reais(0);
}
$('.receber-formas').onclick = e => {
  const b = e.target.closest('[data-receber]');
  if (!b) return;
  receber.meio = b.dataset.receber;
  $$('[data-receber]').forEach(x => x.classList.toggle('ativo', x === b));
  $('#receber-troco').hidden = receber.meio !== 'dinheiro';
  $('#btn-receber-confirmar').disabled = false;
  if (receber.meio === 'dinheiro') setTimeout(() => $('#receber-valor').focus(), 30);
};
$('#receber-valor').oninput = atualizarTroco;
$('#btn-receber-cancelar').onclick = () => $('#modal-receber').classList.remove('aberto');
$('#btn-receber-confirmar').onclick = async () => {
  if (!receber?.meio) return;
  if (receber.meio === 'dinheiro' && $('#receber-valor').value && lerReais($('#receber-valor').value) < receber.total)
    return toast('O valor recebido é menor que o total', 'erro');
  try {
    const { avisos } = await pdv.atualizarVenda(receber.numero, { status: 'paga', recebidoComo: receber.meio });
    $('#modal-receber').classList.remove('aberto');
    toast(avisos[0] || `Pedido ${receber.numero} pago (${meiosNome[receber.meio]})`, avisos.length ? 'erro' : 'ok');
    await carregarVendas();
  } catch (err) { toast(err.message, 'erro'); }
};

// ---------- indicadores ----------
const diaISO = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const diaCurto = iso => iso.slice(8, 10) + '/' + iso.slice(5, 7);
function periodo(tipo) {
  const hoje = new Date(), de = new Date(hoje);
  if (tipo === '7') de.setDate(hoje.getDate() - 6);
  else if (tipo === '30') de.setDate(hoje.getDate() - 29);
  else if (tipo === 'mes') de.setDate(1);
  $('#ind-de').value = diaISO(de); $('#ind-ate').value = diaISO(hoje);
  $$('[data-periodo]').forEach(b => b.classList.toggle('ativo', b.dataset.periodo === tipo));
}
$('.periodos').onclick = e => { const b = e.target.closest('[data-periodo]'); if (b) { periodo(b.dataset.periodo); carregarIndicadores(); } };
$('#btn-ind-filtrar').onclick = () => { $$('[data-periodo]').forEach(b => b.classList.remove('ativo')); carregarIndicadores(); };

// barras verticais (uma série, cor da marca); passar o mouse mostra o valor
function graficoColunas(itens, { largura = 600, altura = 170, rotuloCada = 1 } = {}) {
  const L = largura, H = altura, base = H - 24, topo = 12;
  const max = Math.max(1, ...itens.map(i => i.valor));
  const passo = L / itens.length, larg = Math.max(2, Math.min(28, passo - 4));
  const linhas = [0.5, 1].map(f => `<line x1="0" x2="${L}" y1="${base - (base - topo) * f}" y2="${base - (base - topo) * f}" class="grade"/>`).join('');
  const barras = itens.map((it, i) => {
    const h = (base - topo) * it.valor / max, x = i * passo + (passo - larg) / 2;
    return `<g class="marca-barra"><rect x="${i * passo}" y="${topo}" width="${passo}" height="${base - topo}" fill="transparent"><title>${esc(it.dica)}</title></rect>` +
      (it.valor ? `<rect x="${x}" y="${base - h}" width="${larg}" height="${h}" rx="3" class="barra"><title>${esc(it.dica)}</title></rect>` : '') +
      (i % rotuloCada === 0 ? `<text x="${i * passo + passo / 2}" y="${H - 6}" text-anchor="middle">${esc(it.rotulo)}</text>` : '') + '</g>';
  }).join('');
  return `<svg class="grafico" viewBox="0 0 ${L} ${H}" role="img" aria-label="gráfico">${linhas}<line x1="0" x2="${L}" y1="${base}" y2="${base}" class="eixo"/>${barras}` +
    `<text x="0" y="${topo - 2}" class="maximo">${esc(itens.maxRotulo || '')}</text></svg>`;
}
// barras horizontais com nome e valor escritos
function graficoBarras(itens) {
  const max = Math.max(1, ...itens.map(i => i.valor));
  return `<ul class="barras-h">${itens.map(i => `<li title="${esc(i.dica || '')}"><span class="bh-nome">${esc(i.nome)}</span>` +
    `<span class="bh-trilho"><span class="bh-barra" style="width:${Math.max(i.valor ? 1.5 : 0, 100 * i.valor / max)}%"></span></span>` +
    `<span class="bh-valor">${esc(i.texto)}</span></li>`).join('')}</ul>`;
}
async function carregarIndicadores() {
  if (!$('#ind-de').value) periodo('hoje');
  let r;
  try { r = await pdv.indicadores({ de: $('#ind-de').value, ate: $('#ind-ate').value }); }
  catch (err) { return toast(err.message, 'erro'); }
  const pct = (a, b) => b ? Math.round((a - b) / b * 100) : null;
  const varFat = pct(r.faturamentoCentavos, r.anterior.faturamentoCentavos);
  const comp = v => v === null ? '<small class="ajuda">sem vendas no período anterior</small>'
    : `<small class="${v >= 0 ? 'sobe' : 'desce'}">${v >= 0 ? '▲' : '▼'} ${Math.abs(v)}% vs ${diaCurto(r.anterior.de)}${r.dias > 1 ? '–' + diaCurto(r.anterior.ate) : ''}</small>`;
  $('#ind-cards').innerHTML = [
    ['Faturamento', reais(r.faturamentoCentavos), comp(varFat)],
    ['Vendas pagas', r.vendas, comp(pct(r.vendas, r.anterior.vendas))],
    ['Ticket médio', reais(r.ticketMedioCentavos), `<small class="ajuda">${String(r.itensPorVenda).replace('.', ',')} itens por venda</small>`],
    ['Canceladas', r.canceladas, `<small class="ajuda">${reais(r.canceladasCentavos)}</small>`],
    ['Lucro bruto', r.lucro.margem === null ? '—' : reais(r.lucro.lucroCentavos),
      r.lucro.margem === null ? '<small class="ajuda">cadastre o custo dos produtos para ver</small>'
        : `<small class="ajuda">margem ${String(r.lucro.margem).replace('.', ',')}%${r.lucro.cobertura < 100 ? ` · ${r.lucro.cobertura}% das vendas com custo` : ''}</small>`],
    ['Preparo médio', r.preparoMinutos === null ? '—' : `${String(r.preparoMinutos).replace('.', ',')} min`, `<small class="ajuda">${r.preparosMedidos} pedido(s) marcados prontos</small>`]
  ].map(([t, v, extra]) => `<div class="card-resumo"><small>${t}</small><strong>${v}</strong>${extra}</div>`).join('') +
    (r.aguardando ? `<p class="aviso-ind">${r.aguardando} pedido(s) ainda aguardando pagamento no balcão: ficam fora destes números até serem recebidos.</p>` : '');

  // fluxo de caixa
  const col = r.fluxo.map(f => ({ rotulo: diaCurto(f.dia), valor: f.total, dica: `${diaCurto(f.dia)}: ${reais(f.total)} em ${f.vendas} venda(s)` }));
  col.maxRotulo = 'maior dia: ' + reais(Math.max(0, ...r.fluxo.map(f => f.total)));
  $('#ind-fluxo-grafico').innerHTML = r.dias > 1 ? graficoColunas(col, { largura: 1200, altura: 190, rotuloCada: Math.ceil(r.dias / 15) }) : '';
  const c = v => v ? reais(v) : '<span class="ajuda">—</span>';
  $('#ind-fluxo').innerHTML = r.fluxo.slice().reverse().map(f => `<tr><td>${diaCurto(f.dia)}</td><td>${c(f.dinheiro)}</td><td>${c(f.pix)}</td><td>${c(f.cartao)}</td><td>${c(f.balcao)}</td><td><b>${c(f.total)}</b></td><td>${reais(f.acumulado)}</td></tr>`).join('');
  const t = k => r.fluxo.reduce((s, f) => s + f[k], 0);
  $('#ind-fluxo-total').innerHTML = `<tr><th>Total</th><th>${reais(t('dinheiro'))}</th><th>${reais(t('pix'))}</th><th>${reais(t('cartao'))}</th><th>${reais(t('balcao'))}</th><th>${reais(t('total'))}</th><th></th></tr>`;

  const tot = r.faturamentoCentavos || 1;
  const parte = v => `${reais(v)} · ${Math.round(100 * v / tot)}%`;
  $('#ind-meio').innerHTML = graficoBarras(['dinheiro', 'pix', 'cartao', 'balcao'].filter(k => k !== 'balcao' || r.porMeio.balcao)
    .map(k => ({ nome: meiosNome[k], valor: r.porMeio[k], texto: parte(r.porMeio[k]) })));
  // das 6h às 22h, ampliando se houve venda fora desse horário
  const comVenda = r.porHora.filter(h => h.vendas).map(h => h.hora);
  const h0 = Math.min(6, ...comVenda), h1 = Math.max(22, ...comVenda);
  const horas = r.porHora.filter(h => h.hora >= h0 && h.hora <= h1);
  const colH = horas.map(h => ({ rotulo: `${h.hora}h`, valor: h.vendas, dica: `${h.hora}h–${h.hora + 1}h: ${h.vendas} venda(s), ${reais(h.totalCentavos)}` }));
  colH.maxRotulo = 'pico: ' + Math.max(0, ...horas.map(h => h.vendas)) + ' venda(s)';
  $('#ind-hora').innerHTML = r.vendas ? graficoColunas(colH, { rotuloCada: 2 }) : '<p class="ajuda">Sem vendas no período.</p>';
  $('#ind-categoria').innerHTML = r.porSecao.length
    ? `<p class="secoes-ind">${r.porSecao.map(x => `<b>${esc(x.nome)}</b> ${parte(x.totalCentavos)}`).join(' · ')}</p>` +
      graficoBarras(r.porCategoria.slice(0, 8).map(x => ({ nome: x.nome, valor: x.totalCentavos, texto: parte(x.totalCentavos) })))
    : '<p class="ajuda">Sem vendas no período.</p>';
  $('#ind-top').innerHTML = r.maisVendidos.length ? r.maisVendidos.map((p, i) =>
    `<tr><td>${i + 1}º</td><td>${esc(p.nome)}</td><td>${p.qtd} un.</td><td>${reais(p.totalCentavos)}</td><td>${p.semCusto ? '<small class="ajuda">sem custo</small>' : `<small class="ajuda">lucro</small> ${reais(p.lucroCentavos)}`}</td></tr>`).join('')
    : '<tr><td class="vazio">Sem vendas no período.</td></tr>';
}

async function carregarFechamentos() {
  const lista = await pdv.fechamentos();
  $('#tabela-fechamentos').innerHTML = lista.length ? lista.slice(0, 31).map(f => `
    <tr><td><b>${f.dia.split('-').reverse().join('/')}</b>${f.tipo === 'automatico' ? ' <small class="ajuda">(automático)</small>' : ''}</td>
      <td><b>${reais(f.totalCentavos)}</b></td><td>${reais(f.pixCentavos)}</td><td>${reais(f.cartaoCentavos)}</td><td>${reais(f.caixaCentavos)}</td><td>${f.dinheiroCentavos !== undefined ? reais(f.dinheiroCentavos) : '—'}</td>
      <td>${f.vendasPagas}${f.canceladas ? ` <small class="ajuda">(${f.canceladas} canc.)</small>` : ''}</td>
      <td>${esc(f.por)}${f.observacao ? `<br><small class="ajuda">${esc(f.observacao)}</small>` : ''}</td>
      <td><button class="btn btn-pequeno" data-imprimir-fechamento="${f.id}">Imprimir</button></td></tr>`).join('')
    : '<tr><td class="vazio" colspan="8">Nenhum caixa fechado ainda.</td></tr>';
}

$('#btn-fechar-caixa').onclick = async () => {
  try {
    const r = await pdv.resumoFechamento();
    $('#fechamento-dia').textContent = `Dia ${r.dia.split('-').reverse().join('/')} — fechado por ${quemEstaNoPainel?.nome || ''}`;
    $('#fechamento-resumo').innerHTML = [
      ['Total pago', reais(r.totalCentavos)], ['PIX', reais(r.pixCentavos)], ['Cartão', reais(r.cartaoCentavos)],
      ['Pago no balcão', reais(r.caixaCentavos)], ['Dinheiro na gaveta', reais(r.dinheiroCentavos || 0)], ['Vendas pagas', r.vendasPagas], ['Canceladas', r.canceladas]
    ].map(([t, v]) => `<div class="card-resumo"><small>${t}</small><strong>${v}</strong></div>`).join('');
    const aviso = $('#fechamento-aviso');
    aviso.hidden = !r.aguardando;
    aviso.textContent = r.aguardando ? `Atenção: ${r.aguardando} pedido(s) ainda aguardando pagamento no balcão. Resolva antes ou eles ficam fora do total.` : '';
    $('#fechamento-obs').value = '';
    $('#modal-fechamento').classList.add('aberto');
  } catch (err) { toast(err.message, 'erro'); }
};
$('#btn-abrir-pedidos').onclick = async () => {
  try {
    const onde = await pdv.abrirTelaPedidos();
    toast(onde === 'segundo-monitor' ? 'Tela de pedidos aberta no 2º monitor' : onde === 'ja-aberta' ? 'A tela de pedidos já está aberta' : 'Tela de pedidos aberta (conecte um 2º monitor para ela ir para lá sozinha)', 'ok');
  } catch (err) { toast(err.message, 'erro'); }
};
$('#btn-fechamento-cancelar').onclick = () => $('#modal-fechamento').classList.remove('aberto');
$('#btn-fechamento-confirmar').onclick = async () => {
  try {
    const { avisos } = await pdv.fecharCaixa($('#fechamento-obs').value);
    $('#modal-fechamento').classList.remove('aberto');
    toast(avisos.length ? 'Caixa fechado (não consegui imprimir)' : 'Caixa fechado e impresso', avisos.length ? 'erro' : 'ok');
    await carregarVendas();
  } catch (err) { toast(err.message, 'erro'); }
};

$('#btn-filtrar-vendas').onclick = carregarVendas;
$('#aba-vendas').onclick = async e => {
  const b = e.target.closest('button');
  if (!b) return;
  try {
    if (b.dataset.pagar) return abrirReceber(Number(b.dataset.pagar));
    else if (b.dataset.cancelar) {
      if (!confirm(`Cancelar a venda ${b.dataset.cancelar}? O estoque será devolvido se ela estava paga.`)) return;
      await pdv.atualizarVenda(Number(b.dataset.cancelar), { status: 'cancelada' });
      toast('Venda cancelada');
    } else if (b.dataset.imprimirFechamento) {
      await pdv.imprimirFechamento(b.dataset.imprimirFechamento);
      toast('Enviado para a impressora', 'ok');
      return;
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
    'tempoInatividadeSeg', 'horarioFechamento', 'pastaBackup'].forEach(k => (f[k].value = c[k] ?? ''));
  f.pinAdmin.value = '';
  $('#aviso-pin-padrao').hidden = !c.pinAdminPadrao;
  carregarBackups();
  f.backupAutomatico.checked = c.backupAutomatico !== false;
  f.atendentePodeCancelar.checked = !!c.atendentePodeCancelar;
  f.controlarEstoqueGeral.checked = c.controlarEstoque !== false;
  const formas = c.formasTotem || { pix: true, cartao: true, caixa: true };
  f.formaPix.checked = formas.pix !== false; f.formaCartao.checked = formas.cartao !== false; f.formaCaixa.checked = formas.caixa !== false;
  $('#info-backup').textContent = (c.ultimoBackup ? `Último backup: ${new Date(c.ultimoBackup).toLocaleString('pt-BR')}. ` : 'Nenhum backup feito ainda. ') +
    `Pasta: ${c.pastaBackupEfetiva}`;
  await renderAtendentes();
  await carregarGateways(c.pagamentos || {});
  verificarAtualizacao(); // em segundo plano: consulta o GitHub
  f.confirmarPagamentoComPin.checked = !!c.confirmarPagamentoComPin;
  f.imprimirCupom.checked = !!c.imprimirCupom;
  f.quandoEsgotar.value = c.quandoEsgotar || 'esgotado';
  f.imprimirViaPreparo.checked = c.imprimirViaPreparo !== false;
  f.pedirNomeCliente.checked = !!c.pedirNomeCliente;
  f.perguntarLocal.checked = !!c.perguntarLocal;
  f.abrirTelaPedidos.checked = !!c.abrirTelaPedidos;
  f.cancelarAguardandoMin.value = String(c.cancelarAguardandoMin || 0);
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
  if (f.pinAdmin.value && !/^\d{4,8}$/.test(f.pinAdmin.value)) return toast('O PIN do admin deve ter de 4 a 8 números.', 'erro');
  if (!f.formaPix.checked && !f.formaCartao.checked && !f.formaCaixa.checked) return toast('Deixe pelo menos uma forma de pagamento no totem.', 'erro');
  if (f.fiscalModo.value === 'pasta' && !f.fiscalPasta.value)
    return toast('Escolha a pasta de integração fiscal.', 'erro');
  try {
    await pdv.salvarConfig({
      nomeLoja: f.nomeLoja.value, cnpj: f.cnpj.value, endereco: f.endereco.value, mensagemCupom: f.mensagemCupom.value,
      pixChave: f.pixChave.value.trim(), pixNome: f.pixNome.value, pixCidade: f.pixCidade.value,
      pinAdmin: f.pinAdmin.value,
      pagamentos: lerGateways(),
      controlarEstoque: f.controlarEstoqueGeral.checked,
      formasTotem: { pix: f.formaPix.checked, cartao: f.formaCartao.checked, caixa: f.formaCaixa.checked },
      horarioFechamento: f.horarioFechamento.value, atendentePodeCancelar: f.atendentePodeCancelar.checked, backupAutomatico: f.backupAutomatico.checked, pastaBackup: f.pastaBackup.value,
      confirmarPagamentoComPin: f.confirmarPagamentoComPin.checked,
      tempoInatividadeSeg: Math.max(30, Number(f.tempoInatividadeSeg.value) || 90),
      imprimirCupom: f.imprimirCupom.checked, impressoraCupom: f.impressoraCupom.value,
      quandoEsgotar: f.quandoEsgotar.value, imprimirViaPreparo: f.imprimirViaPreparo.checked,
      pedirNomeCliente: f.pedirNomeCliente.checked, perguntarLocal: f.perguntarLocal.checked, abrirTelaPedidos: f.abrirTelaPedidos.checked,
      cancelarAguardandoMin: Number(f.cancelarAguardandoMin.value) || 0,
      fiscal: { modo: f.fiscalModo.value, pastaIntegracao: f.fiscalPasta.value }
    });
    await carregarDados();
    if (f.pinAdmin.value) { f.pinAdmin.value = ''; $('#aviso-pin-padrao').hidden = true; }
    toast('Configurações salvas', 'ok');
  } catch (err) { toast(err.message, 'erro'); }
};
// ---------- restaurar backup ----------
async function carregarBackups() {
  try {
    const lista = await pdv.listarBackups();
    $('#sel-backup').innerHTML = lista.length ? lista.map(b => `<option value="${esc(b.nome)}">${new Date(b.em).toLocaleString('pt-BR')} — ${esc(b.nome)} (${Math.max(1, Math.round(b.tamanho / 1024))} KB)</option>`).join('')
      : '<option value="">Nenhum backup ainda</option>';
    $('#btn-restaurar-backup').disabled = !lista.length;
  } catch { /* sem pasta de backup */ }
}
$('#btn-restaurar-backup').onclick = async () => {
  const nome = $('#sel-backup').value;
  if (!nome) return;
  if (!confirm(`Restaurar o backup "${nome}"?\n\nProdutos, vendas e configurações voltam para como estavam nesse dia. O estado de agora fica guardado antes, por segurança.`)) return;
  try {
    const r = await pdv.restaurarBackup(nome);
    toast(`Backup restaurado: ${r.produtos} produtos, ${r.vendas} vendas`, 'ok');
    await carregarDados();
    await carregarConfig();
  } catch (err) { toast(err.message, 'erro'); }
};

// ---------- atendentes ----------
let atendenteEditando = null;
async function renderAtendentes() {
  const lista = await pdv.atendentes();
  $('#lista-atendentes').innerHTML = lista.length ? lista.map(a => `
    <li class="${a.ativo ? '' : 'inativo'}"><span>${esc(a.nome)}${a.ativo ? '' : ' <small class="ajuda">(inativo)</small>'}</span>
      <button type="button" class="btn btn-pequeno" data-editar-atendente="${a.id}">Editar</button></li>`).join('')
    : '<li class="vazio">Nenhum atendente. Só o PIN do admin confirma pagamentos.</li>';
  $('#lista-atendentes').dataset.json = JSON.stringify(lista);
}
function abrirAtendente(a) {
  atendenteEditando = a;
  const f = $('#form-atendente');
  f.atendenteId.value = a?.id || '';
  f.nome.value = a?.nome || '';
  f.pin.value = '';
  f.pin.required = !a;
  f.ativo.checked = a ? a.ativo : true;
  $('#atendente-titulo').textContent = a ? 'Editar atendente' : 'Novo atendente';
  $('#atendente-dica-pin').textContent = a ? 'Deixe em branco para manter o PIN atual.' : 'Cada atendente precisa de um PIN diferente.';
  $('#btn-excluir-atendente').style.visibility = a ? 'visible' : 'hidden';
  $('#modal-atendente').classList.add('aberto');
  setTimeout(() => f.nome.focus(), 50);
}
const fecharAtendente = () => $('#modal-atendente').classList.remove('aberto');
$('#btn-novo-atendente').onclick = () => abrirAtendente(null);
$('#lista-atendentes').onclick = e => {
  const b = e.target.closest('[data-editar-atendente]');
  if (b) abrirAtendente(JSON.parse($('#lista-atendentes').dataset.json).find(a => a.id === b.dataset.editarAtendente));
};
$('#form-atendente').onsubmit = async e => {
  e.preventDefault();
  const f = e.target;
  try {
    await pdv.salvarAtendente({ id: f.atendenteId.value || undefined, nome: f.nome.value, pin: f.pin.value || undefined, ativo: f.ativo.checked });
    fecharAtendente();
    toast('Atendente salvo', 'ok');
    await renderAtendentes();
  } catch (err) { toast(err.message, 'erro'); }
};
$('#btn-cancelar-atendente').onclick = fecharAtendente;
$('#btn-excluir-atendente').onclick = async () => {
  if (!atendenteEditando || !confirm(`Excluir ${atendenteEditando.nome}? As vendas antigas continuam com o nome registrado.`)) return;
  await pdv.excluirAtendente(atendenteEditando.id);
  fecharAtendente();
  await renderAtendentes();
};
$('#btn-pasta-backup').onclick = async () => {
  const p = await pdv.escolherPasta();
  if (p) $('#form-config').pastaBackup.value = p;
};
$('#btn-backup-agora').onclick = async () => {
  try { const arq = await pdv.backupAgora(); toast('Backup salvo em ' + arq, 'ok'); await carregarConfig(); }
  catch (err) { toast(err.message, 'erro'); }
};

// ---------- gateway de pagamento ----------
// Os campos de cada gateway vêm do próprio arquivo dele (src/pagamentos/provedores/*.js)
let provedoresPag = [], credenciaisPag = {};
async function carregarGateways(pag) {
  provedoresPag = await pdv.provedoresPagamento();
  credenciaisPag = JSON.parse(JSON.stringify(pag.credenciais || {}));
  const opcoes = forma => provedoresPag.filter(p => p.suporta[forma])
    .map(p => `<option value="${esc(p.id)}">${esc(p.nome)}</option>`).join('');
  $('#sel-provedor-pix').innerHTML = opcoes('pix');
  $('#sel-provedor-cartao').innerHTML = opcoes('cartao');
  $('#sel-provedor-pix').value = pag.provedorPix || 'manual';
  $('#sel-provedor-cartao').value = pag.provedorCartao || 'manual';
  $('#form-config').permitirManualSeFalhar.checked = pag.permitirManualSeFalhar !== false;
  renderCamposGateway();
}
const gatewaysEscolhidos = () => [...new Set([$('#sel-provedor-pix').value, $('#sel-provedor-cartao').value])]
  .map(id => provedoresPag.find(p => p.id === id)).filter(p => p && !p.manual);
function guardarCamposGateway() {
  $$('#campos-gateway [data-prov]').forEach(el => {
    (credenciaisPag[el.dataset.prov] = credenciaisPag[el.dataset.prov] || {})[el.dataset.chave] = el.value.trim();
  });
}
function renderCamposGateway() {
  const lista = gatewaysEscolhidos();
  $('#campos-gateway').innerHTML = lista.map(p => `
    <div class="gateway-grupo"><b>${esc(p.nome)}</b>${p.descricao ? `<p class="ajuda">${esc(p.descricao)}</p>` : ''}
      ${p.campos.map(c => {
        const v = credenciaisPag[p.id]?.[c.chave] ?? c.padrao ?? '';
        const attrs = `data-prov="${esc(p.id)}" data-chave="${esc(c.chave)}"`;
        const campo = c.tipo === 'opcoes'
          ? `<select ${attrs}>${c.opcoes.map(([val, txt]) => `<option value="${esc(val)}" ${val === v ? 'selected' : ''}>${esc(txt)}</option>`).join('')}</select>`
          : `<input ${attrs} type="${c.tipo === 'senha' ? 'password' : c.tipo === 'numero' ? 'number' : 'text'}" value="${esc(v)}" autocomplete="off">`;
        return `<label>${esc(c.rotulo)}${campo}${c.ajuda ? `<small class="ajuda">${esc(c.ajuda)}</small>` : ''}</label>`;
      }).join('')}
    </div>`).join('');
  $('#btn-testar-gateway').hidden = !lista.length;
}
function lerGateways() {
  guardarCamposGateway();
  return { provedorPix: $('#sel-provedor-pix').value, provedorCartao: $('#sel-provedor-cartao').value,
    permitirManualSeFalhar: $('#form-config').permitirManualSeFalhar.checked, credenciais: credenciaisPag };
}
$('#sel-provedor-pix').onchange = $('#sel-provedor-cartao').onchange = () => { guardarCamposGateway(); renderCamposGateway(); };
$('#btn-testar-gateway').onclick = async () => {
  guardarCamposGateway();
  for (const p of gatewaysEscolhidos()) {
    try { const r = await pdv.testarProvedor(p.id, credenciaisPag[p.id] || {}); toast(`${p.nome}: ${r.mensagem || 'conexão ok'}`, 'ok'); }
    catch (err) { toast(`${p.nome}: ${err.message}`, 'erro'); return; }
  }
};

// ---------- atualização do sistema ----------
const dataCurta = iso => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
async function verificarAtualizacao() {
  const btn = $('#btn-procurar-atualizacao');
  btn.disabled = true; btn.textContent = 'Procurando…';
  try {
    const v = await pdv.verificarAtualizacao();
    if (!v.suportado) {
      $('#versao-atual').textContent = v.motivo;
      $('#novidades').innerHTML = ''; $('#btn-atualizar').hidden = true; $('#btn-voltar-versao').hidden = true;
      return;
    }
    $('#versao-atual').innerHTML = `Versão instalada: <b>${esc(v.atual.curto)}</b> de ${dataCurta(v.atual.data)} — ${esc(v.atual.msg)}`;
    $('#novidades').innerHTML = v.erroRede ? `<p class="aviso-fechamento">${esc(v.erroRede)}</p>`
      : v.novidades.length ? `<p><b>${v.novidades.length} novidade(s) para instalar:</b></p><ul class="lista-novidades">${v.novidades.map(n =>
        `<li>${esc(n.msg)} <small class="ajuda">${dataCurta(n.data)}</small></li>`).join('')}</ul>`
      : '<p class="ajuda">O sistema está na versão mais nova.</p>';
    $('#btn-atualizar').hidden = !v.novidades.length || !!v.erroRede;
    $('#btn-atualizar').disabled = $('#btn-voltar-versao').disabled = false;
    const vb = $('#btn-voltar-versao');
    vb.hidden = !v.anterior;
    if (v.anterior) vb.textContent = `Voltar para a versão anterior (${v.anterior.curto} de ${dataCurta(v.anterior.data)})`;
  } catch (err) { $('#versao-atual').textContent = err.message; }
  finally { btn.disabled = false; btn.textContent = 'Procurar atualização'; }
}
async function trocarVersao(acao, pergunta) {
  if (!confirm(pergunta)) return;
  $('#btn-atualizar').disabled = $('#btn-voltar-versao').disabled = true;
  toast('Atualizando… não desligue o computador', 'ok');
  try {
    const r = await acao();
    toast(`Pronto: versão ${r.para.curto}. Reiniciando o sistema…`, 'ok');
    $('#versao-atual').innerHTML = `Versão instalada: <b>${esc(r.para.curto)}</b> — ${esc(r.para.msg)}. Reiniciando…`;
  } catch (err) {
    toast(err.message, 'erro');
    $('#btn-atualizar').disabled = $('#btn-voltar-versao').disabled = false;
  }
}
$('#btn-procurar-atualizacao').onclick = verificarAtualizacao;
$('#btn-atualizar').onclick = () => trocarVersao(pdv.atualizarSistema, 'Instalar a versão nova agora? O sistema vai reiniciar.');
$('#btn-voltar-versao').onclick = () => trocarVersao(pdv.voltarVersao, 'Voltar para a versão anterior? O sistema vai reiniciar.');

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
$('#btn-sair-admin').onclick = async () => {
  await pdv.sairPainel();
  quemEstaNoPainel = null;
  delete document.body.dataset.perfil;
  carregarDados();
  mostrarTela('inicio');
};
