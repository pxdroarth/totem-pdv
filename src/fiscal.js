// Ponto de integração com o equipamento/software de nota fiscal.
// Cada modelo (MFE, SAT, NFC-e via emissor, ACBrMonitor...) tem um jeito próprio,
// então este módulo é o único lugar que precisa mudar quando definirmos o equipamento.
//
// Modos:
//  - 'desativado': não faz nada (a nota é emitida manualmente no equipamento ao lado)
//  - 'pasta': grava cada venda paga como JSON numa pasta, para o emissor/integrador ler
const fs = require('fs');
const path = require('path');

async function emitir(venda, config) {
  const f = config.fiscal || {};
  if (f.modo === 'pasta') {
    if (!f.pastaIntegracao) throw new Error('Pasta de integração fiscal não configurada.');
    fs.mkdirSync(f.pastaIntegracao, { recursive: true });
    const arquivo = path.join(f.pastaIntegracao, `venda-${String(venda.numero).padStart(6, '0')}.json`);
    const dados = {
      numero: venda.numero,
      data: venda.data,
      formaPagamento: venda.formaPagamento,
      totalReais: (venda.totalCentavos / 100).toFixed(2),
      itens: venda.itens.map(i => ({
        codigo: i.codigoBarras, descricao: i.opcoes ? `${i.nome} (${i.opcoes})` : i.nome, quantidade: i.qtd,
        valorUnitario: (i.precoCentavos / 100).toFixed(2),
        valorTotal: (i.totalCentavos / 100).toFixed(2)
      }))
    };
    fs.writeFileSync(arquivo, JSON.stringify(dados, null, 2));
    return { modo: 'pasta', arquivo };
  }
  return { modo: 'desativado' };
}

module.exports = { emitir };
