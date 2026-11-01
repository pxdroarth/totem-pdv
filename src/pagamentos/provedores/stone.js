// =====================================================================
//  STONE — maquininha integrada (Stone Connect 2.0, API de pedidos da Pagar.me)
//
//  Como funciona: o totem cria um "pedido direto" para a maquininha (pelo número de série).
//  A maquininha sai da espera e já abre a tela de pagamento com o valor: o cliente passa o
//  cartão (crédito ou débito) ou paga o PIX no QR que aparece NELA. O totem consulta o pedido
//  até ficar pago e então FECHA o pedido (obrigatório: pedido aberto trava a fila da maquininha).
//
//  O que a Stone precisa liberar (ver docs/STONE.md):
//   - cadastro no Stone Partner Program -> ServiceRefererName (ID do parceiro)
//   - Secret Key da conta Pagar.me da loja (sk_test_... para homologar, sk_... em produção)
//   - maquininha S920 ou Q92 com o app de pagamentos >= 6.4 (PIX direto) e o número de série
//
//  Documentação: https://connect-stone.stone.com.br/reference
//   POST  /orders                 cria o pedido (closed: false + poi_payment_settings)
//   GET   /orders/{id}            consulta (a Stone recomenda webhook; aqui o totem não tem
//                                 endereço público, então consulta com intervalo de 3 s)
//   PATCH /orders/{id}/closed     fecha: { status: 'paid' } depois de pago, 'canceled' para tirar da maquininha
//  Estorno de venda paga não tem rota na API: é feito na maquininha ou no Portal Stone.
// =====================================================================

const API = process.env.PDV_STONE_API || 'https://api.pagar.me/core/v5'; // a variável só existe para os testes automáticos
const TEMPO_LIMITE = 15000;

function cabecalhos(cfg) {
  if (!cfg.secretKey) throw new Error('Informe a Secret Key da Stone/Pagar.me.');
  const h = {
    Authorization: 'Basic ' + Buffer.from(String(cfg.secretKey).trim() + ':').toString('base64'),
    'Content-Type': 'application/json',
    Accept: 'application/json'
  };
  if (cfg.serviceRefererName) h.ServiceRefererName = String(cfg.serviceRefererName).trim();
  return h;
}

async function chamar(metodo, caminho, cfg, corpo) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TEMPO_LIMITE);
  let r;
  try {
    r = await fetch(API + caminho, { method: metodo, headers: cabecalhos(cfg), body: corpo ? JSON.stringify(corpo) : undefined, signal: ctrl.signal });
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'A Stone não respondeu a tempo.' : 'Sem conexão com a Stone. Confira a internet.');
  } finally { clearTimeout(timer); }
  const texto = await r.text();
  let dados = {};
  try { dados = texto ? JSON.parse(texto) : {}; } catch { dados = { message: texto.slice(0, 200) }; }
  if (!r.ok) {
    if (r.status === 401) throw new Error('Secret Key recusada pela Stone/Pagar.me. Confira a chave em Configurações.');
    if (r.status === 403) throw new Error('A Stone recusou o acesso. Confira o ServiceRefererName e se a integração foi liberada para esta conta.');
    if (r.status === 429) throw new Error('Muitas consultas à Stone em pouco tempo.');
    const detalhes = dados.errors ? Object.values(dados.errors).flat().join(' ') : '';
    throw new Error(`Stone: ${dados.message || 'erro ' + r.status}${detalhes ? ' — ' + detalhes : ''}`);
  }
  return dados;
}

function corpoPedido(pedido, cfg, tipo) {
  const serial = String(cfg.serialMaquininha || '').trim();
  if (!serial) throw new Error('Informe o número de série da maquininha Stone em Configurações.');
  const pagamento = { type: tipo };
  if (tipo === 'credit') { pagamento.installments = 1; pagamento.installment_type = 'merchant'; } // à vista
  const cliente = { name: pedido.cliente || 'Cliente do totem' };
  if (cfg.emailCliente) cliente.email = String(cfg.emailCliente).trim();
  return {
    code: pedido.referencia, // código único desta tentativa (aparece no painel da Pagar.me)
    customer: cliente,
    items: [{ amount: pedido.valorCentavos, description: String(pedido.descricao || 'Compra').slice(0, 250), quantity: 1, code: pedido.referencia }],
    closed: false,
    poi_payment_settings: {
      visible: true,
      print_order_receipt: cfg.imprimirNaMaquininha === 'sim',
      devices_serial_number: [serial],
      payment_setup: pagamento,
      display_name: String(pedido.descricao || 'Pedido').slice(0, 30)
    }
  };
}

const fechados = new Set(); // pedidos que este totem já fechou (fechar duas vezes não faz mal, mas evita chamadas)
async function fechar(id, cfg, status) {
  if (fechados.has(id)) return;
  await chamar('PATCH', `/orders/${encodeURIComponent(id)}/closed`, cfg, { status });
  fechados.add(id);
}

const BANDEIRAS = { visa: 'Visa', mastercard: 'Mastercard', elo: 'Elo', amex: 'Amex', hipercard: 'Hipercard', hiper: 'Hiper', diners: 'Diners', discover: 'Discover', jcb: 'JCB', cabal: 'Cabal' };

module.exports = {
  id: 'stone',
  nome: 'Stone (maquininha integrada)',
  descricao: 'O valor vai direto para a maquininha Stone ao lado do totem. Cartão de crédito, débito e PIX (o QR aparece na maquininha).',
  suporta: { pix: true, cartao: true },
  pixNaMaquininha: true,       // o PIX é pago no QR da maquininha, não na tela do totem
  intervaloConsulta: 3000,     // a Stone limita consultas: no máximo uma a cada 3 s
  validade: { pix: 5 * 60 * 1000, cartao: 3 * 60 * 1000 },
  campos: [
    { chave: 'secretKey', rotulo: 'Secret Key (sk_...)', tipo: 'senha', ajuda: 'Dashboard da Pagar.me › Desenvolvimento › Chaves. Para homologar use a sk_test_...' },
    { chave: 'serviceRefererName', rotulo: 'ServiceRefererName (ID do parceiro)', tipo: 'texto', ajuda: 'Fornecido pela Stone no Partner Program. Sem ele o pedido pode não chegar na maquininha.' },
    { chave: 'serialMaquininha', rotulo: 'Número de série da maquininha', tipo: 'texto', ajuda: 'Na etiqueta atrás da maquininha (S920 ou Q92).' },
    { chave: 'tipoCartao', rotulo: 'Cartão', tipo: 'opcoes', padrao: 'perguntar',
      opcoes: [['perguntar', 'Cliente escolhe crédito ou débito no totem'], ['credit', 'Sempre crédito à vista'], ['debit', 'Sempre débito']] },
    { chave: 'imprimirNaMaquininha', rotulo: 'Comprovante na maquininha', tipo: 'opcoes', padrao: 'nao',
      opcoes: [['nao', 'Não imprimir (o totem já imprime o cupom)'], ['sim', 'Imprimir também na maquininha']] },
    { chave: 'emailCliente', rotulo: 'E-mail do cliente nos pedidos (opcional)', tipo: 'texto', ajuda: 'Só se a Stone exigir um e-mail no cliente. Ex.: o e-mail da loja.' }
  ],

  async testarConexao(cfg) {
    if (!String(cfg.serialMaquininha || '').trim()) throw new Error('Falta o número de série da maquininha.');
    await chamar('GET', '/orders?page=1&size=1', cfg);
    const teste = String(cfg.secretKey).startsWith('sk_test_');
    return { ok: true, mensagem: `Conectado à Stone/Pagar.me${teste ? ' em modo de TESTE (sk_test)' : ' em PRODUÇÃO'}. Faça uma venda de R$ 1,00 para conferir a maquininha.` };
  },

  async criarCartao(pedido, cfg) {
    const tipo = ['credit', 'debit'].includes(pedido.tipoCartao) ? pedido.tipoCartao
      : ['credit', 'debit'].includes(cfg.tipoCartao) ? cfg.tipoCartao : 'credit';
    const r = await chamar('POST', '/orders', cfg, corpoPedido(pedido, cfg, tipo));
    if (!r.id) throw new Error('A Stone não devolveu o número do pedido.');
    return { id: r.id };
  },

  async criarPix(pedido, cfg) {
    const r = await chamar('POST', '/orders', cfg, corpoPedido(pedido, cfg, 'pix'));
    if (!r.id) throw new Error('A Stone não devolveu o número do pedido.');
    return { id: r.id, naMaquininha: true };
  },

  async consultar(id, cfg) {
    const o = await chamar('GET', `/orders/${encodeURIComponent(id)}`, cfg);
    const cobrancas = Array.isArray(o.charges) ? o.charges : [];
    const paga = cobrancas.find(c => c.status === 'paid');
    if (o.status === 'paid' || paga) {
      await fechar(id, cfg, 'paid').catch(() => {}); // tenta de novo na próxima consulta se falhar
      const t = paga?.last_transaction || {};
      const marca = String(t.card?.brand || '').toLowerCase();
      return {
        status: 'aprovado',
        nsu: String(t.acquirer_nsu || t.nsu || ''),
        autorizacao: String(t.acquirer_auth_code || ''),
        bandeira: BANDEIRAS[marca] || t.card?.brand || (paga?.payment_method === 'pix' ? 'PIX' : '')
      };
    }
    if (o.status === 'canceled') return { status: 'cancelado' };
    if (o.status === 'failed') {
      const t = cobrancas.at(-1)?.last_transaction || {};
      return { status: 'recusado', detalhe: t.acquirer_message || t.gateway_response?.errors?.[0]?.message || 'pagamento não aprovado' };
    }
    // cartão recusado na maquininha: o pedido continua aberto e o cliente pode tentar outro cartão
    return { status: 'pendente' };
  },

  async cancelar(id, cfg) {
    try { await fechar(id, cfg, 'canceled'); } catch { /* já fechado ou pago: nada a fazer */ }
  }
};
