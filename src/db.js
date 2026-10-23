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
  confirmarPagamentoComPin: true,
  impressoraCupom: '',
  imprimirCupom: true,
  tempoInatividadeSeg: 90,
  mensagemCupom: 'Obrigado pela preferência!',
  quandoEsgotar: 'esgotado',      // 'esgotado' (aparece esgotado) | 'ocultar' (some do totem) | 'vender' (deixa vender)
  pedirNomeCliente: false,        // totem pergunta o nome do cliente antes de pagar
  perguntarLocal: false,          // totem pergunta "comer aqui ou levar"
  abrirTelaPedidos: false,        // abre a tela de pedidos (2º monitor) junto com o sistema
  imprimirViaPreparo: true,       // imprime uma 2ª via com a senha para quem prepara os itens feitos na hora
  horarioFechamento: '22:00',     // fecha o caixa sozinho neste horário se ninguém fechar ('' = só manual)
  atendentePodeCancelar: false,   // atendente pode cancelar venda já paga? (pedido não pago ele sempre pode)
  backupAutomatico: true,         // cópia diária dos dados (mantém os últimos 30 dias)
  pastaBackup: '',                // vazio = pasta "backups" junto dos dados; pode apontar para OneDrive/Google Drive
  cancelarAguardandoMin: 0,       // cancela pedidos "pagar no balcão" não pagos após X minutos (0 = nunca, -1 = no dia seguinte)
  fiscal: { modo: 'desativado', pastaIntegracao: '' },
  // gateway de pagamento por forma; 'manual' = QR fixo/maquininha avulsa com PIN (ver src/pagamentos)
  pagamentos: { provedorPix: 'manual', provedorCartao: 'manual', permitirManualSeFalhar: true, credenciais: {} }
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

// PIN dos atendentes nunca fica em texto puro: guarda "sal:hash" (scrypt)
function hashPin(pin, sal = crypto.randomBytes(8).toString('hex')) {
  return sal + ':' + crypto.scryptSync(String(pin), sal, 32).toString('hex');
}
function conferePin(pin, guardado) {
  if (!guardado || !pin) return false;
  const [sal, h] = guardado.split(':');
  const a = Buffer.from(h, 'hex'), b = crypto.scryptSync(String(pin), sal, 32);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const pinValido = pin => /^\d{4,8}$/.test(String(pin || ''));

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

// nome digitado no totem: só letras e espaço, até 20 caracteres, "joão silva" -> "João Silva"
function limparCliente(c) {
  if (!c || typeof c !== 'object') return null;
  const nome = String(c.nome || '').replace(/[^\p{L} ]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 20)
    .toLowerCase().replace(/(^|\s)\p{L}/gu, l => l.toUpperCase());
  const local = ['aqui', 'levar'].includes(c.local) ? c.local : '';
  return nome || local ? { nome, local } : null;
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
      d.config = { ...CONFIG_PADRAO, ...d.config, fiscal: { ...CONFIG_PADRAO.fiscal, ...(d.config || {}).fiscal },
        pagamentos: { ...CONFIG_PADRAO.pagamentos, ...(d.config || {}).pagamentos } };
      if (!Array.isArray(d.categorias)) this._migrarCategorias(d);
      let mudou = false;
      // bases antigas: o PIN único de atendente vira o primeiro atendente cadastrado
      if (!Array.isArray(d.atendentes)) {
        d.atendentes = [{ id: crypto.randomUUID(), nome: 'Atendente', pinHash: hashPin(d.config.pinAtendente || '0000'), ativo: true }];
        mudou = true;
      }
      if ('pinAtendente' in d.config) { delete d.config.pinAtendente; mudou = true; }
      if (!Array.isArray(d.fechamentos)) { d.fechamentos = []; mudou = true; }
      if (mudou) { this.dados = d; this._salvar(); }
      return d;
    }
    const d = {
      config: { ...CONFIG_PADRAO },
      produtos: PRODUTOS_EXEMPLO.map(([nome, codigoBarras, precoCentavos, categoria, controlarEstoque = true, opcoes = []]) => ({
        id: crypto.randomUUID(), nome, codigoBarras, precoCentavos, categoria,
        estoque: controlarEstoque ? 20 : 0, estoqueMinimo: 3, controlarEstoque, imagem: '', ativo: true,
        opcoes: limparOpcoes(opcoes.map(g => ({ ...g, itens: g.itens.map(([n, c = 0]) => ({ nome: n, precoCentavos: c })) })))
      })),
      categorias: CATEGORIAS_PADRAO.map(([nome, secao, icone], ordem) => ({
        id: crypto.randomUUID(), nome, secao, icone, ordem, ativo: true
      })),
      vendas: [],
      atendentes: [{ id: crypto.randomUUID(), nome: 'Atendente', pinHash: hashPin('0000'), ativo: true }],
      fechamentos: [],
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
    if (cfg.pinAdmin !== undefined) {
      if (!pinValido(cfg.pinAdmin)) throw new Error('O PIN do admin deve ter de 4 a 8 números.');
      const dono = this.dados.atendentes.find(a => a.ativo && conferePin(cfg.pinAdmin, a.pinHash));
      if (dono) throw new Error(`O PIN do admin não pode ser igual ao de ${dono.nome}.`);
    }
    this.dados.config = { ...this.dados.config, ...cfg };
    this._salvar();
    return this.dados.config;
  }

  // ---------- atendentes ----------
  getAtendentes() {
    return this.dados.atendentes.map(({ pinHash, ...a }) => a);
  }

  salvarAtendente({ id, nome, pin, ativo }) {
    nome = String(nome || '').trim();
    if (!nome) throw new Error('Informe o nome do atendente.');
    const existente = this.dados.atendentes.find(a => a.id === id);
    if (!existente && !pin) throw new Error('Defina um PIN para o novo atendente.');
    if (pin) {
      if (!pinValido(pin)) throw new Error('O PIN deve ter de 4 a 8 números.');
      if (pin === this.dados.config.pinAdmin) throw new Error('Esse PIN é o do admin. Escolha outro.');
      const outro = this.dados.atendentes.find(a => a.id !== id && a.ativo && conferePin(pin, a.pinHash));
      if (outro) throw new Error('Esse PIN já é de outro atendente. Cada um precisa de um PIN diferente.');
    }
    const dup = this.dados.atendentes.find(a => a.id !== id && normalizar(a.nome) === normalizar(nome));
    if (dup) throw new Error(`Já existe um atendente chamado ${dup.nome}.`);
    if (existente) {
      existente.nome = nome;
      existente.ativo = ativo !== false;
      if (pin) existente.pinHash = hashPin(pin);
    } else {
      this.dados.atendentes.push({ id: crypto.randomUUID(), nome, pinHash: hashPin(pin), ativo: ativo !== false });
    }
    this._salvar();
    return this.getAtendentes();
  }

  excluirAtendente(id) {
    this.dados.atendentes = this.dados.atendentes.filter(a => a.id !== id);
    this._salvar();
  }

  // quem é o dono deste PIN? admin, um atendente ativo ou ninguém
  identificarPin(pin) {
    if (!pin) return null;
    if (pin === this.dados.config.pinAdmin) return { id: 'admin', nome: 'Administrador', perfil: 'admin' };
    const a = this.dados.atendentes.find(x => x.ativo && conferePin(pin, x.pinHash));
    return a ? { id: a.id, nome: a.nome, perfil: 'atendente' } : null;
  }

  // ---------- fechamento do dia ----------
  // depois que o dia foi fechado, as vendas novas entram no dia seguinte
  diaOperacional(agora = new Date()) {
    const hoje = diaLocal(agora);
    if (!this.dados.fechamentos.some(f => f.dia === hoje)) return hoje;
    const amanha = new Date(agora); amanha.setDate(amanha.getDate() + 1);
    return diaLocal(amanha);
  }

  resumoDia(dia) {
    const vendas = this.dados.vendas.filter(v => (v.dia || v.data.slice(0, 10)) === dia);
    const pagas = vendas.filter(v => v.status === 'paga');
    const soma = arr => arr.reduce((s, v) => s + v.totalCentavos, 0);
    const porForma = f => soma(pagas.filter(v => v.formaPagamento === f));
    return {
      dia,
      totalCentavos: soma(pagas),
      pixCentavos: porForma('pix'), cartaoCentavos: porForma('cartao'), caixaCentavos: porForma('caixa'),
      vendasPagas: pagas.length,
      canceladas: vendas.filter(v => v.status === 'cancelada').length,
      aguardando: vendas.filter(v => v.status === 'aguardando_caixa').length,
      primeiraVenda: vendas.length ? Math.min(...vendas.map(v => v.numero)) : null,
      ultimaVenda: vendas.length ? Math.max(...vendas.map(v => v.numero)) : null
    };
  }

  fecharDia({ dia, tipo = 'manual', por = '', observacao = '' }) {
    dia = dia || diaLocal();
    if (this.dados.fechamentos.some(f => f.dia === dia)) throw new Error(`O caixa de ${dia.split('-').reverse().join('/')} já foi fechado.`);
    const f = { id: crypto.randomUUID(), ...this.resumoDia(dia), tipo, por, observacao: String(observacao || '').trim(),
      em: new Date().toISOString() };
    this.dados.fechamentos.push(f);
    this._salvar();
    return f;
  }

  getFechamentos() {
    return [...this.dados.fechamentos].sort((a, b) => b.dia.localeCompare(a.dia));
  }

  // dias que precisam fechar sozinhos: dias passados com venda e sem fechamento,
  // e hoje, se já passou do horário configurado
  diasParaFecharSozinho(agora = new Date()) {
    const hoje = diaLocal(agora);
    const fechados = new Set(this.dados.fechamentos.map(f => f.dia));
    const dias = new Set(this.dados.vendas.map(v => v.dia || v.data.slice(0, 10)).filter(d => d < hoje && !fechados.has(d)));
    const h = this.dados.config.horarioFechamento;
    if (/^\d{2}:\d{2}$/.test(h || '')) {
      const [hh, mm] = h.split(':').map(Number);
      if (agora.getHours() * 60 + agora.getMinutes() >= hh * 60 + mm && !fechados.has(hoje)) dias.add(hoje);
    }
    return [...dias].sort();
  }

  // ---------- backup ----------
  backupAutomatico(pasta, manter = 30, agora = new Date()) {
    fs.mkdirSync(pasta, { recursive: true });
    const destino = path.join(pasta, `backup-pdv-${diaLocal(agora)}.json`);
    this.dados.ultimoBackup = agora.toISOString();
    this._salvar();
    fs.copyFileSync(this.arquivo, destino);
    const antigos = fs.readdirSync(pasta).filter(n => /^backup-pdv-\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort().reverse().slice(manter);
    for (const n of antigos) fs.unlinkSync(path.join(pasta, n));
    return destino;
  }

  precisaBackupHoje(agora = new Date()) {
    return !this.dados.ultimoBackup || diaLocal(new Date(this.dados.ultimoBackup)) !== diaLocal(agora);
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
      estoqueMinimo: Math.max(0, Math.round(Number(p.estoqueMinimo ?? 3) || 0)),
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

  definirImagem(id, caminho) {
    const p = this.dados.produtos.find(x => x.id === id);
    if (!p) throw new Error('Produto não encontrado.');
    if (caminho && path.dirname(caminho) !== this.pastaImagens) throw new Error('Foto fora da pasta do sistema.');
    p.imagem = caminho || '';
    this._salvar();
    return p;
  }

  excluirProduto(id) {
    this.dados.produtos = this.dados.produtos.filter(p => p.id !== id);
    this._salvar();
  }

  // total calculado aqui (preços do cadastro), nunca confiando no valor vindo da tela
  calcularTotal(itens) {
    return this._montarLinhas(itens).reduce((s, l) => s + l.totalCentavos, 0);
  }

  _montarLinhas(itens) {
    if (!Array.isArray(itens) || !itens.length) throw new Error('Carrinho vazio.');
    return itens.map(({ id, qtd, escolhas }) => {
      const p = this.dados.produtos.find(x => x.id === id);
      if (!p) throw new Error('Produto não encontrado.');
      const q = Math.max(1, Math.round(qtd));
      // o preço das opções é recalculado aqui, nunca confiando no valor vindo da tela
      const { adicionalCentavos, descricao } = resolverEscolhas(p, escolhas);
      const unit = p.precoCentavos + adicionalCentavos;
      return { id: p.id, nome: p.nome, codigoBarras: p.codigoBarras, qtd: q,
        precoCentavos: unit, totalCentavos: unit * q,
        ...(p.controlarEstoque === false ? { preparo: true } : {}), // feito na hora: vai para a via de preparo
        ...(descricao ? { opcoes: descricao, escolhas } : {}) };
    });
  }

  registrarVenda({ itens, formaPagamento, status, por, cliente, pagamento }) {
    const linhas = this._montarLinhas(itens);
    const venda = {
      numero: this.dados.proximoNumero++,
      data: new Date().toISOString(),
      dia: this.diaOperacional(),  // data no fuso do computador; depois do fechamento vai para o dia seguinte
      itens: linhas,
      totalCentavos: linhas.reduce((s, l) => s + l.totalCentavos, 0),
      formaPagamento,              // 'pix' | 'cartao' | 'caixa'
      status: status || 'paga',    // 'paga' | 'aguardando_caixa' | 'cancelada'
      fiscal: null,
      historico: [{ acao: status === 'aguardando_caixa' ? 'pedido' : 'paga', por: por || 'Totem', em: new Date().toISOString() }]
    };
    if (pagamento) venda.pagamento = pagamento; // dados do gateway: transação, NSU, autorização, bandeira
    const cli = limparCliente(cliente);
    if (cli) venda.cliente = cli;
    this._entrarNaFila(venda);
    if (venda.status === 'paga') this._baixarEstoque(venda);
    this.dados.vendas.push(venda);
    this._salvar();
    return venda;
  }

  // pedido pago com item feito na hora vai para a tela de pedidos
  _entrarNaFila(venda) {
    if (venda.status === 'paga' && !venda.preparoStatus && venda.itens.some(i => i.preparo)) {
      venda.preparoStatus = 'fila';
      venda.preparoDesde = new Date().toISOString();
    }
  }

  listarPreparo(agora = new Date()) {
    const limite = agora - 12 * 3600 * 1000; // pedido esquecido há mais de 12h sai da tela
    return this.dados.vendas
      .filter(v => v.status === 'paga' && ['fila', 'pronto'].includes(v.preparoStatus) && new Date(v.preparoDesde || v.data) >= limite)
      .map(v => ({ numero: v.numero, status: v.preparoStatus, desde: v.preparoDesde || v.data, prontoEm: v.preparoProntoEm || null,
        cliente: v.cliente || null, itens: v.itens.filter(i => i.preparo).map(i => ({ qtd: i.qtd, nome: i.nome, opcoes: i.opcoes || '' })) }));
  }

  marcarPreparo(numero, status) {
    if (!['fila', 'pronto', 'entregue'].includes(status)) throw new Error('Situação inválida.');
    const v = this.dados.vendas.find(x => x.numero === numero);
    if (!v || !v.preparoStatus) throw new Error('Pedido não encontrado.');
    v.preparoStatus = status;
    if (status === 'pronto') v.preparoProntoEm = new Date().toISOString();
    if (status === 'entregue') v.preparoEntregueEm = new Date().toISOString();
    this._salvar();
    return v;
  }

  _baixarEstoque(venda) {
    for (const l of venda.itens) {
      const p = this.dados.produtos.find(x => x.id === l.id);
      if (p && p.controlarEstoque !== false) p.estoque -= l.qtd;
    }
  }

  atualizarVenda(numero, mudancas, por) {
    const v = this.dados.vendas.find(x => x.numero === numero);
    if (!v) throw new Error('Venda não encontrada.');
    const antes = v.status;
    Object.assign(v, mudancas);
    if (mudancas.status && mudancas.status !== antes) {
      v.historico = v.historico || [];
      v.historico.push({ acao: mudancas.status === 'paga' ? 'paga' : mudancas.status === 'cancelada' ? 'cancelada' : mudancas.status,
        por: por || 'Painel', em: new Date().toISOString() });
    }
    if (antes !== 'paga' && v.status === 'paga') { this._baixarEstoque(v); this._entrarNaFila(v); }
    if (antes === 'paga' && v.status === 'cancelada') {
      for (const l of v.itens) {
        const p = this.dados.produtos.find(x => x.id === l.id);
        if (p && p.controlarEstoque !== false) p.estoque += l.qtd;
      }
    }
    this._salvar();
    return v;
  }

  // pedidos "pagar no balcão" esquecidos: cancela sozinho conforme a configuração
  cancelarAguardandoAntigos(agora = new Date()) {
    const min = Number(this.dados.config.cancelarAguardandoMin) || 0;
    if (!min) return [];
    const hoje = diaLocal(agora);
    const vencidas = this.dados.vendas.filter(v => v.status === 'aguardando_caixa' &&
      (min === -1 ? (v.dia || v.data.slice(0, 10)) < hoje : agora - new Date(v.data) > min * 60000));
    for (const v of vencidas) {
      v.status = 'cancelada'; v.canceladaAutomaticamente = true;
      (v.historico = v.historico || []).push({ acao: 'cancelada', por: 'Sistema (automático)', em: agora.toISOString() });
    }
    if (vencidas.length) this._salvar();
    return vencidas.map(v => v.numero);
  }

  // linhas = saída de planilha.lerPlanilhaProdutos. aplicar=false só simula (prévia).
  importarProdutos(linhas, aplicar = false) {
    const produtos = aplicar ? this.dados.produtos : this.dados.produtos.map(p => ({ ...p }));
    const categorias = aplicar ? this.dados.categorias : this.dados.categorias.map(c => ({ ...c }));
    const res = { novos: 0, atualizados: 0, categoriasNovas: [], erros: [] };
    const vistos = new Set();
    for (const { linha, dados: d, erro } of linhas) {
      if (erro) { res.erros.push({ linha, erro }); continue; }
      const chave = d.codigoBarras ? 'c:' + d.codigoBarras : 'n:' + normalizar(d.nome);
      if (vistos.has(chave)) { res.erros.push({ linha, erro: `Produto repetido na planilha (${d.codigoBarras || d.nome}).` }); continue; }
      vistos.add(chave);
      let p = d.codigoBarras && produtos.find(x => x.codigoBarras === d.codigoBarras);
      if (!p && d.nome) p = produtos.find(x => normalizar(x.nome) === normalizar(d.nome) && (!x.codigoBarras || !d.codigoBarras));
      if (!p) {
        if (!d.nome) { res.erros.push({ linha, erro: 'Produto novo sem nome.' }); continue; }
        if (!d.precoCentavos) { res.erros.push({ linha, erro: `"${d.nome}" é novo e está sem preço.` }); continue; }
      }
      const dono = d.codigoBarras && produtos.find(x => x.codigoBarras === d.codigoBarras && x !== p);
      if (dono) { res.erros.push({ linha, erro: `Código ${d.codigoBarras} já é do produto "${dono.nome}".` }); continue; }
      if (d.categoria) {
        const cat = categorias.find(c => normalizar(c.nome) === normalizar(d.categoria));
        if (cat) d.categoria = cat.nome;
        else {
          categorias.push({ id: crypto.randomUUID(), nome: d.categoria, secao: d.secao || 'Outros', icone: 'tag',
            ordem: Math.max(-1, ...categorias.map(x => x.ordem)) + 1, ativo: true });
          res.categoriasNovas.push(d.categoria);
        }
      }
      const campos = {};
      for (const k of ['nome', 'codigoBarras', 'precoCentavos', 'categoria', 'estoque', 'estoqueMinimo', 'ativo']) if (d[k] !== undefined) campos[k] = d[k];
      if (d.feitoNaHora !== undefined) campos.controlarEstoque = !d.feitoNaHora;
      if (p) { Object.assign(p, campos); res.atualizados++; }
      else {
        produtos.push({ id: crypto.randomUUID(), codigoBarras: '', categoria: 'Outros', estoque: 0, estoqueMinimo: 3,
          controlarEstoque: true, imagem: '', ativo: true, opcoes: [], ...campos });
        if (!categorias.some(c => normalizar(c.nome) === normalizar(campos.categoria || 'Outros'))) {
          categorias.push({ id: crypto.randomUUID(), nome: 'Outros', secao: 'Outros', icone: 'tag', ordem: categorias.length, ativo: true });
          res.categoriasNovas.push('Outros');
        }
        res.novos++;
      }
    }
    if (aplicar) this._salvar();
    return res;
  }

  listarVendas({ de, ate } = {}) {
    return this.dados.vendas.filter(v => {
      const d = v.dia || v.data.slice(0, 10);
      return (!de || d >= de) && (!ate || d <= ate);
    });
  }
}

module.exports = { Banco };
