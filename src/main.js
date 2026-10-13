const { app, BrowserWindow, ipcMain, dialog, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const { Banco } = require('./db');
const { gerarPix } = require('./pix');
const fiscal = require('./fiscal');

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
  const caixa = venda.status === 'aguardando_caixa'
    ? `<div class="grande">PEDIDO Nº ${venda.numero}</div><p class="c">Apresente este ticket no caixa para pagar.</p>` : '';
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

async function imprimirCupom(venda) {
  const cfg = banco.getConfig();
  if (!cfg.imprimirCupom) return 'impressão desativada';
  const w = new BrowserWindow({ show: false, webPreferences: { javascript: false } });
  await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlCupom(venda, cfg)));
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
  return { venda, avisos };
});

tratar('venda:atualizar', async (numero, mudancas) => {
  const v = banco.atualizarVenda(numero, mudancas);
  if (mudancas.status === 'paga') {
    try { v.fiscal = await fiscal.emitir(v, banco.getConfig()); banco.atualizarVenda(v.numero, { fiscal: v.fiscal }); }
    catch (e) { return { venda: v, avisos: ['Fiscal: ' + e.message] }; }
  }
  return { venda: v, avisos: [] };
});

tratar('vendas:listar', filtro => banco.listarVendas(filtro));
tratar('vendas:reimprimir', numero => {
  const v = banco.listarVendas().find(x => x.numero === numero);
  if (!v) throw new Error('Venda não encontrada.');
  return imprimirCupom(v);
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
