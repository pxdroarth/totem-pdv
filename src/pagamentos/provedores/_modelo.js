// =====================================================================
//  MODELO DE GATEWAY DE PAGAMENTO
//  Para integrar um gateway novo (Mercado Pago, Stone, PagBank, Cielo...):
//   1. Copie este arquivo para provedores/<nome>.js (sem o "_" na frente)
//   2. Preencha id, nome, campos e as 5 funções abaixo
//   3. Pronto: ele aparece sozinho em Admin › Configurações › Pagamentos
//  O resto do sistema (telas, venda, cupom, fechamento) não muda.
//  Guia completo: docs/INTEGRAR-GATEWAY.md
// =====================================================================

module.exports = {
  // identificador sem espaço; é o que fica salvo na configuração
  id: 'modelo',
  // nome que aparece para a loja
  nome: 'Modelo (não use)',
  descricao: 'Exemplo de como escrever um gateway.',
  // quais formas este gateway atende. Pode ser só PIX ou só cartão.
  suporta: { pix: true, cartao: true },

  // campos que a loja preenche no admin. tipo: 'texto' | 'senha' | 'numero' | 'opcoes'
  // os valores chegam nas funções como `cfg` (ex.: cfg.accessToken)
  campos: [
    { chave: 'accessToken', rotulo: 'Access token (produção)', tipo: 'senha', ajuda: 'Pegue no painel do gateway › Credenciais' },
    { chave: 'terminalId', rotulo: 'ID da maquininha', tipo: 'texto' }
    // { chave: 'ambiente', rotulo: 'Ambiente', tipo: 'opcoes', opcoes: [['producao', 'Produção'], ['teste', 'Teste']] }
  ],

  // Verifica se as credenciais funcionam. Chamado pelo botão "Testar conexão".
  // Devolve { ok: true, mensagem } ou lança Error com a explicação.
  async testarConexao(cfg) {
    throw new Error('Não implementado');
  },

  // Cria uma cobrança PIX com o valor exato.
  // pedido = { valorCentavos, referencia, descricao }
  //   referencia: código único desta tentativa (use como chave de idempotência / external_reference)
  // Devolve { id, qrTexto, expiraEm? }
  //   id: identificador da cobrança no gateway (usado em consultar/cancelar)
  //   qrTexto: o "copia e cola" (BR Code). O sistema desenha o QR a partir dele.
  //   expiraEm: ISO 8601 (opcional; sem isso o sistema expira em 10 minutos)
  async criarPix(pedido, cfg) {
    throw new Error('Não implementado');
  },

  // Manda o valor para a maquininha (o cliente só passa/aproxima o cartão).
  // pedido = { valorCentavos, referencia, descricao }
  // Devolve { id, expiraEm? }  (sem expiraEm o sistema desiste em 3 minutos)
  async criarCartao(pedido, cfg) {
    throw new Error('Não implementado');
  },

  // Consulta a situação. O sistema chama a cada ~2 segundos enquanto a tela espera
  // (não usamos webhook: o totem fica na loja, sem endereço público na internet).
  // Devolve { status, detalhe?, nsu?, autorizacao?, bandeira? }
  //   status: 'pendente' | 'aprovado' | 'recusado' | 'cancelado' | 'expirado'
  //   detalhe: frase curta para o cliente quando recusado (ex.: "Saldo insuficiente")
  async consultar(id, cfg) {
    throw new Error('Não implementado');
  },

  // Cancela a cobrança que ainda não foi paga (cliente desistiu ou trocou a forma).
  // Não deve dar erro se ela já estiver cancelada/expirada.
  async cancelar(id, cfg) {
    throw new Error('Não implementado');
  }
};
