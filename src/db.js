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
  // PIN do admin: só o hash fica gravado (pinAdminHash); o padrão de fábrica é 1234
  confirmarPagamentoComPin: true,
  impressoraCupom: '',
  imprimirCupom: true,
  tempoInatividadeSeg: 90,
  mensagemCupom: 'Obrigado pela preferência!',
  quandoEsgotar: 'esgotado',      // 'esgotado' (aparece esgotado) | 'ocultar' (some do totem) | 'vender' (deixa vender)
  tecladoVirtual: 'sempre',       // teclado na tela: 'sempre' | 'toque' (só com o dedo) | 'nunca' (tem teclado físico)
  pedirNomeCliente: false,        // totem pergunta o nome do cliente antes de pagar
  perguntarLocal: false,          // totem pergunta "comer aqui ou levar"
  abrirTelaPedidos: false,        // abre a tela de pedidos (2º monitor) junto com o sistema
  imprimirViaPreparo: true,       // imprime uma 2ª via com a senha para quem prepara os itens feitos na hora
  horarioFechamento: '22:00',     // fecha o caixa sozinho neste horário se ninguém fechar ('' = só manual)
  atendentePodeCancelar: false,   // atendente pode cancelar venda já paga? (pedido não pago ele sempre pode)
  controlarEstoque: true,         // false = a loja não controla estoque: nada fica esgotado e nada é baixado
  modoTesteVendas: false,         // true = vendas marcadas como teste: não entram em relatório, fechamento, indicadores nem planilha
  formasTotem: { pix: true, cartao: true, caixa: true }, // formas de pagamento que aparecem no totem
  backupAutomatico: true,         // cópia diária dos dados (mantém os últimos 30 dias)
  pastaBackup: '',                // vazio = pasta "backups" junto dos dados; pode apontar para OneDrive/Google Drive
  cancelarAguardandoMin: 0,       // cancela pedidos "pagar no balcão" não pagos após X minutos (0 = nunca, -1 = no dia seguinte)
  fiscal: { modo: 'desativado', pastaIntegracao: '' },
  // gateway de pagamento por forma; 'manual' = QR fixo/maquininha avulsa com PIN (ver src/pagamentos)
  pagamentos: { provedorPix: 'manual', provedorCartao: 'manual', permitirManualSeFalhar: true, credenciais: {} }
};

// Catálogo inicial: Empório Lisufit com fotos (src/catalogo). PDV_CATALOGO=exemplo usa os produtos
// fictícios de suplementos (demonstração e testes automáticos).
const CATALOGO = require('./catalogo/emporio');
const CATEGORIAS_PADRAO = CATALOGO.CATEGORIAS;

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

// ícone automático para categoria nova criada pela planilha (dá para trocar no admin)
const ICONE_POR_PALAVRA = [
  ['farinha', 'wheat'], ['mercearia', 'bag'], ['salgad', 'croissant'], ['lanche', 'sandwich'], ['sanduic', 'sandwich'], ['refei', 'utensils'], ['prato', 'utensils'],
  ['suco', 'cupSoda'], ['smoothie', 'cupSoda'], ['shake', 'milk'], ['bebida', 'glassWater'], ['agua', 'glassWater'],
  ['refrigerante', 'cupSoda'], ['cafe', 'coffee'], ['sobremesa', 'iceCream'], ['sorvete', 'iceCream'], ['doce', 'candy'],
  ['salada', 'salad'], ['fruta', 'apple'], ['carne', 'beef'], ['frango', 'drumstick'], ['peixe', 'fish'], ['congelad', 'snowflake'],
  ['whey', 'dumbbell'], ['prote', 'dumbbell'], ['creatina', 'flask'], ['pre-treino', 'zap'], ['pre treino', 'zap'],
  ['vitamina', 'pill'], ['suplement', 'pill'], ['barra', 'cookie'], ['snack', 'cookie'], ['acessor', 'bag'], ['natura', 'leaf']
];
function iconeParaCategoria(nome) {
  const n = String(nome || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return (ICONE_POR_PALAVRA.find(([k]) => n.includes(k)) || [])[1] || 'tag';
}

// como o dinheiro entrou de fato: no balcão o atendente diz se foi dinheiro, PIX ou cartão
const MEIOS = ['dinheiro', 'pix', 'cartao'];
const meioRecebimento = v => v.formaPagamento === 'caixa' ? (MEIOS.includes(v.recebidoComo) ? v.recebidoComo : 'balcao') : v.formaPagamento;

const normalizar = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

function diaLocal(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ---------- variações de produto ----------
// opcoes = [{ id, nome: 'Sabor', min: 1, max: 1, itens: [{ id, nome: 'Morango', precoCentavos: 0, codigoBarras? }] }]
// codigoBarras na opção: produto com vários sabores, cada um com a própria embalagem (ex.: Whey Isolado Pro Fit)
function limparOpcoes(lista) {
  if (!Array.isArray(lista)) return [];
  return lista.map(g => {
    const itens = (Array.isArray(g.itens) ? g.itens : [])
      .map(i => {
        const item = { id: i.id || crypto.randomUUID(), nome: String(i.nome || '').trim(),
          precoCentavos: Math.max(0, Math.round(Number(i.precoCentavos) || 0)) };
        const cod = String(i.codigoBarras || '').trim();
        if (cod) item.codigoBarras = cod;
        const desc = String(i.descricao || '').replace(/\s+/g, ' ').trim().slice(0, 160);
        if (desc) item.descricao = desc; // ingredientes que aparecem na tela de escolha
        return item;
      })
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
      if ('pinAdmin' in d.config) { // bases antigas: PIN do admin em texto vira hash
        d.config.pinAdminHash = hashPin(d.config.pinAdmin || '1234');
        d.config.pinAdminPadrao = (d.config.pinAdmin || '1234') === '1234';
        delete d.config.pinAdmin; mudou = true;
      }
      if (!d.config.pinAdminHash) { d.config.pinAdminHash = hashPin('1234'); d.config.pinAdminPadrao = true; mudou = true; }
      if (!Array.isArray(d.fechamentos)) { d.fechamentos = []; mudou = true; }
      if (mudou) { this.dados = d; this._salvar(); }
      return d;
    }
    const d = {
      // a Lisufit não controla estoque; com os produtos fictícios (testes) o padrão continua ligado
      config: { ...CONFIG_PADRAO, pinAdminHash: hashPin('1234'), pinAdminPadrao: true,
        ...(process.env.PDV_CATALOGO === 'exemplo' ? {} : { controlarEstoque: false }) },
      produtos: this._produtosIniciais(),
      categorias: CATEGORIAS_PADRAO.map(([nome, secao, icone], ordem) => ({
        id: crypto.randomUUID(), nome, secao, icone, ordem, ativo: true
      })),
      vendas: [],
      atendentes: [{ id: crypto.randomUUID(), nome: 'Atendente', pinHash: hashPin('0000'), ativo: true }],
      fechamentos: [],
      proximoNumero: 1,
      ...(this._catalogoInicial ? { catalogo: this._catalogoInicial } : {})
    };
    this.dados = d;
    this._salvar();
    return d;
  }

  // Produtos da primeira abertura: o catálogo do Empório, com as fotos copiadas para a pasta de imagens
  _produtosIniciais() {
    const opcoesDe = sabores => limparOpcoes(sabores ? [{ nome: 'Sabor', min: 1, max: 1,
      itens: sabores.map(([nome, descricao]) => ({ nome, ...(descricao ? { descricao } : {}), precoCentavos: 0 })) }] : []);
    if (process.env.PDV_CATALOGO === 'exemplo') {
      return require('./catalogo/exemplo').PRODUTOS.map(([nome, codigoBarras, precoCentavos, categoria, controlarEstoque = true, opcoes = []]) => ({
        id: crypto.randomUUID(), nome, codigoBarras, precoCentavos, categoria,
        estoque: controlarEstoque ? 20 : 0, estoqueMinimo: 3, controlarEstoque, imagem: '', ativo: true,
        opcoes: limparOpcoes(opcoes.map(g => ({ ...g, itens: g.itens.map(([n, c = 0]) => ({ nome: n, precoCentavos: c })) })))
      }));
    }
    return this._produtosDoCatalogo();
  }

  // ---------- catálogo da loja (src/catalogo) ----------
  // O Pedro cadastra produtos novos no catálogo do projeto (prateleira.js / emporio.js + fotos), sobe no GitHub
  // e a loja aperta "Atualizar": ao abrir a versão nova, o sistema sincroniza sozinho (sincronizarCatalogo).
  static entradasCatalogo() {
    const prateleira = require('./catalogo/prateleira').PRODUTOS.map(([nome, categoria, preco, foto, sabores]) =>
      ({ nome, categoria, preco, foto, sabores: (sabores || []).map(n => [n, '']), exemplo: false, feitoNaHora: false }));
    // Empório: preço de exemplo até a loja confirmar (7º campo true = preço definitivo)
    const emporio = CATALOGO.PRODUTOS.map(([nome, categoria, preco, feitoNaHora, foto, sabores, definitivo]) =>
      ({ nome, categoria, preco, foto, sabores: sabores || [], exemplo: !definitivo, feitoNaHora: !!feitoNaHora }));
    return [...prateleira, ...emporio];
  }
  static versaoCatalogo() {
    return crypto.createHash('sha1').update(JSON.stringify(Banco.entradasCatalogo())).digest('hex').slice(0, 12);
  }
  _copiarFotoCatalogo(foto) {
    try {
      const destino = path.join(this.pastaImagens, 'catalogo-' + foto + '.webp');
      fs.copyFileSync(path.join(CATALOGO.pastaFotos, foto + '.webp'), destino);
      return destino;
    } catch { return ''; } // sem a foto o produto entra igual, só sem imagem
  }
  _produtoDoCatalogo(e) {
    return { id: crypto.randomUUID(), nome: e.nome, codigoBarras: '', precoCentavos: e.preco, ...(e.exemplo ? { precoExemplo: true } : {}),
      categoria: e.categoria, estoque: 0, estoqueMinimo: 3, controlarEstoque: !e.feitoNaHora, imagem: this._copiarFotoCatalogo(e.foto), ativo: true,
      opcoes: limparOpcoes(e.sabores.length ? [{ nome: 'Sabor', min: 1, max: 1,
        itens: e.sabores.map(([nome, descricao]) => ({ nome, ...(descricao ? { descricao } : {}), precoCentavos: 0 })) }] : []) };
  }
  // o que o catálogo aplicou por último em cada produto: serve para saber se a loja mudou algo por conta própria
  static _marca(e) { return { preco: e.preco, foto: e.foto, sabores: e.sabores.map(([n]) => n).join('|') }; }
  _produtosDoCatalogo() {
    const entradas = Banco.entradasCatalogo();
    this._catalogoInicial = { versao: Banco.versaoCatalogo(), produtos: Object.fromEntries(entradas.map(e => [normalizar(e.nome), Banco._marca(e)])) };
    return entradas.map(e => this._produtoDoCatalogo(e));
  }

  // Sincroniza com o catálogo: cadastra o que falta e atualiza o que o Pedro mudou no catálogo (preço, foto, sabores).
  // Só atualiza um campo se a loja não mexeu nele desde a última sincronização. Nunca apaga produto.
  sincronizarCatalogo() {
    const d = this.dados;
    const reg = d.catalogo = d.catalogo || { versao: '', produtos: {} };
    const res = { novos: [], precos: [], fotos: 0, sabores: 0, categoriasNovas: [], versao: Banco.versaoCatalogo() };
    for (const [nome, secao, icone] of CATEGORIAS_PADRAO) {
      if (!d.categorias.some(c => normalizar(c.nome) === normalizar(nome))) {
        d.categorias.push({ id: crypto.randomUUID(), nome, secao, icone, ordem: d.categorias.length, ativo: true });
        res.categoriasNovas.push(nome);
      }
    }
    for (const e of Banco.entradasCatalogo()) {
      const k = normalizar(e.nome), marca = Banco._marca(e), antes = reg.produtos[k];
      const atual = d.produtos.find(p => normalizar(p.nome) === k);
      if (!atual) { d.produtos.push(this._produtoDoCatalogo(e)); res.novos.push(e.nome); reg.produtos[k] = marca; continue; }
      const fotoDoCatalogo = !atual.imagem || !fs.existsSync(atual.imagem) || path.basename(atual.imagem).startsWith('catalogo-');
      if (!antes) { // produto que a loja já tinha antes de sincronizar: só põe foto se faltar
        if ((!atual.imagem || !fs.existsSync(atual.imagem))) { const f = this._copiarFotoCatalogo(e.foto); if (f) { atual.imagem = f; res.fotos++; } }
        reg.produtos[k] = { ...marca, preco: atual.precoCentavos }; // o preço da loja vira a referência
        continue;
      }
      if (marca.preco !== antes.preco && atual.precoCentavos === antes.preco) {
        res.precos.push(`${e.nome}: ${(antes.preco / 100).toFixed(2)} → ${(e.preco / 100).toFixed(2)}`);
        atual.precoCentavos = e.preco;
        if (e.exemplo) atual.precoExemplo = true; else delete atual.precoExemplo;
      }
      if (marca.foto !== antes.foto && fotoDoCatalogo) { const f = this._copiarFotoCatalogo(e.foto); if (f) { atual.imagem = f; res.fotos++; } }
      const g = (atual.opcoes || []).find(x => normalizar(x.nome) === 'sabor');
      const saboresLoja = g ? g.itens.map(i => i.nome).join('|') : '';
      if (marca.sabores !== antes.sabores && saboresLoja === antes.sabores) {
        const novos = limparOpcoes([{ nome: 'Sabor', min: 1, max: 1, itens: e.sabores.map(([nome, descricao]) => {
          const velho = g?.itens.find(i => normalizar(i.nome) === normalizar(nome));
          return { ...(velho || {}), nome, ...(descricao ? { descricao } : {}), precoCentavos: velho?.precoCentavos || 0 };
        }) }]);
        atual.opcoes = [...(novos[0].itens.length ? [{ ...novos[0], id: g?.id || novos[0].id }] : []), ...(atual.opcoes || []).filter(x => x !== g)];
        res.sabores++;
      }
      reg.produtos[k] = { preco: atual.precoCentavos === e.preco ? e.preco : antes.preco, foto: e.foto, sabores: marca.sabores };
    }
    reg.versao = res.versao;
    d.ultimaSincronizacao = { em: new Date().toISOString(), novos: res.novos.length, precos: res.precos.length, fotos: res.fotos, sabores: res.sabores,
      detalhes: [...res.novos.map(n => 'Novo: ' + n), ...res.precos.map(t => 'Preço: ' + t)].slice(0, 50) };
    this._salvar();
    return res;
  }
  catalogoDesatualizado() { return (this.dados.catalogo?.versao || '') !== Banco.versaoCatalogo(); }
  carregarCatalogo() { return this.sincronizarCatalogo(); } // nome antigo do botão

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
    cfg = { ...cfg };
    delete cfg.pinAdminHash;
    if (cfg.pinAdmin === '' || cfg.pinAdmin == null) delete cfg.pinAdmin; // em branco = mantém o PIN atual
    if (cfg.pinAdmin !== undefined) {
      if (!pinValido(cfg.pinAdmin)) throw new Error('O PIN do admin deve ter de 4 a 8 números.');
      const dono = this.dados.atendentes.find(a => a.ativo && conferePin(cfg.pinAdmin, a.pinHash));
      if (dono) throw new Error(`O PIN do admin não pode ser igual ao de ${dono.nome}.`);
      cfg.pinAdminHash = hashPin(cfg.pinAdmin);
      cfg.pinAdminPadrao = false;
      delete cfg.pinAdmin; // o PIN nunca fica gravado em texto
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
      if (conferePin(pin, this.dados.config.pinAdminHash)) throw new Error('Esse PIN é o do admin. Escolha outro.');
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
    if (conferePin(pin, this.dados.config.pinAdminHash)) return { id: 'admin', nome: 'Administrador', perfil: 'admin' };
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
    const vendas = this.dados.vendas.filter(v => !v.teste && (v.dia || v.data.slice(0, 10)) === dia);
    const pagas = vendas.filter(v => v.status === 'paga');
    const soma = arr => arr.reduce((s, v) => s + v.totalCentavos, 0);
    const porForma = f => soma(pagas.filter(v => v.formaPagamento === f));
    return {
      dia,
      totalCentavos: soma(pagas),
      pixCentavos: porForma('pix'), cartaoCentavos: porForma('cartao'), caixaCentavos: porForma('caixa'),
      // dinheiro que deve estar na gaveta: pedidos do balcão marcados como pagos em dinheiro
      dinheiroCentavos: soma(pagas.filter(v => meioRecebimento(v) === 'dinheiro')),
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
    const dias = new Set(this.dados.vendas.filter(v => !v.teste).map(v => v.dia || v.data.slice(0, 10)).filter(d => d < hoje && !fechados.has(d)));
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
      custoCentavos: Math.max(0, Math.round(Number(p.custoCentavos) || 0)), // opcional: quanto custa para a loja (lucro nos indicadores)
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
    // código de barras é único entre todos os produtos e sabores
    const codigos = [limpo.codigoBarras, ...limpo.opcoes.flatMap(g => g.itens.map(i => i.codigoBarras))].filter(Boolean);
    const repetido = codigos.find((c, i) => codigos.indexOf(c) !== i);
    if (repetido) throw new Error(`O código ${repetido} aparece duas vezes neste produto.`);
    for (const c of codigos) {
      const dono = this.donoDoCodigo(c, limpo.id);
      if (dono) throw new Error(`Código de barras ${c} já usado em "${dono}".`);
    }
    // categoria digitada que ainda não existe é criada automaticamente
    const cat = this.dados.categorias.find(c => normalizar(c.nome) === normalizar(limpo.categoria));
    if (cat) limpo.categoria = cat.nome;
    else this.dados.categorias.push({ id: crypto.randomUUID(), nome: limpo.categoria, secao: 'Outros', icone: iconeParaCategoria(limpo.categoria),
      ordem: this.dados.categorias.length, ativo: true });
    const i = this.dados.produtos.findIndex(x => x.id === limpo.id);
    // preço de exemplo (catálogo inicial) continua marcado até alguém mudar o preço
    if (i >= 0 && this.dados.produtos[i].precoExemplo && !p.confirmarPreco && this.dados.produtos[i].precoCentavos === limpo.precoCentavos) limpo.precoExemplo = true;
    if (i >= 0) this.dados.produtos[i] = limpo; else this.dados.produtos.push(limpo);
    this._salvar();
    return limpo;
  }

  // quem já usa este código de barras (produto ou sabor de outro produto)
  donoDoCodigo(codigo, ignorarId, produtos = this.dados.produtos) {
    if (!codigo) return null;
    for (const p of produtos) {
      if (p.id === ignorarId) continue;
      if (p.codigoBarras === codigo) return p.nome;
      for (const g of p.opcoes || []) for (const i of g.itens) if (i.codigoBarras === codigo) return `${p.nome} (${i.nome})`;
    }
    return null;
  }

  definirImagem(id, caminho) {
    const p = this.dados.produtos.find(x => x.id === id);
    if (!p) throw new Error('Produto não encontrado.');
    if (caminho && path.dirname(caminho) !== this.pastaImagens) throw new Error('Foto fora da pasta do sistema.');
    p.imagem = caminho || '';
    this._salvar();
    return p;
  }

  // ações do admin em vários produtos de uma vez; devolve quantos mudaram
  produtosEmMassa(ids, acao, valor) {
    const alvo = new Set(Array.isArray(ids) ? ids : []);
    const lista = this.dados.produtos.filter(p => alvo.has(p.id));
    if (!lista.length) throw new Error('Nenhum produto selecionado.');
    if (acao === 'excluir') this.dados.produtos = this.dados.produtos.filter(p => !alvo.has(p.id));
    else if (acao === 'mostrar' || acao === 'ocultar') lista.forEach(p => { p.ativo = acao === 'mostrar'; });
    else if (acao === 'confirmarPreco') lista.forEach(p => { delete p.precoExemplo; });
    else if (acao === 'categoria') {
      const cat = this.dados.categorias.find(c => normalizar(c.nome) === normalizar(valor));
      if (!cat) throw new Error('Categoria não encontrada.');
      lista.forEach(p => { p.categoria = cat.nome; });
    } else throw new Error('Ação desconhecida.');
    this._salvar();
    return lista.length;
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
        ...(p.custoCentavos ? { custoCentavos: p.custoCentavos * q } : {}), // custo da linha na hora da venda
        ...(p.controlarEstoque === false ? { preparo: true } : {}), // feito na hora: vai para a via de preparo
        ...(descricao ? { opcoes: descricao, escolhas } : {}) };
    });
  }

  registrarVenda({ itens, formaPagamento, status, por, cliente, pagamento }) {
    const linhas = this._montarLinhas(itens);
    // modo teste: numeração própria (900001, 900002...) para não pular números das vendas de verdade
    const teste = !!this.dados.config.modoTesteVendas;
    const numero = teste ? (this.dados.proximoNumeroTeste = Math.max(900000, this.dados.proximoNumeroTeste || 900000) + 1) : this.dados.proximoNumero++;
    const venda = {
      numero,
      ...(teste ? { teste: true } : {}),
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
    if (venda.status === 'paga' && !venda.teste) this._baixarEstoque(venda);
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
    if (this.dados.config.controlarEstoque === false) return;
    for (const l of venda.itens) {
      const p = this.dados.produtos.find(x => x.id === l.id);
      if (p && p.controlarEstoque !== false) p.estoque -= l.qtd;
    }
  }

  atualizarVenda(numero, mudancas, por) {
    const v = this.dados.vendas.find(x => x.numero === numero);
    if (!v) throw new Error('Venda não encontrada.');
    mudancas = { ...mudancas };
    if ('recebidoComo' in mudancas && !MEIOS.includes(mudancas.recebidoComo)) delete mudancas.recebidoComo;
    const antes = v.status;
    Object.assign(v, mudancas);
    if (mudancas.status && mudancas.status !== antes) {
      v.historico = v.historico || [];
      v.historico.push({ acao: mudancas.status === 'paga' ? 'paga' : mudancas.status === 'cancelada' ? 'cancelada' : mudancas.status,
        por: por || 'Painel', em: new Date().toISOString() });
    }
    if (antes !== 'paga' && v.status === 'paga') { if (!v.teste) this._baixarEstoque(v); this._entrarNaFila(v); }
    if (antes === 'paga' && v.status === 'cancelada' && !v.teste && this.dados.config.controlarEstoque !== false) {
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
    const res = { novos: 0, atualizados: 0, categoriasNovas: [], erros: [], comSabores: 0 };
    const vistos = new Set();
    // linhas com a coluna Sabor e o mesmo nome viram UM produto com o grupo "Sabor";
    // cada sabor guarda o próprio código de barras e a diferença de preço
    const grupos = new Map();
    const comuns = [];
    for (const l of linhas) {
      if (!l.erro && l.dados.sabor) {
        if (!l.dados.nome) { res.erros.push({ linha: l.linha, erro: 'Linha com sabor e sem nome do produto.' }); continue; }
        const k = normalizar(l.dados.nome);
        if (!grupos.has(k)) grupos.set(k, []);
        grupos.get(k).push(l);
      } else comuns.push(l);
    }
    for (const lista of grupos.values()) {
      const primeira = lista[0];
      const precos = lista.map(l => l.dados.precoCentavos).filter(Boolean);
      const base = precos.length ? Math.min(...precos) : undefined;
      const sabores = [], nomesVistos = new Set();
      for (const l of lista) {
        const ns = normalizar(l.dados.sabor);
        if (nomesVistos.has(ns)) { res.erros.push({ linha: l.linha, erro: `Sabor repetido: ${l.dados.sabor} (${l.dados.nome}).` }); continue; }
        nomesVistos.add(ns);
        sabores.push({ linha: l.linha, nome: l.dados.sabor, codigoBarras: l.dados.codigoBarras || '', descricao: l.dados.ingredientes || '',
          precoCentavos: l.dados.precoCentavos && base ? l.dados.precoCentavos - base : 0 });
      }
      const custo = lista.map(l => l.dados.custoCentavos).find(c => c !== undefined);
      const d = { ...primeira.dados, precoCentavos: base, codigoBarras: undefined, _sabores: sabores, custoCentavos: custo };
      delete d.sabor; delete d.estoque; delete d.estoqueMinimo;
      comuns.push({ linha: primeira.linha, dados: d, erro: null });
    }
    comuns.sort((a, b) => a.linha - b.linha);
    for (const { linha, dados: d, erro } of comuns) {
      if (erro) { res.erros.push({ linha, erro }); continue; }
      if (d._sabores) {
        let p = produtos.find(x => normalizar(x.nome) === normalizar(d.nome));
        if (!p && !d.precoCentavos) { res.erros.push({ linha, erro: `"${d.nome}" é novo e está sem preço.` }); continue; }
        const conflito = d._sabores.find(s => s.codigoBarras && this.donoDoCodigo(s.codigoBarras, p?.id, produtos));
        if (conflito) { res.erros.push({ linha: conflito.linha, erro: `Código ${conflito.codigoBarras} já é de "${this.donoDoCodigo(conflito.codigoBarras, p?.id, produtos)}".` }); continue; }
        if (d.categoria) {
          const cat = categorias.find(c => normalizar(c.nome) === normalizar(d.categoria));
          if (cat) d.categoria = cat.nome;
          else {
            categorias.push({ id: crypto.randomUUID(), nome: d.categoria, secao: d.secao || 'Outros', icone: iconeParaCategoria(d.categoria),
              ordem: Math.max(-1, ...categorias.map(x => x.ordem)) + 1, ativo: true });
            res.categoriasNovas.push(d.categoria);
          }
        }
        if (!p) {
          p = { id: crypto.randomUUID(), nome: d.nome, codigoBarras: '', categoria: 'Outros', estoque: 0, estoqueMinimo: 3,
            controlarEstoque: true, imagem: '', ativo: true, opcoes: [] };
          produtos.push(p);
          res.novos++;
        } else res.atualizados++;
        if (d.precoCentavos !== undefined) delete p.precoExemplo; // preço vindo da planilha conta como definitivo
        for (const k of ['precoCentavos', 'custoCentavos', 'categoria', 'ativo']) if (d[k] !== undefined) p[k] = d[k];
        if (d.feitoNaHora !== undefined) p.controlarEstoque = !d.feitoNaHora;
        // atualiza o grupo "Sabor" mantendo os ids dos sabores que já existiam (vendas antigas continuam batendo)
        const opcoes = (p.opcoes || []).map(g => ({ ...g, itens: [...g.itens] }));
        let g = opcoes.find(x => normalizar(x.nome) === 'sabor');
        if (!g) { g = { id: crypto.randomUUID(), nome: 'Sabor', min: 1, max: 1, itens: [] }; opcoes.unshift(g); }
        g.itens = d._sabores.map(s => {
          const antigo = g.itens.find(i => normalizar(i.nome) === normalizar(s.nome));
          const item = { id: antigo?.id || crypto.randomUUID(), nome: s.nome, precoCentavos: s.precoCentavos };
          if (s.codigoBarras) item.codigoBarras = s.codigoBarras;
          const desc = s.descricao || antigo?.descricao;
          if (desc) item.descricao = desc;
          return item;
        });
        g.min = 1; g.max = 1;
        p.opcoes = opcoes;
        res.comSabores++;
        continue;
      }
      const chave = d.codigoBarras ? 'c:' + d.codigoBarras : 'n:' + normalizar(d.nome);
      if (vistos.has(chave)) { res.erros.push({ linha, erro: `Produto repetido na planilha (${d.codigoBarras || d.nome}).` }); continue; }
      vistos.add(chave);
      let p = d.codigoBarras && produtos.find(x => x.codigoBarras === d.codigoBarras);
      if (!p && d.nome) p = produtos.find(x => normalizar(x.nome) === normalizar(d.nome) && (!x.codigoBarras || !d.codigoBarras));
      if (!p) {
        if (!d.nome) { res.erros.push({ linha, erro: 'Produto novo sem nome.' }); continue; }
        if (!d.precoCentavos) { res.erros.push({ linha, erro: `"${d.nome}" é novo e está sem preço.` }); continue; }
      }
      const dono = d.codigoBarras && this.donoDoCodigo(d.codigoBarras, p?.id, produtos);
      if (dono) { res.erros.push({ linha, erro: `Código ${d.codigoBarras} já é do produto "${dono}".` }); continue; }
      if (d.categoria) {
        const cat = categorias.find(c => normalizar(c.nome) === normalizar(d.categoria));
        if (cat) d.categoria = cat.nome;
        else {
          categorias.push({ id: crypto.randomUUID(), nome: d.categoria, secao: d.secao || 'Outros', icone: iconeParaCategoria(d.categoria),
            ordem: Math.max(-1, ...categorias.map(x => x.ordem)) + 1, ativo: true });
          res.categoriasNovas.push(d.categoria);
        }
      }
      const campos = {};
      for (const k of ['nome', 'codigoBarras', 'precoCentavos', 'custoCentavos', 'categoria', 'estoque', 'estoqueMinimo', 'ativo']) if (d[k] !== undefined) campos[k] = d[k];
      if (d.feitoNaHora !== undefined) campos.controlarEstoque = !d.feitoNaHora;
      if (p) {
        if (campos.precoCentavos !== undefined) delete p.precoExemplo;
        Object.assign(p, campos); res.atualizados++;
      }
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

  // Indicadores do período (dias operacionais, de/ate = 'AAAA-MM-DD') e fluxo de caixa das entradas
  indicadores({ de, ate } = {}) {
    const hoje = diaLocal();
    de = de || hoje; ate = ate || de;
    if (ate < de) [de, ate] = [ate, de];
    const diaDe = v => v.dia || v.data.slice(0, 10);
    const noPeriodo = (a, b) => this.dados.vendas.filter(v => !v.teste && diaDe(v) >= a && diaDe(v) <= b);
    const vendas = noPeriodo(de, ate);
    const pagas = vendas.filter(v => v.status === 'paga');
    const soma = arr => arr.reduce((s, v) => s + v.totalCentavos, 0);
    const canceladas = vendas.filter(v => v.status === 'cancelada');
    // período anterior de mesmo tamanho, para comparar
    const umDia = 864e5, d0 = Date.parse(de + 'T12:00:00Z'), d1 = Date.parse(ate + 'T12:00:00Z');
    const n = Math.round((d1 - d0) / umDia) + 1;
    const iso = t => new Date(t).toISOString().slice(0, 10);
    const antDe = iso(d0 - n * umDia), antAte = iso(d0 - umDia);
    const pagasAnt = noPeriodo(antDe, antAte).filter(v => v.status === 'paga');
    const produto = id => this.dados.produtos.find(p => p.id === id);
    const secaoDe = cat => (this.dados.categorias.find(c => c.nome === cat) || {}).secao || 'Outros';

    const porHora = Array.from({ length: 24 }, (_, h) => ({ hora: h, vendas: 0, totalCentavos: 0 }));
    const dias = Array.from({ length: n }, (_, i) => iso(d0 + i * umDia));
    const fluxo = dias.map(dia => ({ dia, dinheiro: 0, pix: 0, cartao: 0, balcao: 0, total: 0, vendas: 0 }));
    const porMeio = { dinheiro: 0, pix: 0, cartao: 0, balcao: 0 };
    const porCategoria = {}, porSecao = {}, produtos = {};
    let itens = 0, comCusto = 0, custoTotal = 0;
    for (const v of pagas) {
      const h = new Date(v.data).getHours();
      porHora[h].vendas++; porHora[h].totalCentavos += v.totalCentavos;
      const meio = meioRecebimento(v);
      porMeio[meio] += v.totalCentavos;
      const f = fluxo.find(x => x.dia === diaDe(v));
      if (f) { f[meio] += v.totalCentavos; f.total += v.totalCentavos; f.vendas++; }
      for (const l of v.itens) {
        itens += l.qtd;
        const cat = produto(l.id)?.categoria || 'Outros';
        porCategoria[cat] = (porCategoria[cat] || 0) + l.totalCentavos;
        const sec = secaoDe(cat);
        porSecao[sec] = (porSecao[sec] || 0) + l.totalCentavos;
        const k = l.nome;
        produtos[k] = produtos[k] || { nome: k, qtd: 0, totalCentavos: 0, lucroCentavos: 0, semCusto: false };
        produtos[k].qtd += l.qtd; produtos[k].totalCentavos += l.totalCentavos;
        if (l.custoCentavos) { comCusto += l.totalCentavos; custoTotal += l.custoCentavos; produtos[k].lucroCentavos += l.totalCentavos - l.custoCentavos; }
        else produtos[k].semCusto = true;
      }
    }
    let acumulado = 0;
    for (const f of fluxo) { acumulado += f.total; f.acumulado = acumulado; }
    const preparos = pagas.filter(v => v.preparoDesde && v.preparoProntoEm)
      .map(v => (Date.parse(v.preparoProntoEm) - Date.parse(v.preparoDesde)) / 60000).filter(m => m >= 0 && m < 240);
    const lista = obj => Object.entries(obj).map(([nome, totalCentavos]) => ({ nome, totalCentavos })).sort((a, b) => b.totalCentavos - a.totalCentavos);
    const fat = soma(pagas);
    return {
      de, ate, dias: n,
      faturamentoCentavos: fat,
      vendas: pagas.length,
      ticketMedioCentavos: pagas.length ? Math.round(fat / pagas.length) : 0,
      itensPorVenda: pagas.length ? Math.round(itens / pagas.length * 10) / 10 : 0,
      canceladas: canceladas.length, canceladasCentavos: soma(canceladas),
      aguardando: vendas.filter(v => v.status === 'aguardando_caixa').length,
      anterior: { de: antDe, ate: antAte, faturamentoCentavos: soma(pagasAnt), vendas: pagasAnt.length },
      porHora, porMeio, fluxo,
      porCategoria: lista(porCategoria), porSecao: lista(porSecao),
      maisVendidos: Object.values(produtos).sort((a, b) => b.qtd - a.qtd || b.totalCentavos - a.totalCentavos).slice(0, 10),
      // lucro bruto = vendas com custo cadastrado − custo delas (vendas sem custo ficam de fora da conta)
      lucro: { lucroCentavos: comCusto - custoTotal, vendasComCustoCentavos: comCusto,
        margem: comCusto ? Math.round((comCusto - custoTotal) / comCusto * 1000) / 10 : null,
        cobertura: fat ? Math.round(comCusto / fat * 100) : 0 },
      preparoMinutos: preparos.length ? Math.round(preparos.reduce((a, b) => a + b, 0) / preparos.length * 10) / 10 : null,
      preparosMedidos: preparos.length
    };
  }

  // privacidade: o nome do cliente só serve para chamar o pedido; some das vendas depois de X dias
  esquecerClientes(dias = 30, agora = new Date()) {
    const limite = new Date(agora.getTime() - dias * 864e5).toISOString();
    let n = 0;
    for (const v of this.dados.vendas) {
      if (v.cliente?.nome && v.data < limite) { delete v.cliente.nome; if (!v.cliente.local) delete v.cliente; n++; }
    }
    if (n) this._salvar();
    return n;
  }

  // restaura um backup: valida antes, guarda o estado atual e recarrega
  restaurar(arquivoBackup, pastaSeguranca) {
    const texto = fs.readFileSync(arquivoBackup, 'utf8');
    let d;
    try { d = JSON.parse(texto); } catch { throw new Error('Esse arquivo de backup está corrompido.'); }
    if (!d || !Array.isArray(d.produtos) || !Array.isArray(d.vendas) || !d.config) throw new Error('Esse arquivo não é um backup do sistema.');
    fs.mkdirSync(pastaSeguranca, { recursive: true });
    const seguranca = path.join(pastaSeguranca, `antes-de-restaurar-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.copyFileSync(this.arquivo, seguranca);
    fs.writeFileSync(this.arquivo + '.tmp', texto);
    fs.renameSync(this.arquivo + '.tmp', this.arquivo);
    this.dados = this._carregar();
    return { seguranca, produtos: this.dados.produtos.length, vendas: this.dados.vendas.length };
  }

  // relatórios nunca veem venda de teste; incluirTeste = telas que precisam achar o pedido (receber, reimprimir)
  listarVendas({ de, ate, incluirTeste = false } = {}) {
    return this.dados.vendas.filter(v => {
      if (v.teste && !incluirTeste) return false;
      const d = v.dia || v.data.slice(0, 10);
      return (!de || d >= de) && (!ate || d <= ate);
    });
  }
  venda(numero) { return this.dados.vendas.find(x => x.numero === numero) || null; }

  apagarVendasTeste() {
    const n = this.dados.vendas.filter(v => v.teste).length;
    this.dados.vendas = this.dados.vendas.filter(v => !v.teste);
    this.dados.proximoNumeroTeste = 900000;
    this._salvar();
    return n;
  }
  // começa do zero (antes de abrir a loja): apaga vendas e fechamentos e volta a numeração para 1
  zerarVendas() {
    const r = { vendas: this.dados.vendas.length, fechamentos: this.dados.fechamentos.length };
    this.dados.vendas = []; this.dados.fechamentos = [];
    this.dados.proximoNumero = 1; this.dados.proximoNumeroTeste = 900000;
    this._salvar();
    return r;
  }
}

module.exports = { Banco };
