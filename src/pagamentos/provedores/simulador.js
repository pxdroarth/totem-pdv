// Simulador de gateway: não cobra nada. Serve para testar o fluxo automático
// e para demonstrar o totem antes de a loja escolher o gateway de verdade.
const cobrancas = new Map();
let seq = 0;

module.exports = {
  id: 'simulador',
  nome: 'Simulador (teste, não cobra)',
  descricao: 'Aprova ou recusa sozinho depois de alguns segundos. Use só para testar e demonstrar.',
  suporta: { pix: true, cartao: true },
  campos: [
    { chave: 'segundos', rotulo: 'Aprovar depois de (segundos)', tipo: 'numero', padrao: '6' },
    { chave: 'resultado', rotulo: 'Resultado', tipo: 'opcoes', padrao: 'aprovar',
      opcoes: [['aprovar', 'Aprovar'], ['recusar', 'Recusar'], ['nunca', 'Nunca responder (testa o tempo esgotado)'], ['fora', 'Fora do ar (testa o modo manual)']] }
  ],

  async testarConexao(cfg) {
    if (cfg.resultado === 'fora') throw new Error('Gateway fora do ar (simulação).');
    return { ok: true, mensagem: 'Simulador pronto. Nenhum valor é cobrado.' };
  },

  async criarPix(pedido, cfg) {
    if (cfg.resultado === 'fora') throw new Error('Gateway fora do ar (simulação).');
    const id = 'SIM-PIX-' + (++seq);
    cobrancas.set(id, { criada: Date.now(), cancelada: false });
    return { id, qrTexto: `SIMULADOR-PIX|${pedido.referencia}|${(pedido.valorCentavos / 100).toFixed(2)}` };
  },

  async criarCartao(pedido, cfg) {
    if (cfg.resultado === 'fora') throw new Error('Gateway fora do ar (simulação).');
    const id = 'SIM-CARTAO-' + (++seq);
    cobrancas.set(id, { criada: Date.now(), cancelada: false });
    return { id };
  },

  async consultar(id, cfg) {
    const c = cobrancas.get(id);
    if (!c) return { status: 'cancelado' };
    if (c.cancelada) return { status: 'cancelado' };
    const segundos = Math.max(0, Number(cfg.segundos ?? 6));
    if (cfg.resultado === 'nunca' || Date.now() - c.criada < segundos * 1000) return { status: 'pendente' };
    if (cfg.resultado === 'recusar') return { status: 'recusado', detalhe: 'saldo insuficiente (simulação)' };
    return { status: 'aprovado', nsu: String(100000 + seq), autorizacao: 'SIM' + seq, bandeira: id.includes('CARTAO') ? 'Visa' : '' };
  },

  async cancelar(id) {
    const c = cobrancas.get(id);
    if (c) c.cancelada = true;
  }
};
