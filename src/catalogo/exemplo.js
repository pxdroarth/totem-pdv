// Produtos fictícios de suplementos: só para demonstração e testes (PDV_CATALOGO=exemplo).
// [nome, código, preçoCentavos, categoria, controlarEstoque?, variações?]
const PRODUTOS = [
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

module.exports = { PRODUTOS };
