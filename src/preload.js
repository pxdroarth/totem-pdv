const { contextBridge, ipcRenderer } = require('electron');

const chamar = async (canal, ...args) => {
  const r = await ipcRenderer.invoke(canal, ...args);
  if (!r.ok) throw new Error(r.erro);
  return r.dados;
};

contextBridge.exposeInMainWorld('pdv', {
  config: () => chamar('config:get'),
  configAdmin: () => chamar('config:getAdmin'),
  salvarConfig: cfg => chamar('config:salvar', cfg),
  entrarPainel: pin => chamar('painel:entrar', pin),
  sairPainel: () => chamar('painel:sair'),
  atendentes: () => chamar('atendentes:listar'),
  salvarAtendente: a => chamar('atendentes:salvar', a),
  excluirAtendente: id => chamar('atendentes:excluir', id),
  resumoFechamento: () => chamar('fechamento:resumo'),
  fecharCaixa: observacao => chamar('fechamento:fechar', observacao),
  fechamentos: () => chamar('fechamentos:listar'),
  imprimirFechamento: id => chamar('fechamento:imprimir', id),
  backupAgora: () => chamar('backup:agora'),
  verificarPinAtendente: pin => chamar('atendente:verificarPin', pin),
  categorias: () => chamar('categorias:listar'),
  salvarCategoria: c => chamar('categorias:salvar', c),
  excluirCategoria: id => chamar('categorias:excluir', id),
  moverCategoria: (id, direcao) => chamar('categorias:mover', id, direcao),
  produtos: () => chamar('produtos:listar'),
  salvarProduto: p => chamar('produtos:salvar', p),
  excluirProduto: id => chamar('produtos:excluir', id),
  escolherImagem: () => chamar('produtos:escolherImagem'),
  gerarPix: (valorCentavos, txid) => chamar('pix:gerar', valorCentavos, txid),
  registrarVenda: v => chamar('venda:registrar', v),
  atualizarVenda: (numero, mudancas) => chamar('venda:atualizar', numero, mudancas),
  vendas: filtro => chamar('vendas:listar', filtro),
  reimprimir: numero => chamar('vendas:reimprimir', numero),
  exportarProdutos: () => chamar('produtos:exportar'),
  lerPlanilhaProdutos: () => chamar('produtos:lerPlanilha'),
  importarProdutos: () => chamar('produtos:importar'),
  exportarVendas: filtro => chamar('vendas:exportar', filtro),
  impressoras: () => chamar('impressoras:listar'),
  escolherPasta: () => chamar('sistema:escolherPasta'),
  backup: () => chamar('sistema:backup'),
  sair: () => chamar('sistema:sair'),
  aoAbrirAdmin: fn => ipcRenderer.on('abrir-admin', fn)
});
