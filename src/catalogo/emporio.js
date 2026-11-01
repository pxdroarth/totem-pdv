// Catálogo inicial do Empório Lisufit: entra cadastrado (com foto) na primeira vez que o sistema abre.
// Os preços são DE EXEMPLO (precoExemplo: true) até a loja mandar os definitivos; o admin mostra
// quais ainda estão com preço de exemplo e o selo some quando o preço é alterado.
// [nome, categoria, preçoCentavos, feitoNaHora, foto (em src/catalogo/fotos), sabores?]
const SHAKE = [
  ['Morango', 'Suco de maçã integral, iogurte zero lactose, proteína baunilha, morango e banana'],
  ['Chocolate', 'Suco de maçã integral, iogurte zero lactose, proteína sabor chocolate, morango e banana'],
  ['Cookies', 'Suco de maçã integral, iogurte zero lactose, proteína sabor cookies, morango e banana'],
  ['Maracujá e Manga', 'Água de coco, iogurte zero lactose, proteína baunilha, manga e maracujá'],
  ['Supercoffee', 'Leite em pó, SuperCoffee vanilla ou doce de leite, whey protein e pasta de amendoim'],
  ['Pink Lemonade', 'Suco de maçã integral, iogurte zero lactose, morango, limão e colágeno neutro']
];

const PRODUTOS = [
  ['Empada de Frango', 'Salgados', 700, true, 'empada-de-frango'],
  ['Salsicha Empanada', 'Salgados', 600, true, 'salsicha-empanada'],
  ['Folhado de Presunto e Queijo', 'Salgados', 800, true, 'folhado-de-presunto-e-queijo'],
  ['Folhado de Carne', 'Salgados', 800, true, 'folhado-de-carne'],
  ['Torta de Frango', 'Salgados', 900, true, 'torta-de-frango'],
  ['Croissant', 'Salgados', 900, true, 'croissant'],
  ['Misto Quente', 'Salgados', 900, true, 'misto-quente'],
  ['Feijoada', 'Refeições', 2500, true, 'feijoada'],
  ['Sopa de Frango', 'Refeições', 1500, true, 'sopa-de-frango'],
  ['Caldo de Mocotó', 'Refeições', 1500, true, 'caldo-de-mocoto'],
  ['Shake Protein Premium', 'Shakes', 2200, true, 'shake-protein-premium', SHAKE],
  ['Milk-shake de Chocolate', 'Shakes', 1500, true, 'milk-shake-de-chocolate'],
  ['Milk-shake de Morango', 'Shakes', 1500, true, 'milk-shake-de-morango'],
  ['Suco Desintox Verde', 'Sucos', 1200, true, 'suco-desintox-verde'],
  ['Suco Desintox Vermelho', 'Sucos', 1200, true, 'suco-desintox-vermelho'],
  ['Suco de Laranja 500ml', 'Sucos', 1000, true, 'suco-de-laranja-500ml'],
  ['Guaraná Natural 300ml', 'Sucos', 800, true, 'guarana-natural-300ml'],
  ['Café Expresso', 'Cafés', 500, true, 'cafe-expresso'],
  ['Cappuccino', 'Cafés', 800, true, 'cappuccino'],
  ['Chocolate Quente', 'Cafés', 900, true, 'chocolate-quente'],
  ['Salada de Fruta com Iogurte 300ml', 'Sobremesas', 1000, true, 'salada-de-fruta-com-iogurte-300ml'],
  ['Salada de Fruta com Iogurte 500ml', 'Sobremesas', 1500, true, 'salada-de-fruta-com-iogurte-500ml'],
  ['Coca-Cola Lata 350ml', 'Bebidas', 600, false, 'coca-cola-lata-350ml'],
  ['Coca-Cola Zero Lata 350ml', 'Bebidas', 600, false, 'coca-cola-zero-lata-350ml'],
  ['Fanta Laranja Lata 350ml', 'Bebidas', 600, false, 'fanta-laranja-lata-350ml'],
  ['Fanta Uva Lata 350ml', 'Bebidas', 600, false, 'fanta-uva-lata-350ml'],
  ['Guaraná Kuat Lata 350ml', 'Bebidas', 600, false, 'guarana-kuat-lata-350ml'],
  ['Água Mineral Naturágua 500ml', 'Bebidas', 400, false, 'agua-mineral-naturagua-500ml']
];

// [nome, seção, ícone] na ordem em que aparecem no totem
const CATEGORIAS = [
  ['Proteínas', 'Suplementos', 'dumbbell'],
  ['Creatina', 'Suplementos', 'flask'],
  ['Pré-Treino', 'Suplementos', 'zap'],
  ['Aminoácidos', 'Suplementos', 'atom'],
  ['Vitaminas', 'Suplementos', 'pill'],
  ['Snacks', 'Suplementos', 'cookie'],
  ['Acessórios', 'Suplementos', 'bag'],
  ['Salgados', 'Empório', 'croissant'],
  ['Refeições', 'Empório', 'utensils'],
  ['Shakes', 'Empório', 'milk'],
  ['Smoothies', 'Empório', 'cupSoda'],
  ['Sucos', 'Empório', 'cupSoda'],
  ['Cafés', 'Empório', 'coffee'],
  ['Sobremesas', 'Empório', 'iceCream'],
  ['Bebidas', 'Empório', 'glassWater'],
  ['Congelados', 'Empório', 'snowflake'],
  ['Carnes', 'Empório', 'beef']
];

module.exports = { PRODUTOS, CATEGORIAS, pastaFotos: require('path').join(__dirname, 'fotos') };
