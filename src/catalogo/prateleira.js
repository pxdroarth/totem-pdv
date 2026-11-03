// Produtos de prateleira da Lisufit (suplementos e mercearia do Empório) com preço DEFINITIVO,
// lido das etiquetas nas fotos que a loja mandou em 03/11/2026. Entram cadastrados, com foto,
// na primeira vez que o sistema abre. A seção (Suplementos / Empório) vem da categoria.
// [nome, categoria, preçoCentavos, foto (em src/catalogo/fotos), sabores?]
const PRODUTOS = [
  // ---- Suplementos ----
  ['Força do Vaqueiro Pré-Treino Limão 300g', 'Pré-Treino', 12000, 'forca-do-vaqueiro-pre-treino'],
  ['Megalodon Pré-Treino Abacaxi 300g', 'Pré-Treino', 8990, 'megalodon-pre-treino'],
  ['Creatina Monohidratada Probiótica 300g', 'Creatina', 4990, 'creatina-probiotica-300g'],
  ['Vitamina Amazônica XTR Açaí e Guaraná 600g', 'Vitaminas', 11990, 'vitamina-amazonica-xtr'],
  ['100% Whey Profit 900g', 'Proteínas', 11990, 'whey-profit-900g', ['Baunilha', 'Chocolate', 'Morango']],
  ['Whey 100% com Creatina Vitamin Horse 1kg', 'Proteínas', 13990, 'whey-vitamin-horse'],
  ['Whey High Protein Absolut Doce de Leite', 'Proteínas', 12990, 'whey-absolut'],
  ['Whey Protein Black Code Pride Morango 900g', 'Proteínas', 12990, 'whey-pride'],
  ['JoyPro Protein Shark Pro 900g', 'Proteínas', 14990, 'joypro', ['Morango com Framboesa', 'Paçoca', 'Cookies de Banana com Canela', 'Brigadeiro']],
  ['Amino 3500 Vitamin Horse 120 cápsulas', 'Aminoácidos', 3990, 'amino-3500'],
  // ---- Empório: doces e pastas ----
  ['Chocolate em Pó 50% Cacau Guimarães 200g', 'Doces e Pastas', 2600, 'chocolate-po'],
  ["Doce de Cupuaçu Francy's 550g", 'Doces e Pastas', 2000, 'doce-cupuacu', ['Tradicional', 'Com Castanha de Caju']],
  ["Geleia Francy's", 'Doces e Pastas', 2000, 'geleias', ['Cajá', 'Pimenta', 'Morango']],
  ['Creme de Amendoim Guimarães 200g', 'Doces e Pastas', 1900, 'creme-amendoim', ['Chocolate Meio Amargo', 'Biscoito Negresco', 'Coco e Chocolate Prestígio', 'Paçokinha']],
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
