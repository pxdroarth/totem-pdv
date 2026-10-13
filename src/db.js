// Banco local em JSON (offline). Fica em %APPDATA%\Lisufit PDV\dados.json
// Valores em CENTAVOS (inteiros) para evitar erro de arredondamento.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CONFIG_PADRAO = {
  nomeLoja: 'Lisufit',
  cnpj: '',
  endereco: '',
  pixChave: '',
  pixNome: '',
  pixCidade: '',
  pinAdmin: '1234',
  pinAtendente: '0000',
  confirmarPagamentoComPin: true,
  impressoraCupom: '',
  imprimirCupom: true,
  tempoInatividadeSeg: 90,
  mensagemCupom: 'Obrigado pela preferência!',
  fiscal: { modo: 'desativado', pastaIntegracao: '' }
};

const PRODUTOS_EXEMPLO = [
  ['Whey Protein Concentrado 900g', '7890000000011', 12990, 'Proteínas'],
  ['Whey Isolado 900g', '7890000000028', 18990, 'Proteínas'],
  ['Creatina Monohidratada 300g', '7890000000035', 8990, 'Creatina'],
  ['Pré-Treino 300g', '7890000000042', 9990, 'Pré-Treino'],
  ['BCAA 120 cáps', '7890000000059', 5990, 'Aminoácidos'],
  ['Glutamina 300g', '7890000000066', 6990, 'Aminoácidos'],
  ['Multivitamínico 60 cáps', '7890000000073', 3990, 'Vitaminas'],
  ['Ômega 3 120 cáps', '7890000000080', 4990, 'Vitaminas'],
  ['Barra de Proteína 45g', '7890000000097', 990, 'Snacks'],
  ['Pasta de Amendoim 500g', '7890000000103', 2490, 'Snacks'],
  ['Coqueteleira 600ml', '7890000000110', 2990, 'Acessórios'],
  // Empório (feitos na hora: sem código de barras e sem controle de estoque)
  ['Smoothie Proteico 400ml', '', 1890, 'Smoothies', false, [
    { nome: 'Sabor do whey', min: 1, max: 1, itens: [['Morango'], ['Baunilha'], ['Chocolate']] },
    { nome: 'Frutas', min: 1, max: 2, itens: [['Banana'], ['Morango'], ['Manga'], ['Açaí', 200]] },
    { nome: 'Adicionais', min: 0, max: 2, itens: [['Dose extra de whey', 500], ['Pasta de amendoim', 300], ['Aveia', 150]] }
  ]],
  ['Shake Proteico 500ml', '', 1690, 'Shakes', false, [
    { nome: 'Sabor', min: 1, max: 1, itens: [['Chocolate'], ['Baunilha'], ['Morango'], ['Cookies'] ] }
  ]],
  ['Frango com Batata-doce 350g', '7890000000127', 2290, 'Congelados'],
  ['Escondidinho Fit de Carne 350g', '7890000000134', 2490, 'Congelados'],
  ['Patinho Moído 500g', '7890000000141', 3290, 'Carnes']
];

// Categorias iniciais. "secao" agrupa as categorias no totem (ex.: Suplementos, Empório).
const CATEGORIAS_PADRAO = [
  ['Proteínas', 'Suplementos', 'dumbbell'],
  ['Creatina', 'Suplementos', 'flask'],
  ['Pré-Treino', 'Suplementos', 'zap'],
  ['Aminoácidos', 'Suplementos', 'atom'],
  ['Vitaminas', 'Suplementos', 'pill'],
  ['Snacks', 'Suplementos', 'cookie'],
  ['Acessórios', 'Suplementos', 'bag'],
  ['Smoothies', 'Empório', 'cupSoda'],
  ['Shakes', 'Empório', 'milk'],
  ['Refeições', 'Empório', 'utensils'],
  ['Congelados', 'Empório', 'snowflake'],
  ['Carnes', 'Empório', 'beef']
];

const normalizar = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

function diaLocal(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ---------- variações de produto ----------
// opcoes = [{ id, nome: 'Sabor', min: 1, max: 1, itens: [{ id, nome: 'Morango', precoCentavos: 0 }] }]
function limparOpcoes(lista) {
  if (!Array.isArray(lista)) return [];
  return lista.map(g => {
    const itens = (Array.isArray(g.itens) ? g.itens : [])
      .map(i => ({ id: i.id || crypto.randomUUID(), nome: String(i.nome || '').trim(),
        precoCentavos: Math.max(0, Math.round(Number(i.precoCentavos) || 0)) }))
      .filter(i => i.nome);
    const nome = String(g.nome || '').trim();
    if (!nome && !itens.length) return null;
    if (!nome) throw new Error('Dê um nome para cada grupo de opções (ex.: Sabor).');
    if (!itens.length) throw new Error(`O grupo "${nome}" precisa de pelo menos uma opção.`);
    let min = Math.max(0, Math.round(Number(g.min) || 0));
    let max = Math.max(1, Math.round(Number(g.max) || 1));
    max = Math.min(max, itens.length);
    if (min > max) throw new Error(`No grupo "${nome}", o mínimo não pode ser maior que o máximo.`);
    return { id: g.id || crypto.randomUUID(), nome, min, max, itens };
  }).filter(Boolean);
}

// valida as escolhas do cliente e devolve o valor extra + texto para cupom/relatórios
function resolverEscolhas(produto, escolhas) {
  const grupos = produto.opcoes || [];
  if (!grupos.length) return { adicionalCentavos: 0, descricao: '' };
  const e = escolhas && typeof escolhas === 'object' ? escolhas : {};
  let adicionalCentavos = 0;
  const partes = [];
  for (const g of grupos) {
    const ids = Array.isArray(e[g.id]) ? [...new Set(e[g.id])] : [];
    const itens = ids.map(id => g.itens.find(i => i.id === id));
    if (itens.some(i => !i)) throw new Error(`Opção inválida em "${g.nome}" (${produto.nome}).`);
    if (itens.length < g.min) throw new Error(`Escolha pelo menos ${g.min} em "${g.nome}" (${produto.nome}).`);
    if (itens.length > g.max) throw new Error(`Escolha no máximo ${g.max} em "${g.nome}" (${produto.nome}).`);
    adicionalCentavos += itens.reduce((s, i) => s + i.precoCentavos, 0);
    if (itens.length) partes.push(`${g.nome}: ${itens.map(i => i.nome).join(', ')}`);
  }
  return { adicionalCentavos, descricao: partes.join('; ') };
}

class Banco {
  constructor(pasta) {
    this.arquivo = path.join(pasta, 'dados.json');
    this.pastaImagens = path.join(pasta, 'imagens');
    fs.mkdirSync(this.pastaImagens, { recursive: true });
    this.dados = this._carregar();
  }

  _carregar() {
    if (fs.existsSync(this.arquivo)) {
      const d = JSON.parse(fs.readFileSync(this.arquivo, 'utf8'));
      d.config = { ...CONFIG_PADRAO, ...d.config, fiscal: { ...CONFIG_PADRAO.fiscal, ...(d.config || {}).fiscal } };
      if (!Array.isArray(d.categorias)) this._migrarCategorias(d);
      return d;
    }
    const d = {
      config: { ...CONFIG_PADRAO },
      produtos: PRODUTOS_EXEMPLO.map(([nome, codigoBarras, precoCentavos, categoria, controlarEstoque = true, opcoes = []]) => ({
        id: crypto.randomUUID(), nome, codigoBarras, precoCentavos, categoria,
        estoque: controlarEstoque ? 20 : 0, controlarEstoque, imagem: '', ativo: true,
        opcoes: limparOpcoes(opcoes.map(g => ({ ...g, itens: g.itens.map(([n, c = 0]) => ({ nome: n, precoCentavos: c })) })))
      })),
      categorias: CATEGORIAS_PADRAO.map(([nome, secao, icone], ordem) => ({
        id: crypto.randomUUID(), nome, secao, icone, ordem, ativo: true
      })),
      vendas: [],
      proximoNumero: 1
    };
    this.dados = d;
    this._salvar();
    return d;
  }

  // Bases antigas (sem lista de categorias): cria a lista a partir dos produtos + padrões
  _migrarCategorias(d) {
    d.categorias = CATEGORIAS_PADRAO.map(([nome, secao, icone], ordem) => ({
      id: crypto.randomUUID(), nome, secao, icone, ordem, ativo: true
    }));
    for (const p of d.produtos || []) {
      if (!d.categorias.some(c => normalizar(c.nome) === normalizar(p.categoria))) {
        d.categorias.push({ id: crypto.randomUUID(), nome: p.categoria || 'Outros', secao: 'Outros', icone: 'tag', ordem: d.categorias.length, ativo: true });
      }
    }
    this.dados = d;
    this._salvar();
  }

  _salvar() {
    // grava num temporário e renomeia: não corrompe se a energia cair no meio
    const tmp = this.arquivo + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.dados, null, 2));
    fs.renameSync(tmp, this.arquivo);
  }

  backup(pastaDestino) {
    const nome = `backup-pdv-${new Date().toISOString().slice(0, 10)}.json`;
    const destino = path.join(pastaDestino, nome);
    fs.copyFileSync(this.arquivo, destino);
    return destino;
  }

  getConfig() { return this.dados.config; }
  salvarConfig(cfg) {
    this.dados.config = { ...this.dados.config, ...cfg };
    this._salvar();
    return this.dados.config;
  }

  // ---------- categorias ----------
  getCategorias() {
    return [...this.dados.categorias].sort((a, b) => a.ordem - b.ordem);
  }

  salvarCategoria(c) {
    const nome = String(c.nome || '').trim();
    if (!nome) throw new Error('Informe o nome da categoria.');
    const dup = this.dados.categorias.find(x => normalizar(x.nome) === normalizar(nome) && x.id !== c.id);
    if (dup) throw new Error(`Já existe a categoria "${dup.nome}".`);
    const existente = this.dados.categorias.find(x => x.id === c.id);
    const limpa = {
      id: existente ? existente.id : crypto.randomUUID(),
      nome,
      secao: String(c.secao || '').trim() || 'Outros',
      icone: String(c.icone || 'tag'),
      ativo: c.ativo !== false,
      ordem: existente ? existente.ordem : Math.max(-1, ...this.dados.categorias.map(x => x.ordem)) + 1
    };
    if (existente) {
      // renomeou: leva os produtos junto
      if (existente.nome !== nome) {
        for (const p of this.dados.produtos) if (p.categoria === existente.nome) p.categoria = nome;
      }
      Object.assign(existente, limpa);
    } else {
      this.dados.categorias.push(limpa);
    }
    this._salvar();
    return limpa;
  }

  excluirCategoria(id) {
    const c = this.dados.categorias.find(x => x.id === id);
    if (!c) return;
    const qtd = this.dados.produtos.filter(p => p.categoria === c.nome).length;
    if (qtd) throw new Error(`"${c.nome}" tem ${qtd} produto(s). Mude esses produtos de categoria antes de excluir.`);
    this.dados.categorias = this.dados.categorias.filter(x => x.id !== id);
    this._salvar();
  }

  // direcao: -1 sobe, +1 desce
  moverCategoria(id, direcao) {
    const lista = this.getCategorias();
    const i = lista.findIndex(x => x.id === id), j = i + direcao;
    if (i < 0 || j < 0 || j >= lista.length) return;
    [lista[i], lista[j]] = [lista[j], lista[i]];
    lista.forEach((c, n) => (c.ordem = n));
    this._salvar();
  }

  getProdutos() { return this.dados.produtos; }

  salvarProduto(p) {
    const limpo = {
      id: p.id || crypto.randomUUID(),
      nome: String(p.nome || '').trim(),
      codigoBarras: String(p.codigoBarras || '').trim(),
      precoCentavos: Math.round(Number(p.precoCentavos) || 0),
      categoria: String(p.categoria || 'Outros').trim(),
      estoque: Math.round(Number(p.estoque) || 0),
      controlarEstoque: p.controlarEstoque !== false, // false = feito na hora (smoothie, shake): nunca esgota
      imagem: p.imagem || '',
      ativo: p.ativo !== false,
      opcoes: limparOpcoes(p.opcoes) // variações: sabor, frutas, adicionais...
    };
    if (!limpo.nome) throw new Error('Informe o nome do produto.');
    if (limpo.precoCentavos <= 0) throw new Error('Informe um preço maior que zero.');
    const dup = limpo.codigoBarras && this.dados.produtos.find(
      x => x.codigoBarras === limpo.codigoBarras && x.id !== limpo.id);
    if (dup) throw new Error(`Código de barras já usado em "${dup.nome}".`);
    // categoria digitada que ainda não existe é criada automaticamente
    const cat = this.dados.categorias.find(c => normalizar(c.nome) === normalizar(limpo.categoria));
    if (cat) limpo.categoria = cat.nome;
    else this.dados.categorias.push({ id: crypto.randomUUID(), nome: limpo.categoria, secao: 'Outros', icone: 'tag',
      ordem: this.dados.categorias.length, ativo: true });
    const i = this.dados.produtos.findIndex(x => x.id === limpo.id);
    if (i >= 0) this.dados.produtos[i] = limpo; else this.dados.produtos.push(limpo);
    this._salvar();
    return limpo;
  }

  excluirProduto(id) {
    this.dados.produtos = this.dados.produtos.filter(p => p.id !== id);
    this._salvar();
  }

  registrarVenda({ itens, formaPagamento, status }) {
    if (!Array.isArray(itens) || !itens.length) throw new Error('Carrinho vazio.');
    const linhas = itens.map(({ id, qtd, escolhas }) => {
      const p = this.dados.produtos.find(x => x.id === id);
      if (!p) throw new Error('Produto não encontrado.');
      const q = Math.max(1, Math.round(qtd));
      // o preço das opções é recalculado aqui, nunca confiando no valor vindo da tela
      const { adicionalCentavos, descricao } = resolverEscolhas(p, escolhas);
      const unit = p.precoCentavos + adicionalCentavos;
      return { id: p.id, nome: p.nome, codigoBarras: p.codigoBarras, qtd: q,
        precoCentavos: unit, totalCentavos: unit * q,
        ...(descricao ? { opcoes: descricao, escolhas } : {}) };
    });
    const venda = {
      numero: this.dados.proximoNumero++,
      data: new Date().toISOString(),
      dia: diaLocal(),             // data no fuso do computador (para relatórios)
      itens: linhas,
      totalCentavos: linhas.reduce((s, l) => s + l.totalCentavos, 0),
      formaPagamento,              // 'pix' | 'cartao' | 'caixa'
      status: status || 'paga',    // 'paga' | 'aguardando_caixa' | 'cancelada'
      fiscal: null
    };
    if (venda.status === 'paga') this._baixarEstoque(venda);
    this.dados.vendas.push(venda);
    this._salvar();
    return venda;
  }

  _baixarEstoque(venda) {
    for (const l of venda.itens) {
      const p = this.dados.produtos.find(x => x.id === l.id);
      if (p && p.controlarEstoque !== false) p.estoque -= l.qtd;
    }
  }

  atualizarVenda(numero, mudancas) {
    const v = this.dados.vendas.find(x => x.numero === numero);
    if (!v) throw new Error('Venda não encontrada.');
    const antes = v.status;
    Object.assign(v, mudancas);
    if (antes !== 'paga' && v.status === 'paga') this._baixarEstoque(v);
    if (antes === 'paga' && v.status === 'cancelada') {
      for (const l of v.itens) {
        const p = this.dados.produtos.find(x => x.id === l.id);
        if (p && p.controlarEstoque !== false) p.estoque += l.qtd;
      }
    }
    this._salvar();
    return v;
  }

  listarVendas({ de, ate } = {}) {
    return this.dados.vendas.filter(v => {
      const d = v.dia || v.data.slice(0, 10);
      return (!de || d >= de) && (!ate || d <= ate);
    });
  }
}

module.exports = { Banco };
