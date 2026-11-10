// Produtos de prateleira da Lisufit (suplementos e mercearia do Empório) com preço DEFINITIVO,
// lido das etiquetas nas fotos que a loja mandou (03/11 e 05/11/2026). Entram cadastrados, com foto,
// na primeira vez que o sistema abre. A seção (Suplementos / Empório) vem da categoria.
// [nome, categoria, preçoCentavos, foto (em src/catalogo/fotos), sabores?]
const PRODUTOS = [
  // ---- Empório: sanduíches e congelados ----
  ['Sanduíche Natural', 'Sanduíches Naturais', 700, 'sanduiche-natural'],
  ['Sanduíche de Salpicão Bom Bigmania 130g', 'Sanduíches Naturais', 0, 'sanduiche-salpicao-bigmania-130g'],
  ['Pulled Pork Congelado Fogo36 400g', 'Congelados', 0, 'pulled-pork-fogo36-400g'],
  // ---- Suplementos ----
  ['Força do Vaqueiro Pré-Treino Limão 300g', 'Pré-Treino', 12000, 'forca-do-vaqueiro-pre-treino'],
  ['Megalodon Pré-Treino Abacaxi 300g', 'Pré-Treino', 8990, 'megalodon-pre-treino'],
  ['Creatina Monohidratada Probiótica 300g', 'Creatina', 4990, 'creatina-probiotica-300g'],
  ['Vitamina Amazônica XTR Açaí e Guaraná 600g', 'Vitaminas', 11990, 'vitamina-amazonica-xtr'],
  ['100% Whey Profit 900g', 'Proteínas', 11990, 'whey-profit-900g', ['Baunilha', 'Chocolate', 'Morango']],
  ['Whey 100% com Creatina Vitamin Horse 1kg', 'Proteínas', 13990, 'whey-vitamin-horse'],
  ['Whey High Protein Absolut Doce de Leite', 'Proteínas', 12990, 'whey-absolut'],
  ['Whey Protein Black Code Pride Morango 900g', 'Proteínas', 12990, 'whey-pride'],
  ['JoyPro Protein Shark Pro 900g', 'Proteínas', 15000, 'joypro', ['Morango com Framboesa', 'Paçoca', 'Cookies de Banana com Canela', 'Brigadeiro']],
  ['100% Whey Synthesize First Line Baunilha 907g', 'Proteínas', 15000, 'whey-synthesize'],
  ['Amino 3500 Vitamin Horse 120 cápsulas', 'Aminoácidos', 3990, 'amino-3500'],
  // fotos da loja de 05/11/2026
  ['Creatina 100% Pura Absolut Nutrition 300g', 'Creatina', 4990, 'creatina-absolut-300g'],
  ['Panic Pré-Treino Adaptogen Morango 355ml', 'Pré-Treino', 1590, 'panic-pre-treino-morango'],
  ['Nuclear Rush Pré-Treino Body Action Guaraná Fusion 269ml', 'Pré-Treino', 1000, 'nuclear-rush-guarana'],
  ['Agent Orange Pré-Treino New Millen Tangerina com Morango 269ml', 'Pré-Treino', 1000, 'agent-orange-tangerina-morango'],
  // ---- Empório: doces e pastas ----
  ['Pasta de Amendoim Dr. Peanut Avelã 250g', 'Doces e Pastas', 0, 'pasta-amendoim-dr-peanut-avela-250g'],
  ['Chocolate em Pó 50% Cacau Guimarães 200g', 'Doces e Pastas', 2600, 'chocolate-po'],
  ["Doce de Cupuaçu Francy's 550g", 'Doces e Pastas', 2000, 'doce-cupuacu', ['Tradicional', 'Com Castanha de Caju']],
  ["Geleia Francy's", 'Doces e Pastas', 2000, 'geleias', ['Cajá', 'Pimenta', 'Morango']],
  ['Creme de Amendoim Guimarães 200g', 'Doces e Pastas', 1900, 'creme-amendoim', ['Chocolate Meio Amargo', 'Biscoito Negresco', 'Coco e Chocolate Prestígio', 'Paçokinha']],
  // ---- barras e doces (fotos da loja de 05/11/2026) ----
  ['Barra Rio Protein 33g', 'Snacks', 300, 'rio-protein',
    ['Brigadeiro', 'Fondue de Chocolate', 'Avelã, Castanha e Chocolate', 'Cookies e Cream', 'Morango e Chocolate', 'Banana e Chocolate']],
  ["Bendu Soft Bar Cookies'n Cream 45g", 'Snacks', 1150, 'bendu-soft-bar-cookies'],
  // preço 0 = SEM PREÇO: entram ocultos no totem; aparecem sozinhos quando a loja digitar o preço no painel
  ['Supino Barra de Banana e Morango', 'Snacks', 0, 'supino-banana-morango'],
  ['Energel Outdoors Body Action Morango 30g', 'Pré-Treino', 0, 'energel-outdoors-morango'],
  ['Goiabinha Mais Leve Zero Açúcar 30g', 'Doces e Pastas', 0, 'goiabinha-mais-leve'],
  ['Pé de Moça Guimarães 25g', 'Doces e Pastas', 0, 'pe-de-moca-guimaraes'],
  ['Paçoquita Zero Santa Helena 18g', 'Doces e Pastas', 0, 'pacoquita-zero'],
  ['Halls Extra Forte 27,5g', 'Doces e Pastas', 0, 'halls-extra-forte'],
  ['Mentos Pure Fresh Goma de Mascar', 'Doces e Pastas', 0, 'mentos-pure-fresh'],
  ['Stévia Color Andina 10g', 'Mercearia', 0, 'stevia-color-andina'],
  ['Sport Arnica Tacto Gel de Massagem 200ml', 'Acessórios', 0, 'sport-arnica-tacto'],
  ['Vinagre de Maçã Orgânico São Francisco 500ml', 'Mercearia', 3900, 'vinagre-maca-sao-francisco'],
  // ---- Empório: bebidas (fotos de 05/11/2026) ----
  ['Jungle Endurance Plant Power Tangerina 500ml', 'Bebidas', 990, 'jungle-endurance-tangerina'],
  ['Jungle Low Carb Plant Power Morango e Limão 500ml', 'Bebidas', 990, 'jungle-low-carb-morango-limao'], // etiqueta meio coberta na foto: conferir
  // ---- Empório: mercearia ----
  ['Risotto Dona Antônia 250g', 'Mercearia', 2490, 'risotto', ['Alho Poró', 'Funghi e Shitake', 'Limão Siciliano']],
  ['Café Tradicional Empório Lisufit 250g', 'Mercearia', 2700, 'cafe-lisufit'],
  ['Sal Marinho Integral Leve Croc 250g', 'Mercearia', 1599, 'sal-marinho'],
  // ---- Empório: farinhas e naturais ----
  ['Farinha da Felicidade Sabor da Terra 200g', 'Farinhas e Naturais', 2099, 'farinha-felicidade'],
  ['Farinha de Beterraba Vila Natural 100g', 'Farinhas e Naturais', 1399, 'farinha-beterraba'],
  ['Farinha de Uva Vila Natural 100g', 'Farinhas e Naturais', 1299, 'farinha-uva'],
  ['Açafrão-da-Terra Vila Natural 100g', 'Farinhas e Naturais', 799, 'acafrao'],
  ['Cúrcuma em Pó Vila Alimentos', 'Farinhas e Naturais', 1199, 'curcuma-vila'],
  ['Catuaba em Pó Vila Natural 100g', 'Farinhas e Naturais', 899, 'catuaba'],
  ['Ginseng em Pó Vila Natural 100g', 'Farinhas e Naturais', 899, 'ginseng']
];
module.exports = { PRODUTOS };
