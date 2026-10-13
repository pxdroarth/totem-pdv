const { app, BrowserWindow, ipcMain, dialog, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const { Banco } = require('./db');
const { gerarPix } = require('./pix');
const fiscal = require('./fiscal');
const planilha = require('./planilha');

const DEV = process.argv.includes('--dev');
let janela;
let banco;

// Só uma instância do PDV aberta por vez
if (!app.requestSingleInstanceLock()) app.quit();

function criarJanela() {
  janela = new BrowserWindow({
    width: 1280,
    height: 800,
    kiosk: !DEV,                 // tela cheia travada no modo totem
    autoHideMenuBar: true,
    backgroundColor: '#0f1115',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  janela.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  if (DEV) janela.webContents.openDevTools({ mode: 'detach' });

  // Impede que o cliente feche/recarregue com atalhos no modo totem
  if (!DEV) {
    janela.webContents.on('before-input-event', (e, input) => {
      const k = input.key.toLowerCase();
      if ((input.control && ['r', 'w', 'q'].includes(k)) || (input.alt && k === 'f4') || k === 'f5') {
        e.preventDefault();
      }
    });
  }
}

app.whenReady().then(() => {
  banco = new Banco(app.getPath('userData'));
  criarJanela();
  // pedidos "pagar no balcão" esquecidos são cancelados conforme a configuração
  const verificarAntigos = () => { try { banco.cancelarAguardandoAntigos(); } catch (e) { console.error(e); } };
  verificarAntigos();
  setInterval(verificarAntigos, 60 * 1000);
  // Atalho escondido para abrir o painel admin (pede PIN)
  globalShortcut.register('CommandOrControl+Shift+A', () => janela.webContents.send('abrir-admin'));
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());

// ---------- helpers ----------
function tratar(canal, fn) {
  ipcMain.handle(canal, async (_e, ...args) => {
    try { return { ok: true, dados: await fn(...args) }; }
    catch (err) { return { ok: false, erro: err.message }; }
  });
}

const reais = c => 'R$ ' + (c / 100).toFixed(2).replace('.', ',');

function htmlCupom(venda, cfg) {
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const formas = { pix: 'PIX', cartao: 'Cartão', caixa: 'Pagar no caixa' };
  const linhas = venda.itens.map(i =>
    `<tr><td colspan="2">${esc(i.nome)}${i.opcoes ? `<br><small>${esc(i.opcoes)}</small>` : ''}</td></tr>
     <tr><td>${i.qtd} x ${reais(i.precoCentavos)}</td><td class="d">${reais(i.totalCentavos)}</td></tr>`).join('');
  const temPreparo = venda.itens.some(i => i.preparo);
  const caixa = venda.status === 'aguardando_caixa'
    ? `<div class="grande">PEDIDO Nº ${venda.numero}</div><p class="c">Apresente este ticket no caixa para pagar.${temPreparo ? '<br>Seu pedido será preparado após o pagamento.' : ''}</p>`
    : temPreparo ? `<div class="grande">SENHA ${venda.numero}</div><p class="c">Aguarde ser chamado(a) para retirar.</p>` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { margin: 0; } body { font-family: monospace; font-size: 12px; width: 72mm; margin: 2mm; }
    .c { text-align: center; } .d { text-align: right; } table { width: 100%; border-collapse: collapse; }
    .grande { font-size: 22px; font-weight: bold; text-align: center; margin: 6px 0; }
    hr { border: 0; border-top: 1px dashed #000; }
  </style></head><body>
    <div class="c"><b>${esc(cfg.nomeLoja)}</b><br>${esc(cfg.endereco)}<br>${cfg.cnpj ? 'CNPJ ' + esc(cfg.cnpj) : ''}</div>
    <hr><div class="c">CUPOM NÃO FISCAL</div><hr>
    ${caixa}
    <table>${linhas}</table><hr>
    <table><tr><td><b>TOTAL</b></td><td class="d"><b>${reais(venda.totalCentavos)}</b></td></tr>
    <tr><td>Pagamento</td><td class="d">${formas[venda.formaPagamento] || ''}</td></tr></table><hr>
    <div class="c">Venda ${venda.numero} — ${new Date(venda.data).toLocaleString('pt-BR')}<br>${esc(cfg.mensagemCupom)}</div>
  </body></html>`;
}

// via de quem prepara: só os itens feitos na hora, com as opções em destaque
function htmlPreparo(venda) {
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const itens = venda.itens.filter(i => i.preparo).map(i =>
    `<div class="item"><b>${i.qtd}x ${esc(i.nome)}</b>${i.opcoes ? '<br>' + esc(i.opcoes).split('; ').join('<br>') : ''}</div>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { margin: 0; } body { font-family: monospace; font-size: 14px; width: 72mm; margin: 2mm; }
    .c { text-align: center; } .senha { font-size: 34px; font-weight: bold; text-align: center; margin: 4px 0; }
    .item { margin: 8px 0; } hr { border: 0; border-top: 1px dashed #000; }
  </style></head><body>
    <div class="c"><b>PREPARO</b></div><div class="senha">SENHA ${venda.numero}</div>
    <div class="c">${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div><hr>
    ${itens}<hr></body></html>`;
}

async function imprimirPreparo(venda) {
  const cfg = banco.getConfig();
  if (!cfg.imprimirViaPreparo || venda.status !== 'paga' || !venda.itens.some(i => i.preparo)) return 'sem via de preparo';
  return imprimirHtml(htmlPreparo(venda), cfg);
}

async function imprimirCupom(venda) {
  const cfg = banco.getConfig();
  if (!cfg.imprimirCupom) return 'impressão desativada';
  return imprimirHtml(htmlCupom(venda, cfg), cfg);
}

async function imprimirHtml(html, cfg) {
  const w = new BrowserWindow({ show: false, webPreferences: { javascript: false } });
  await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  return new Promise((resolve, reject) => {
    w.webContents.print(
      { silent: true, printBackground: false, deviceName: cfg.impressoraCupom || undefined, margins: { marginType: 'none' } },
      (ok, motivo) => { w.close(); ok ? resolve('impresso') : reject(new Error('Falha ao imprimir: ' + motivo)); }
    );
  });
}

// ---------- IPC ----------
tratar('config:get', () => {
  const { pinAdmin, pinAtendente, ...publica } = banco.getConfig();
  return publica; // a tela do cliente nunca recebe os PINs
});
tratar('config:getAdmin', () => banco.getConfig());
tratar('config:salvar', cfg => banco.salvarConfig(cfg));

tratar('admin:verificarPin', pin => pin === banco.getConfig().pinAdmin);
tratar('atendente:verificarPin', pin => {
  const c = banco.getConfig();
  return pin === c.pinAtendente || pin === c.pinAdmin;
});

tratar('categorias:listar', () => banco.getCategorias());
tratar('categorias:salvar', c => banco.salvarCategoria(c));
tratar('categorias:excluir', id => banco.excluirCategoria(id));
tratar('categorias:mover', (id, direcao) => banco.moverCategoria(id, direcao));
tratar('produtos:listar', () => banco.getProdutos());
tratar('produtos:salvar', p => banco.salvarProduto(p));
tratar('produtos:excluir', id => banco.excluirProduto(id));

tratar('produtos:escolherImagem', async () => {
  const r = await dialog.showOpenDialog(janela, {
    filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'webp'] }], properties: ['openFile']
  });
  if (r.canceled || !r.filePaths[0]) return '';
  const origem = r.filePaths[0];
  const destino = path.join(banco.pastaImagens, Date.now() + path.extname(origem).toLowerCase());
  fs.copyFileSync(origem, destino);
  return destino;
});

tratar('pix:gerar', async (valorCentavos, txid) => {
  const c = banco.getConfig();
  const payload = gerarPix({ chave: c.pixChave, nome: c.pixNome || c.nomeLoja, cidade: c.pixCidade, valorCentavos, txid });
  const qr = await QRCode.toDataURL(payload, { width: 420, margin: 1 });
  return { payload, qr };
});

tratar('venda:registrar', async dadosVenda => {
  const venda = banco.registrarVenda(dadosVenda);
  const avisos = [];
  if (venda.status === 'paga') {
    try { venda.fiscal = await fiscal.emitir(venda, banco.getConfig()); banco.atualizarVenda(venda.numero, { fiscal: venda.fiscal }); }
    catch (e) { avisos.push('Fiscal: ' + e.message); }
  }
  try { await imprimirCupom(venda); } catch (e) { avisos.push(e.message); }
  try { await imprimirPreparo(venda); } catch (e) { avisos.push('Preparo: ' + e.message); }
  return { venda, avisos };
});

tratar('venda:atualizar', async (numero, mudancas) => {
  const v = banco.atualizarVenda(numero, mudancas);
  const avisos = [];
  if (mudancas.status === 'paga') {
    try { await imprimirPreparo(v); } catch (e) { avisos.push('Preparo: ' + e.message); }
    try { v.fiscal = await fiscal.emitir(v, banco.getConfig()); banco.atualizarVenda(v.numero, { fiscal: v.fiscal }); }
    catch (e) { avisos.push('Fiscal: ' + e.message); }
  }
  return { venda: v, avisos };
});

tratar('vendas:listar', filtro => banco.listarVendas(filtro));
tratar('vendas:reimprimir', numero => {
  const v = banco.listarVendas().find(x => x.numero === numero);
  if (!v) throw new Error('Venda não encontrada.');
  return imprimirCupom(v);
});

// ---------- planilhas ----------
const hojeArquivo = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
async function escolherOndeSalvar(nome) {
  const r = await dialog.showSaveDialog(janela, { defaultPath: path.join(app.getPath('documents'), nome),
    filters: [{ name: 'Planilha do Excel', extensions: ['xlsx'] }] });
  return r.canceled ? '' : r.filePath;
}
tratar('produtos:exportar', async () => {
  const arq = await escolherOndeSalvar(`produtos-lisufit-${hojeArquivo()}.xlsx`);
  return arq ? planilha.exportarProdutos(arq, banco.getProdutos(), banco.getCategorias()) : '';
});
let planilhaLida = null; // guarda a leitura entre a prévia e a confirmação
tratar('produtos:lerPlanilha', async () => {
  const r = await dialog.showOpenDialog(janela, { properties: ['openFile'],
    filters: [{ name: 'Planilha', extensions: ['xlsx', 'csv'] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  const linhas = await planilha.lerPlanilhaProdutos(r.filePaths[0]);
  planilhaLida = linhas;
  return { arquivo: path.basename(r.filePaths[0]), ...banco.importarProdutos(linhas, false) };
});
tratar('produtos:importar', () => {
  if (!planilhaLida) throw new Error('Escolha a planilha de novo.');
  const res = banco.importarProdutos(planilhaLida, true);
  planilhaLida = null;
  return res;
});
tratar('vendas:exportar', async filtro => {
  const nome = filtro && filtro.de ? `vendas-lisufit-${filtro.de}${filtro.ate && filtro.ate !== filtro.de ? '-a-' + filtro.ate : ''}.xlsx` : `vendas-lisufit-${hojeArquivo()}.xlsx`;
  const arq = await escolherOndeSalvar(nome);
  return arq ? planilha.exportarVendas(arq, banco.listarVendas(filtro)) : '';
});

tratar('impressoras:listar', async () =>
  (await janela.webContents.getPrintersAsync()).map(p => ({ nome: p.name, padrao: p.isDefault })));

tratar('sistema:escolherPasta', async () => {
  const r = await dialog.showOpenDialog(janela, { properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? '' : r.filePaths[0];
});
tratar('sistema:backup', async () => {
  const r = await dialog.showOpenDialog(janela, { properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled) return '';
  return banco.backup(r.filePaths[0]);
});
tratar('sistema:sair', () => app.quit());
