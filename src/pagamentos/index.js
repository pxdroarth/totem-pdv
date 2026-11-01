// Orquestra os gateways de pagamento. Cada gateway é um arquivo em ./provedores
// seguindo o contrato de provedores/_modelo.js. O resto do sistema só conversa com
// esta classe, então trocar de gateway não mexe nas telas nem nas vendas.
//
// "manual" não é um gateway: é o modo de hoje (QR fixo do PIX e maquininha avulsa,
// com o atendente confirmando por PIN).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PASTA = path.join(__dirname, 'provedores');
const MANUAL = { id: 'manual', nome: 'Manual (atendente confirma com PIN)', descricao: 'PIX com QR fixo e maquininha avulsa. Sem internet e sem taxa de integração.',
  suporta: { pix: true, cartao: true }, campos: [], manual: true };
const VALIDADE_PADRAO = { pix: 10 * 60 * 1000, cartao: 3 * 60 * 1000 };
const FINAIS = ['aprovado', 'recusado', 'cancelado', 'expirado', 'erro'];
const INTERVALO_CONSULTA = 1500; // não consulta o gateway mais rápido que isso

function carregarProvedores() {
  const lista = [MANUAL];
  for (const arq of fs.readdirSync(PASTA).sort()) {
    if (!arq.endsWith('.js') || arq.startsWith('_')) continue;
    const p = require(path.join(PASTA, arq));
    for (const fn of ['criarPix', 'criarCartao', 'consultar', 'cancelar', 'testarConexao'])
      if (typeof p[fn] !== 'function') throw new Error(`Gateway ${arq}: falta a função ${fn}.`);
    lista.push(p);
  }
  return lista;
}

class Pagamentos {
  // getConfig: () => config da loja (usa config.pagamentos)
  constructor({ getConfig }) {
    this.getConfig = getConfig;
    this.provedores = carregarProvedores();
    this.transacoes = new Map();
  }

  _cfgPag() { return this.getConfig().pagamentos || {}; }
  provedor(id) { return this.provedores.find(p => p.id === id); }
  provedorDe(forma) {
    const id = this._cfgPag()[forma === 'pix' ? 'provedorPix' : 'provedorCartao'] || 'manual';
    return this.provedor(id) || MANUAL;
  }
  credenciais(id) {
    const p = this.provedor(id);
    const salvas = (this._cfgPag().credenciais || {})[id] || {};
    const padroes = Object.fromEntries((p?.campos || []).filter(c => c.padrao !== undefined).map(c => [c.chave, c.padrao]));
    return { ...padroes, ...salvas };
  }

  // lista para o admin (sem nada secreto)
  listar() {
    return this.provedores.map(({ id, nome, descricao, suporta, campos, manual, pixNaMaquininha }) =>
      ({ id, nome, descricao, suporta, campos, manual: !!manual, pixNaMaquininha: !!pixNaMaquininha }));
  }

  // o que a tela do cliente precisa saber (nada secreto): PIX na maquininha? perguntar crédito/débito?
  infoTotem() {
    const pix = this.provedorDe('pix'), cartao = this.provedorDe('cartao');
    const tipo = this.credenciais(cartao.id).tipoCartao;
    return {
      pixNaMaquininha: !pix.manual && !!pix.pixNaMaquininha,
      perguntarTipoCartao: !cartao.manual && (cartao.campos || []).some(c => c.chave === 'tipoCartao') && (tipo || 'perguntar') === 'perguntar'
    };
  }

  async testar(id, credenciais) {
    const p = this.provedor(id);
    if (!p) throw new Error('Gateway não encontrado.');
    if (p.manual) return { ok: true, mensagem: 'Modo manual não precisa de conexão.' };
    return p.testarConexao({ ...this.credenciais(id), ...(credenciais || {}) });
  }

  _publica(t) {
    const { id, provedor, forma, valorCentavos, status, detalhe, qrTexto, expiraEm, naMaquininha } = t;
    return { id, provedor, forma, valorCentavos, status, detalhe, qrTexto, expiraEm, naMaquininha: !!naMaquininha };
  }

  // extras: { tipoCartao: 'credit' | 'debit', cliente } — usados por gateways que precisam
  async iniciar(forma, valorCentavos, descricao, extras = {}) {
    if (!['pix', 'cartao'].includes(forma)) throw new Error('Forma de pagamento inválida.');
    if (!(valorCentavos > 0)) throw new Error('Valor inválido.');
    const p = this.provedorDe(forma);
    if (p.manual) throw new Error('Esta forma de pagamento está no modo manual.');
    if (!p.suporta[forma]) throw new Error(`${p.nome} não atende ${forma === 'pix' ? 'PIX' : 'cartão'}.`);
    const referencia = 'LSF-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(2).toString('hex').toUpperCase();
    const pedido = { valorCentavos, referencia, descricao: descricao || 'Compra Lisufit',
      ...(['credit', 'debit'].includes(extras.tipoCartao) ? { tipoCartao: extras.tipoCartao } : {}),
      ...(extras.cliente ? { cliente: String(extras.cliente).slice(0, 60) } : {}) };
    const cfg = this.credenciais(p.id);
    const r = forma === 'pix' ? await p.criarPix(pedido, cfg) : await p.criarCartao(pedido, cfg);
    if (!r || !r.id) throw new Error('O gateway não devolveu o identificador da cobrança.');
    if (forma === 'pix' && !r.qrTexto && !r.naMaquininha) throw new Error('O gateway não devolveu o código do PIX.');
    const validade = (p.validade || VALIDADE_PADRAO)[forma] || VALIDADE_PADRAO[forma];
    const t = {
      id: crypto.randomUUID(), provedor: p.id, forma, valorCentavos, referencia, externoId: r.id,
      qrTexto: r.qrTexto || '', naMaquininha: !!r.naMaquininha, status: 'pendente', detalhe: '', criadaEm: Date.now(),
      expiraEm: r.expiraEm ? new Date(r.expiraEm).getTime() : Date.now() + validade,
      ultimaConsulta: 0, usada: false
    };
    this.transacoes.set(t.id, t);
    return this._publica(t);
  }

  async status(id) {
    const t = this.transacoes.get(id);
    if (!t) throw new Error('Pagamento não encontrado.');
    const p = this.provedor(t.provedor);
    if (FINAIS.includes(t.status) || Date.now() - t.ultimaConsulta < (p.intervaloConsulta || INTERVALO_CONSULTA)) return this._publica(t);
    t.ultimaConsulta = Date.now();
    try {
      const r = await p.consultar(t.externoId, this.credenciais(p.id));
      if (r && ['pendente', 'aprovado', 'recusado', 'cancelado', 'expirado'].includes(r.status)) {
        t.status = r.status;
        t.detalhe = r.detalhe || '';
        Object.assign(t, { nsu: r.nsu || '', autorizacao: r.autorizacao || '', bandeira: r.bandeira || '' });
      }
      t.falhasSeguidas = 0;
    } catch (e) {
      // queda rápida de internet não derruba o pagamento: só desiste depois de várias falhas seguidas
      t.falhasSeguidas = (t.falhasSeguidas || 0) + 1;
      if (t.falhasSeguidas >= 10) { t.status = 'erro'; t.detalhe = 'Sem resposta do sistema de pagamento.'; }
    }
    if (t.status === 'pendente' && Date.now() > t.expiraEm) {
      await p.cancelar(t.externoId, this.credenciais(p.id)).catch(() => {});
      t.status = 'expirado';
      t.detalhe = 'O tempo para pagar acabou.';
    }
    return this._publica(t);
  }

  async cancelar(id) {
    const t = this.transacoes.get(id);
    if (!t || FINAIS.includes(t.status)) return;
    const p = this.provedor(t.provedor);
    // o cliente pode ter pago no último segundo (ex.: na maquininha) e saído da tela: confere antes de cancelar
    const r = await p.consultar(t.externoId, this.credenciais(p.id)).catch(() => null);
    if (r?.status === 'aprovado') {
      Object.assign(t, { status: 'aprovado', nsu: r.nsu || '', autorizacao: r.autorizacao || '', bandeira: r.bandeira || '' });
      console.error(`Pagamento ${t.referencia} (${t.forma}, R$ ${(t.valorCentavos / 100).toFixed(2)}) foi APROVADO depois que o cliente saiu da tela: confira e estorne pela maquininha/portal se a venda não foi feita.`);
      return;
    }
    await p.cancelar(t.externoId, this.credenciais(p.id)).catch(() => {});
    t.status = 'cancelado';
  }

  // usado na hora de gravar a venda: só aceita se aprovado, mesma forma, mesmo valor e uma vez só
  consumirAprovada(id, forma, valorCentavos) {
    const t = this.transacoes.get(id);
    if (!t) throw new Error('Pagamento não encontrado.');
    if (t.status !== 'aprovado') throw new Error('O pagamento ainda não foi aprovado.');
    if (t.forma !== forma) throw new Error('A forma de pagamento não confere.');
    if (t.valorCentavos !== valorCentavos) throw new Error('O valor pago não confere com o pedido. Chame um atendente.');
    if (t.usada) throw new Error('Este pagamento já foi usado em outra venda.');
    t.usada = true;
    const p = this.provedor(t.provedor);
    return { provedor: t.provedor, provedorNome: p?.nome || t.provedor, referencia: t.referencia, transacao: t.externoId,
      nsu: t.nsu || '', autorizacao: t.autorizacao || '', bandeira: t.bandeira || '' };
  }
}

module.exports = { Pagamentos };
