// =====================================================================
//  MERCADO PAGO — maquininha Point integrada (API Orders, modo PDV)
//
//  Como funciona: o totem cria uma "order" do tipo point para a maquininha (terminal_id).
//  A maquininha em modo PDV recebe a order e abre a tela de pagamento com o valor: o cliente
//  passa o cartão (crédito ou débito) ou paga o PIX no QR que aparece NELA. O totem consulta a
//  order até ficar "processed" (aprovada).
//
//  Compatíveis no Brasil: Point Smart 1 e 2, Point Pro 2 e Point Pro 3.
//  Não precisa de homologação: basta uma aplicação em "Suas integrações" NA CONTA DA LOJA
//  (o dinheiro cai na conta dona do Access Token). Passo a passo: docs/MERCADO-PAGO.md
//
//  Documentação: https://www.mercadopago.com.br/developers/pt/docs/mp-point/overview
//   GET   /terminals/v1/list          lista as maquininhas da conta (id = TIPO__SERIAL, operating_mode)
//   PATCH /terminals/v1/setup         coloca a maquininha em modo PDV (depois reinicie a maquininha)
//   POST  /v1/orders                  cria a order (X-Idempotency-Key)
//   GET   /v1/orders/{id}             consulta (o MP recomenda webhook; o totem não tem endereço
//                                     público, então consulta a cada 3 s só enquanto espera)
//   POST  /v1/orders/{id}/cancel      cancela (x-allow-cancelable-status: at_terminal)
//   POST  /v1/orders/{id}/refund      reembolso total (não usado pelo totem: estorno é decisão do admin)
// =====================================================================
const crypto = require('crypto');

const API = process.env.PDV_MP_API || 'https://api.mercadopago.com'; // a variável só existe para os testes automáticos
const TEMPO_LIMITE = 15000;

async function chamar(metodo, caminho, cfg, corpo, extras = {}) {
  const token = String(cfg.accessToken || '').trim();
  if (!token) throw new Error('Informe o Access Token do Mercado Pago.');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TEMPO_LIMITE);
  let r;
  try {
    r = await fetch(API + caminho, {
      method: metodo, signal: ctrl.signal, body: corpo ? JSON.stringify(corpo) : undefined,
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Accept: 'application/json', ...extras }
    });
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'O Mercado Pago não respondeu a tempo.' : 'Sem conexão com o Mercado Pago. Confira a internet.');
  } finally { clearTimeout(timer); }
  const texto = await r.text();
  let dados = {};
  try { dados = texto ? JSON.parse(texto) : {}; } catch { dados = { message: texto.slice(0, 200) }; }
  if (!r.ok) {
    if (r.status === 401) throw new Error('Access Token recusado pelo Mercado Pago. Confira o token em Configurações.');
    if (r.status === 403) throw new Error('O Mercado Pago recusou o acesso. Confira se o token é da conta dona da maquininha.');
    if (r.status === 429) throw new Error('Muitas consultas ao Mercado Pago em pouco tempo.');
    const erro = new Error(`Mercado Pago: ${dados.errors?.[0]?.message || dados.message || 'erro ' + r.status}`);
    erro.status = r.status; erro.codigo = dados.errors?.[0]?.code || dados.error || '';
    throw erro;
  }
  return dados;
}

// o id da maquininha na API é "TIPO__SERIAL"; a loja só informa o número de série (etiqueta atrás)
const terminais = new Map(); // serial -> { id, modo }
async function listarTerminais(cfg) {
  const r = await chamar('GET', '/terminals/v1/list?limit=50', cfg);
  return r.data?.terminals || r.terminals || [];
}
async function terminalDa(cfg) {
  const serial = String(cfg.serialMaquininha || '').replace(/\s/g, '');
  if (!serial) throw new Error('Informe o número de série da maquininha (S/N na etiqueta atrás dela).');
  if (terminais.has(serial)) return terminais.get(serial);
  const t = (await listarTerminais(cfg)).find(x => String(x.id).toUpperCase().endsWith(serial.toUpperCase()));
  if (!t) throw new Error(`A maquininha ${serial} não está vinculada a esta conta. No app Mercado Pago, vincule a Point a uma loja e caixa.`);
  const info = { id: t.id, modo: t.operating_mode };
  terminais.set(serial, info);
  return info;
}

const valor = c => (c / 100).toFixed(2);
const MOTIVOS = {
  rejected_by_issuer: 'recusado pelo banco do cartão', insufficient_amount: 'saldo insuficiente', card_disabled: 'cartão bloqueado',
  high_risk: 'recusado por segurança', bad_filled_card_data: 'dados do cartão incorretos', amount_limit_exceeded: 'valor acima do limite',
  max_attempts_exceeded: 'tentativas demais', required_call_for_authorize: 'o banco pede para ligar e autorizar', processing_error: 'erro no processamento'
};
const BANDEIRAS = { visa: 'Visa', master: 'Mastercard', debvisa: 'Visa', debmaster: 'Mastercard', elo: 'Elo', debelo: 'Elo', amex: 'Amex',
  hipercard: 'Hipercard', pix: 'PIX', cabal: 'Cabal' };

async function criarOrder(pedido, cfg, tipo) {
  const term = await terminalDa(cfg);
  const pagamento = { default_type: tipo };
  if (tipo === 'credit_card') { pagamento.default_installments = 1; pagamento.installments_cost = 'seller'; } // à vista
  const corpo = {
    type: 'point',
    external_reference: pedido.referencia.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64),
    expiration_time: 'PT10M',
    description: String(pedido.descricao || 'Compra').slice(0, 150),
    transactions: { payments: [{ amount: valor(pedido.valorCentavos) }] },
    config: {
      point: { terminal_id: term.id, print_on_terminal: cfg.imprimirNaMaquininha === 'sim' ? 'seller_ticket' : 'no_ticket' },
      payment_method: pagamento
    }
  };
  const r = await chamar('POST', '/v1/orders', cfg, corpo, { 'X-Idempotency-Key': pedido.referencia });
  if (!r.id) throw new Error('O Mercado Pago não devolveu o número da order.');
  return r;
}

module.exports = {
  id: 'mercadopago',
  nome: 'Mercado Pago (Point integrada)',
  descricao: 'O valor vai direto para a maquininha Point ao lado do totem (Point Smart, Pro 2, Pro 3). Cartão de crédito, débito e PIX (o QR aparece na maquininha).',
  suporta: { pix: true, cartao: true },
  pixNaMaquininha: true,
  intervaloConsulta: 3000,
  validade: { pix: 5 * 60 * 1000, cartao: 3 * 60 * 1000 },
  campos: [
    { chave: 'accessToken', rotulo: 'Access Token', tipo: 'senha', ajuda: 'Suas integrações › sua aplicação › Credenciais. TEST-... para testar, APP_USR-... para a loja. Tem que ser da conta dona da maquininha.' },
    { chave: 'serialMaquininha', rotulo: 'Número de série da maquininha (S/N)', tipo: 'texto', ajuda: 'Na etiqueta atrás da Point, depois de "S/N". O "Testar conexão" acha a maquininha e coloca no modo PDV.' },
    { chave: 'tipoCartao', rotulo: 'Cartão', tipo: 'opcoes', padrao: 'perguntar',
      opcoes: [['perguntar', 'Cliente escolhe crédito ou débito no totem'], ['credit', 'Sempre crédito à vista'], ['debit', 'Sempre débito']] },
    { chave: 'imprimirNaMaquininha', rotulo: 'Comprovante na maquininha', tipo: 'opcoes', padrao: 'nao',
      opcoes: [['nao', 'Não imprimir (o totem já imprime o cupom)'], ['sim', 'Imprimir também na maquininha']] }
  ],

  // acha a maquininha pelo número de série e, se precisar, coloca no modo PDV
  async testarConexao(cfg) {
    terminais.clear();
    const lista = await listarTerminais(cfg);
    const serial = String(cfg.serialMaquininha || '').replace(/\s/g, '');
    if (!serial) throw new Error(`Conectado, mas falta o número de série. Maquininhas nesta conta: ${lista.map(t => t.id).join(', ') || 'nenhuma'}.`);
    const t = lista.find(x => String(x.id).toUpperCase().endsWith(serial.toUpperCase()));
    if (!t) throw new Error(`Conectado, mas a maquininha ${serial} não está nesta conta. ${lista.length ? 'Encontrei: ' + lista.map(x => x.id).join(', ') + '.' : 'Nenhuma maquininha vinculada: vincule a Point a uma loja e caixa no app Mercado Pago.'}`);
    const teste = String(cfg.accessToken).trim().startsWith('TEST-');
    let modo = '';
    if (t.operating_mode !== 'PDV') {
      await chamar('PATCH', '/terminals/v1/setup', cfg, { terminals: [{ id: t.id, operating_mode: 'PDV' }] });
      modo = ' Coloquei a maquininha no modo PDV: DESLIGUE E LIGUE a maquininha antes da primeira venda.';
    }
    terminais.set(serial, { id: t.id, modo: 'PDV' });
    return { ok: true, mensagem: `Conectado ao Mercado Pago${teste ? ' em modo de TESTE' : ' em PRODUÇÃO'}. Maquininha ${t.id} encontrada.${modo}` };
  },

  async criarCartao(pedido, cfg) {
    const tipo = ['credit', 'debit'].includes(pedido.tipoCartao) ? pedido.tipoCartao
      : ['credit', 'debit'].includes(cfg.tipoCartao) ? cfg.tipoCartao : 'credit';
    const r = await criarOrder(pedido, cfg, tipo === 'debit' ? 'debit_card' : 'credit_card');
    return { id: r.id };
  },

  async criarPix(pedido, cfg) {
    const r = await criarOrder(pedido, cfg, 'qr');
    return { id: r.id, naMaquininha: true };
  },

  async consultar(id, cfg) {
    const o = await chamar('GET', `/v1/orders/${encodeURIComponent(id)}`, cfg);
    const p = o.transactions?.payments?.[0] || {};
    if (o.status === 'processed' || p.status === 'processed') {
      const metodo = String(p.payment_method?.id || '').toLowerCase();
      return {
        status: 'aprovado',
        nsu: String(p.reference_id || p.id || ''),
        autorizacao: String(p.authorization_code || p.payment_method?.authorization_code || ''),
        bandeira: BANDEIRAS[metodo] || p.payment_method?.id || (p.payment_method?.type === 'qr' ? 'PIX' : '')
      };
    }
    if (['canceled', 'refunded'].includes(o.status)) return { status: 'cancelado' };
    if (o.status === 'expired') return { status: 'expirado' };
    if (o.status === 'failed') return { status: 'recusado', detalhe: MOTIVOS[p.status_detail] || MOTIVOS[o.status_detail] || 'pagamento não aprovado' };
    // created / at_terminal / action_required: ainda esperando o cliente na maquininha
    return { status: 'pendente' };
  },

  async cancelar(id, cfg) {
    try {
      await chamar('POST', `/v1/orders/${encodeURIComponent(id)}/cancel`, cfg, undefined,
        { 'X-Idempotency-Key': crypto.randomUUID(), 'x-allow-cancelable-status': 'at_terminal' });
    } catch { /* já paga, cancelada ou expirada: nada a fazer */ }
  }
};
