// Suplementos da Lisufit com preço DEFINITIVO (passado pela loja em 03/11/2026, das etiquetas da prateleira).
// Entram cadastrados, com foto, na primeira vez que o sistema abre. Os demais suplementos entram pela planilha.
// [nome, categoria, preçoCentavos, foto (em src/catalogo/fotos), sabores?]
const PRODUTOS = [
  ['Força do Vaqueiro Pré-Treino Limão 300g', 'Pré-Treino', 12000, 'forca-do-vaqueiro-pre-treino'],
  ['Megalodon Pré-Treino Abacaxi 300g', 'Pré-Treino', 8990, 'megalodon-pre-treino'],
  ['Creatina Monohidratada Probiótica 300g', 'Creatina', 4990, 'creatina-probiotica-300g'],
  ['Vitamina Amazônica XTR Açaí e Guaraná 600g', 'Vitaminas', 11990, 'vitamina-amazonica-xtr'],
  ['100% Whey Profit 900g', 'Proteínas', 11990, 'whey-profit-900g', ['Baunilha', 'Chocolate', 'Morango']]
];
module.exports = { PRODUTOS };
