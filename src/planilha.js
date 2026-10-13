// Planilhas Excel (.xlsx) e CSV: importar/exportar produtos e exportar vendas.
// A planilha de produtos tem o mesmo formato na ida e na volta:
// exporta -> a loja edita no Excel -> importa de novo.
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

const COLUNAS_PRODUTO = [
  { chave: 'nome', titulo: 'Nome', largura: 40 },
  { chave: 'codigoBarras', titulo: 'Código de barras', largura: 20, texto: true },
  { chave: 'preco', titulo: 'Preço', largura: 12, dinheiro: true },
  { chave: 'categoria', titulo: 'Categoria', largura: 20 },
  { chave: 'secao', titulo: 'Seção', largura: 16 },
  { chave: 'estoque', titulo: 'Estoque', largura: 10 },
  { chave: 'estoqueMinimo', titulo: 'Estoque mínimo', largura: 15 },
  { chave: 'feitoNaHora', titulo: 'Feito na hora', largura: 14 },
  { chave: 'ativo', titulo: 'Visível no totem', largura: 16 }
];

// nomes de coluna aceitos (sem acento, minúsculo) -> chave
const APELIDOS = {
  nome: 'nome', produto: 'nome', descricao: 'nome',
  'codigo de barras': 'codigoBarras', codigo: 'codigoBarras', ean: 'codigoBarras', 'cod barras': 'codigoBarras', gtin: 'codigoBarras',
  preco: 'preco', 'preco de venda': 'preco', valor: 'preco', 'preco venda': 'preco',
  categoria: 'categoria', secao: 'secao',
  estoque: 'estoque', quantidade: 'estoque', qtd: 'estoque', 'qtd estoque': 'estoque',
  'estoque minimo': 'estoqueMinimo', minimo: 'estoqueMinimo',
  'feito na hora': 'feitoNaHora',
  'visivel no totem': 'ativo', visivel: 'ativo', ativo: 'ativo'
};

const semAcento = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const chaveColuna = t => APELIDOS[semAcento(t).toLowerCase().replace(/[_\-.]/g, ' ').replace(/\s+/g, ' ').trim()];

// "R$ 1.299,90" | "129,9" | "129.90" | 129.9 -> centavos
function lerPreco(v) {
  if (typeof v === 'number') return Math.round(v * 100);
  let t = String(v ?? '').replace(/r\$|\s/gi, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

function lerInteiro(v) {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n) : NaN;
}

function lerSimNao(v) {
  if (v === '' || v == null) return null;
  if (typeof v === 'boolean') return v;
  const t = semAcento(v).toLowerCase().trim();
  if (['sim', 's', 'x', '1', 'true', 'yes', 'verdadeiro'].includes(t)) return true;
  if (['nao', 'n', '0', 'false', 'no', 'falso', '-'].includes(t)) return false;
  return undefined;
}

// valor de célula do exceljs -> texto/número simples
function valorCelula(c) {
  const v = c.value;
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v instanceof Date) return v.toISOString();
    if ('result' in v) return v.result ?? '';
    if (Array.isArray(v.richText)) return v.richText.map(r => r.text).join('');
    if ('text' in v) return v.text;
    return '';
  }
  return v;
}

function lerCsv(texto) {
  texto = texto.replace(/^﻿/, '');
  const primeira = texto.split(/\r?\n/, 1)[0];
  const sep = [';', '\t', ','].sort((a, b) => primeira.split(b).length - primeira.split(a).length)[0];
  const linhas = []; let campo = '', linha = [], aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (aspas) {
      if (ch === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (ch === '"') aspas = false;
      else campo += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === sep) { linha.push(campo); campo = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && texto[i + 1] === '\n') i++;
      linha.push(campo); linhas.push(linha); linha = []; campo = '';
    } else campo += ch;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  // ="7890..." é o truque do Excel para manter texto
  return linhas.map(l => l.map(c => c.replace(/^="(.*)"$/, '$1').replace(/^=(?=\d+$)/, '')));
}

async function lerArquivo(arquivo) {
  const ext = path.extname(arquivo).toLowerCase();
  if (ext === '.csv' || ext === '.txt') return lerCsv(fs.readFileSync(arquivo, 'utf8'));
  if (ext !== '.xlsx') throw new Error('Use uma planilha .xlsx (Excel) ou .csv.');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(arquivo);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('A planilha está vazia.');
  const linhas = [];
  ws.eachRow({ includeEmpty: true }, (row, n) => {
    const l = [];
    for (let i = 1; i <= ws.columnCount; i++) l.push(valorCelula(row.getCell(i)));
    linhas[n - 1] = l;
  });
  return Array.from(linhas, l => l || []);
}

// devolve [{ linha, dados: {nome, codigoBarras, precoCentavos, ...} | null, erro }]
async function lerPlanilhaProdutos(arquivo) {
  const linhas = await lerArquivo(arquivo);
  const iCab = linhas.findIndex(l => l.some(c => chaveColuna(c) === 'nome'));
  if (iCab < 0) throw new Error('Não achei a coluna "Nome". Use a planilha exportada pelo sistema como modelo.');
  const mapa = linhas[iCab].map(chaveColuna);
  const resultado = [];
  for (let i = iCab + 1; i < linhas.length; i++) {
    const cel = {};
    mapa.forEach((k, j) => { if (k && cel[k] === undefined) cel[k] = linhas[i][j]; });
    const vazia = Object.values(cel).every(v => v === '' || v == null);
    if (vazia) continue;
    const n = i + 1; // número da linha como aparece no Excel
    const erro = msg => resultado.push({ linha: n, dados: null, erro: msg });
    const d = {};
    if ('nome' in cel) d.nome = String(cel.nome ?? '').trim();
    if ('codigoBarras' in cel) {
      const cod = String(cel.codigoBarras ?? '').trim();
      if (/e\+?\d+$/i.test(cod) || /^\d+[.,]\d+e/i.test(cod)) { erro(`Código de barras "${cod}" virou número científico no Excel. Formate a coluna como Texto e digite de novo.`); continue; }
      d.codigoBarras = cod.replace(/\.0+$/, '');
    }
    if ('preco' in cel && cel.preco !== '') {
      const p = lerPreco(cel.preco);
      if (Number.isNaN(p) || p <= 0) { erro(`Preço inválido: "${cel.preco}".`); continue; }
      d.precoCentavos = p;
    }
    for (const k of ['estoque', 'estoqueMinimo']) {
      if (k in cel && cel[k] !== '') {
        const v = lerInteiro(cel[k]);
        if (Number.isNaN(v)) { erro(`${k === 'estoque' ? 'Estoque' : 'Estoque mínimo'} inválido: "${cel[k]}".`); d._erro = true; break; }
        d[k] = v;
      }
    }
    if (d._erro) continue;
    if ('categoria' in cel && String(cel.categoria).trim()) d.categoria = String(cel.categoria).trim();
    if ('secao' in cel && String(cel.secao).trim()) d.secao = String(cel.secao).trim();
    for (const k of ['feitoNaHora', 'ativo']) {
      if (k in cel) {
        const v = lerSimNao(cel[k]);
        if (v === undefined) { erro(`Use "Sim" ou "Não" na coluna ${k === 'ativo' ? 'Visível no totem' : 'Feito na hora'} (veio "${cel[k]}").`); d._erro = true; break; }
        if (v !== null) d[k] = v;
      }
    }
    if (d._erro) continue;
    resultado.push({ linha: n, dados: d, erro: null });
  }
  return resultado;
}

// ---------- exportação ----------
const FORMATO_REAIS = '"R$" #,##0.00';

function estilizarCabecalho(ws) {
  const cab = ws.getRow(1);
  cab.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF5F15' } };
  cab.alignment = { vertical: 'middle' };
  cab.height = 22;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

async function exportarProdutos(arquivo, produtos, categorias) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Lisufit PDV';
  const ws = wb.addWorksheet('Produtos');
  ws.columns = COLUNAS_PRODUTO.map(c => ({ header: c.titulo, key: c.chave, width: c.largura,
    style: c.texto ? { numFmt: '@' } : c.dinheiro ? { numFmt: FORMATO_REAIS } : {} }));
  const secao = nome => (categorias.find(c => c.nome === nome) || {}).secao || '';
  [...produtos].sort((a, b) => a.categoria.localeCompare(b.categoria) || a.nome.localeCompare(b.nome)).forEach(p => {
    ws.addRow({
      nome: p.nome, codigoBarras: p.codigoBarras || '', preco: p.precoCentavos / 100,
      categoria: p.categoria, secao: secao(p.categoria),
      estoque: p.controlarEstoque === false ? '' : p.estoque,
      estoqueMinimo: p.controlarEstoque === false ? '' : (p.estoqueMinimo ?? 3),
      feitoNaHora: p.controlarEstoque === false ? 'Sim' : 'Não',
      ativo: p.ativo === false ? 'Não' : 'Sim'
    });
  });
  // linhas extras já formatadas como texto para novos códigos de barras
  for (let i = 0; i < 300; i++) ws.getCell(ws.rowCount + 1, 2).numFmt = '@';
  estilizarCabecalho(ws);
  const ajuda = wb.addWorksheet('Como preencher');
  ajuda.columns = [{ width: 22 }, { width: 90 }];
  [
    ['Coluna', 'Como preencher'],
    ['Nome', 'Obrigatório. Se o produto não tiver código de barras, o nome é usado para achar o produto ao importar.'],
    ['Código de barras', 'O número embaixo do código no rótulo. A coluna já está como Texto para o Excel não estragar o número.'],
    ['Preço', 'Preço de venda. Ex.: 129,90'],
    ['Categoria', 'Ex.: Proteínas, Sorvetes. Categoria nova é criada sozinha.'],
    ['Seção', 'Usada só quando a categoria é nova: Suplementos ou Empório.'],
    ['Estoque', 'Quantidade que tem na loja agora.'],
    ['Estoque mínimo', 'Abaixo disso o produto aparece em "Estoque baixo" no painel.'],
    ['Feito na hora', 'Sim para shakes, smoothies e itens preparados na hora (não controla estoque).'],
    ['Visível no totem', 'Não para esconder o produto do cliente sem apagar.'],
    ['', ''],
    ['Importante', 'Fotos e variações (sabores, frutas) não vão na planilha: continuam como estão no sistema.']
  ].forEach(l => ajuda.addRow(l));
  estilizarCabecalho(ajuda);
  ajuda.getColumn(2).alignment = { wrapText: true };
  await wb.xlsx.writeFile(arquivo);
  return arquivo;
}

const formas = { pix: 'PIX', cartao: 'Cartão', caixa: 'Caixa' };
const statusNome = { paga: 'Paga', aguardando_caixa: 'Aguardando caixa', cancelada: 'Cancelada' };

async function exportarVendas(arquivo, vendas) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Lisufit PDV';
  const dataHora = v => { const d = new Date(v.data); return [d.toLocaleDateString('pt-BR'), d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })]; };

  const wv = wb.addWorksheet('Vendas');
  wv.columns = [
    { header: 'Nº', key: 'numero', width: 8 }, { header: 'Data', key: 'data', width: 12 },
    { header: 'Hora', key: 'hora', width: 8 }, { header: 'Situação', key: 'status', width: 18 },
    { header: 'Pagamento', key: 'forma', width: 12 }, { header: 'Itens', key: 'itens', width: 8 },
    { header: 'Total', key: 'total', width: 14, style: { numFmt: FORMATO_REAIS } }
  ];
  vendas.forEach(v => {
    const [data, hora] = dataHora(v);
    wv.addRow({ numero: v.numero, data, hora, status: statusNome[v.status] || v.status, forma: formas[v.formaPagamento] || '',
      itens: v.itens.reduce((s, i) => s + i.qtd, 0), total: v.totalCentavos / 100 });
  });
  const pagas = vendas.filter(v => v.status === 'paga');
  wv.addRow({});
  const tot = wv.addRow({ status: 'Total pago', total: pagas.reduce((s, v) => s + v.totalCentavos, 0) / 100 });
  tot.font = { bold: true };
  estilizarCabecalho(wv);

  const wi = wb.addWorksheet('Itens vendidos');
  wi.columns = [
    { header: 'Nº venda', key: 'numero', width: 9 }, { header: 'Data', key: 'data', width: 12 },
    { header: 'Situação', key: 'status', width: 18 }, { header: 'Produto', key: 'produto', width: 36 },
    { header: 'Opções escolhidas', key: 'opcoes', width: 40 }, { header: 'Código de barras', key: 'codigo', width: 18, style: { numFmt: '@' } },
    { header: 'Qtd', key: 'qtd', width: 6 },
    { header: 'Preço unit.', key: 'unit', width: 13, style: { numFmt: FORMATO_REAIS } },
    { header: 'Total', key: 'total', width: 13, style: { numFmt: FORMATO_REAIS } },
    { header: 'Pagamento', key: 'forma', width: 12 }
  ];
  vendas.forEach(v => {
    const [data] = dataHora(v);
    v.itens.forEach(i => wi.addRow({ numero: v.numero, data, status: statusNome[v.status] || v.status, produto: i.nome,
      opcoes: i.opcoes || '', codigo: i.codigoBarras || '', qtd: i.qtd, unit: i.precoCentavos / 100,
      total: i.totalCentavos / 100, forma: formas[v.formaPagamento] || '' }));
  });
  estilizarCabecalho(wi);
  await wb.xlsx.writeFile(arquivo);
  return arquivo;
}

module.exports = { lerPlanilhaProdutos, exportarProdutos, exportarVendas, lerPreco };
