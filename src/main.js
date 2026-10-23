const { app, BrowserWindow, ipcMain, dialog, globalShortcut, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const QRCode = require('qrcode');
const { Banco } = require('./db');
const { gerarPix } = require('./pix');
const fiscal = require('./fiscal');
const planilha = require('./planilha');
const { Atualizador } = require('./atualizador');
const { Pagamentos } = require('./pagamentos');

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

// ---------- tela de pedidos (preparo) ----------
// Abre no 2º monitor/TV em tela cheia; sem 2º monitor, abre como janela normal.
let janelaPedidos = null;
function abrirTelaPedidos() {
  if (janelaPedidos && !janelaPedidos.isDestroyed()) { janelaPedidos.show(); janelaPedidos.focus(); return 'ja-aberta'; }
  const principal = screen.getPrimaryDisplay();
  const outra = screen.getAllDisplays().find(d => d.id !== principal.id);
  const area = (outra || principal).workArea;
  janelaPedidos = new BrowserWindow({
    x: area.x + 30, y: area.y + 30, width: Math.min(1280, area.width - 60), height: Math.min(800, area.height - 60),
    autoHideMenuBar: true, backgroundColor: '#ffffff', title: 'Pedidos — Lisufit', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false,
      autoplayPolicy: 'no-user-gesture-required' } // aviso sonoro sem precisar tocar na tela antes
  });
  janelaPedidos.once('ready-to-show', () => { if (outra) janelaPedidos.setFullScreen(true); janelaPedidos.show(); });
  janelaPedidos.on('closed', () => { janelaPedidos = null; });
  janelaPedidos.loadFile(path.join(__dirname, '..', 'renderer', 'pedidos.html'));
  return outra ? 'segundo-monitor' : 'mesma-tela';
}

let atualizador, pagamentos;
app.whenReady().then(() => {
  banco = new Banco(app.getPath('userData'));
  pagamentos = new Pagamentos({ getConfig: () => banco.getConfig() });
  atualizador = new Atualizador({
    arquivoEstado: path.join(app.getPath('userData'), 'atualizacao.json'),
    empacotado: app.isPackaged,
    // cópia dos dados antes de trocar de versão (separada dos backups diários)
    fazerBackup: motivo => {
      const pasta = pastaBackup();
      fs.mkdirSync(pasta, { recursive: true });
      const carimbo = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
      fs.copyFileSync(banco.arquivo, path.join(pasta, `${motivo}-${carimbo}.json`));
    }
  });
  criarJanela();
  if (banco.getConfig().abrirTelaPedidos) abrirTelaPedidos();
  // a cada minuto: cancela pedidos esquecidos, fecha o caixa no horário e garante o backup do dia
  const rotina = () => {
    try { banco.cancelarAguardandoAntigos(); } catch (e) { console.error(e); }
    try {
      for (const dia of banco.diasParaFecharSozinho()) {
        const f = banco.fecharDia({ dia, tipo: 'automatico', por: 'Sistema (automático)' });
        imprimirFechamento(f).catch(() => {});
        fazerBackup(true);
      }
    } catch (e) { console.error(e); }
    if (banco.precisaBackupHoje()) fazerBackup();
  };
  rotina();
  setInterval(rotina, 60 * 1000);
  // Atalho escondido para abrir o painel admin (pede PIN)
  globalShortcut.register('CommandOrControl+Shift+A', () => janela.webContents.send('abrir-admin'));
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());

// ---------- backup ----------
const pastaBackup = () => banco.getConfig().pastaBackup || path.join(app.getPath('userData'), 'backups');
function fazerBackup(forcar = false) {
  const cfg = banco.getConfig();
  if (!cfg.backupAutomatico) return '';
  if (!forcar && !banco.precisaBackupHoje()) return '';
  try { return banco.backupAutomatico(pastaBackup()); }
  catch (e) { console.error('Backup falhou:', e.message); return ''; }
}

// ---------- quem está no painel ----------
let sessao = null; // { id, nome, perfil: 'admin' | 'atendente' }
const soAdmin = fn => (...args) => {
  if (!sessao || sessao.perfil !== 'admin') throw new Error('Só o administrador pode fazer isso.');
  return fn(...args);
};
const logado = fn => (...args) => {
  if (!sessao) throw new Error('Entre no painel com seu PIN.');
  return fn(...args);
};

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
  const cli = venda.cliente;
  const linhaCliente = cli ? `<p class="c"><b>${esc(cli.nome || '')}</b>${cli.nome && cli.local ? ' · ' : ''}${cli.local === 'levar' ? 'PARA LEVAR' : cli.local === 'aqui' ? 'COMER AQUI' : ''}</p>` : '';
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
    ${caixa}${linhaCliente}
    <table>${linhas}</table><hr>
    <table><tr><td><b>TOTAL</b></td><td class="d"><b>${reais(venda.totalCentavos)}</b></td></tr>
    <tr><td>Pagamento</td><td class="d">${formas[venda.formaPagamento] || ''}</td></tr>
    ${venda.pagamento?.nsu ? `<tr><td colspan="2"><small>${esc([venda.pagamento.bandeira, 'NSU ' + venda.pagamento.nsu, venda.pagamento.autorizacao ? 'Aut. ' + venda.pagamento.autorizacao : ''].filter(Boolean).join(' · '))}</small></td></tr>` : ''}</table><hr>
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
    .item { margin: 8px 0; } .nome { font-size: 20px; font-weight: bold; } .local { font-size: 16px; font-weight: bold; margin-top: 2px; } hr { border: 0; border-top: 1px dashed #000; }
  </style></head><body>
    <div class="c"><b>PREPARO</b></div><div class="senha">SENHA ${venda.numero}</div>
    ${venda.cliente?.nome ? `<div class="c nome">${esc(venda.cliente.nome)}</div>` : ''}
    ${venda.cliente?.local ? `<div class="c local">${venda.cliente.local === 'levar' ? '*** PARA LEVAR ***' : 'COMER AQUI'}</div>` : ''}
    <div class="c">${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div><hr>
    ${itens}<hr></body></html>`;
}

async function imprimirPreparo(venda) {
  const cfg = banco.getConfig();
  if (!cfg.imprimirViaPreparo || venda.status !== 'paga' || !venda.itens.some(i => i.preparo)) return 'sem via de preparo';
  return imprimirHtml(htmlPreparo(venda), cfg);
}

function htmlFechamento(f, cfg) {
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const linha = (t, v) => `<tr><td>${t}</td><td class="d">${v}</td></tr>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { margin: 0; } body { font-family: monospace; font-size: 12px; width: 72mm; margin: 2mm; }
    .c { text-align: center; } .d { text-align: right; } table { width: 100%; border-collapse: collapse; }
    hr { border: 0; border-top: 1px dashed #000; } .t td { font-weight: bold; font-size: 14px; }
  </style></head><body>
    <div class="c"><b>${esc(cfg.nomeLoja)}</b><br>FECHAMENTO DE CAIXA<br>${f.dia.split('-').reverse().join('/')}</div><hr>
    <table>${linha('PIX', reais(f.pixCentavos))}${linha('Cartão', reais(f.cartaoCentavos))}${linha('Pago no balcão', reais(f.caixaCentavos))}</table><hr>
    <table class="t">${linha('TOTAL', reais(f.totalCentavos))}</table><hr>
    <table>${linha('Vendas pagas', f.vendasPagas)}${linha('Canceladas', f.canceladas)}${linha('Aguardando pagamento', f.aguardando)}
    ${f.primeiraVenda ? linha('Vendas nº', `${f.primeiraVenda} a ${f.ultimaVenda}`) : ''}</table><hr>
    <div>Fechado por: ${esc(f.por)}<br>${new Date(f.em).toLocaleString('pt-BR')}${f.observacao ? '<br>Obs.: ' + esc(f.observacao) : ''}</div>
  </body></html>`;
}

async function imprimirFechamento(f) {
  const cfg = banco.getConfig();
  if (!cfg.imprimirCupom) return 'impressão desativada';
  return imprimirHtml(htmlFechamento(f, cfg), cfg);
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
  const { pinAdmin, pagamentos: pag, ...publica } = banco.getConfig();
  // a tela do cliente nunca recebe PINs nem credenciais de gateway
  const pix = pagamentos.provedorDe('pix'), cartao = pagamentos.provedorDe('cartao');
  publica.pagamentos = { pix: pix.id, cartao: cartao.id, permitirManualSeFalhar: pag?.permitirManualSeFalhar !== false,
    modoTeste: [pix.id, cartao.id].includes('simulador') };
  return publica;
});
tratar('config:getAdmin', soAdmin(() => ({ ...banco.getConfig(), pastaBackupEfetiva: pastaBackup(), ultimoBackup: banco.dados.ultimoBackup || '' })));
tratar('config:salvar', soAdmin(cfg => banco.salvarConfig(cfg)));

// entrar no painel: o PIN diz quem é (admin vê tudo; atendente só Vendas e fechamento)
tratar('painel:entrar', pin => {
  const quem = banco.identificarPin(pin);
  if (!quem) throw new Error('PIN incorreto');
  sessao = quem;
  return quem;
});
tratar('painel:sair', () => { sessao = null; });
tratar('atendente:verificarPin', pin => !!banco.identificarPin(pin));

tratar('atendentes:listar', soAdmin(() => banco.getAtendentes()));
tratar('atendentes:salvar', soAdmin(a => banco.salvarAtendente(a)));
tratar('atendentes:excluir', soAdmin(id => banco.excluirAtendente(id)));

tratar('categorias:listar', () => banco.getCategorias());
tratar('categorias:salvar', soAdmin(c => banco.salvarCategoria(c)));
tratar('categorias:excluir', soAdmin(id => banco.excluirCategoria(id)));
tratar('categorias:mover', soAdmin((id, direcao) => banco.moverCategoria(id, direcao)));
tratar('produtos:listar', () => banco.getProdutos());
tratar('produtos:salvar', soAdmin(p => banco.salvarProduto(p)));
tratar('produtos:excluir', soAdmin(id => banco.excluirProduto(id)));

// ---------- fotos dos produtos ----------
// A tela escolhe os arquivos, lê um por vez, reduz e converte para WebP (no próprio Chromium)
// e devolve a versão leve para gravar. Só dá para ler arquivos que foram escolhidos no diálogo.
const EXTENSOES_FOTO = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif', 'heic', 'heif', 'jfif'];
const fotosLiberadas = new Set();
tratar('imagens:escolher', soAdmin(async varias => {
  const r = await dialog.showOpenDialog(janela, {
    title: varias ? 'Escolha as fotos dos produtos' : 'Escolha a foto do produto',
    filters: [{ name: 'Fotos', extensions: EXTENSOES_FOTO }],
    properties: varias ? ['openFile', 'multiSelections'] : ['openFile']
  });
  if (r.canceled) return [];
  fotosLiberadas.clear();
  return r.filePaths.map(caminho => {
    fotosLiberadas.add(caminho);
    return { caminho, nome: path.basename(caminho), bytes: fs.statSync(caminho).size };
  });
}));
tratar('imagens:ler', soAdmin(caminho => {
  if (!fotosLiberadas.has(caminho)) throw new Error('Escolha a foto de novo.');
  return fs.readFileSync(caminho);
}));
tratar('imagens:salvar', soAdmin(dados => {
  const buf = Buffer.from(dados);
  if (!buf.length || buf.length > 5 * 1024 * 1024) throw new Error('Foto inválida.');
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') throw new Error('A foto precisa estar em WebP.');
  const destino = path.join(banco.pastaImagens, `${Date.now()}-${crypto.randomBytes(3).toString('hex')}.webp`);
  fs.writeFileSync(destino, buf);
  return destino;
}));
tratar('produtos:definirImagem', soAdmin((id, caminho) => banco.definirImagem(id, caminho)));

tratar('pix:gerar', async (valorCentavos, txid) => {
  const c = banco.getConfig();
  const payload = gerarPix({ chave: c.pixChave, nome: c.pixNome || c.nomeLoja, cidade: c.pixCidade, valorCentavos, txid });
  const qr = await QRCode.toDataURL(payload, { width: 420, margin: 1 });
  return { payload, qr };
});

tratar('venda:registrar', async ({ pin, transacaoId, ...dadosVenda }) => {
  // PIX/cartão: ou o gateway aprovou (transacaoId), ou o atendente confirmou com o PIN
  let por = 'Totem', pagamento = null;
  const forma = dadosVenda.formaPagamento;
  if (dadosVenda.status !== 'aguardando_caixa' && ['pix', 'cartao'].includes(forma)) {
    const prov = pagamentos.provedorDe(forma);
    if (transacaoId) {
      pagamento = pagamentos.consumirAprovada(transacaoId, forma, banco.calcularTotal(dadosVenda.itens));
      por = `Automático (${pagamento.provedorNome})`;
    } else if (!prov.manual) {
      if (banco.getConfig().pagamentos?.permitirManualSeFalhar === false)
        throw new Error('Este pagamento precisa ser confirmado pelo sistema de pagamento.');
      if (!pin) throw new Error('Peça a um atendente para confirmar o pagamento.');
      pagamento = { provedor: 'manual', provedorNome: 'Confirmado pelo atendente (gateway indisponível)' };
    }
  }
  if (pin && !transacaoId) {
    const quem = banco.identificarPin(pin);
    if (!quem) throw new Error('PIN incorreto');
    por = quem.nome;
  }
  const venda = banco.registrarVenda({ ...dadosVenda, por, pagamento });
  const avisos = [];
  if (venda.status === 'paga') {
    try { venda.fiscal = await fiscal.emitir(venda, banco.getConfig()); banco.atualizarVenda(venda.numero, { fiscal: venda.fiscal }); }
    catch (e) { avisos.push('Fiscal: ' + e.message); }
  }
  try { await imprimirCupom(venda); } catch (e) { avisos.push(e.message); }
  try { await imprimirPreparo(venda); } catch (e) { avisos.push('Preparo: ' + e.message); }
  return { venda, avisos };
});

tratar('venda:atualizar', logado(async (numero, mudancas) => {
  const atual = banco.listarVendas().find(x => x.numero === numero);
  if (mudancas.status === 'cancelada' && atual?.status === 'paga' && sessao.perfil !== 'admin' && !banco.getConfig().atendentePodeCancelar)
    throw new Error('Só o administrador pode cancelar uma venda já paga.');
  const v = banco.atualizarVenda(numero, { status: mudancas.status }, sessao.nome);
  const avisos = [];
  if (mudancas.status === 'paga') {
    try { await imprimirPreparo(v); } catch (e) { avisos.push('Preparo: ' + e.message); }
    try { v.fiscal = await fiscal.emitir(v, banco.getConfig()); banco.atualizarVenda(v.numero, { fiscal: v.fiscal }); }
    catch (e) { avisos.push('Fiscal: ' + e.message); }
  }
  return { venda: v, avisos };
}));

// ---------- gateway de pagamento ----------
tratar('pagamento:iniciar', async (forma, itens) => {
  const total = banco.calcularTotal(itens);
  const t = await pagamentos.iniciar(forma, total, `${banco.getConfig().nomeLoja || 'Lisufit'} - pedido no totem`);
  return { ...t, qr: t.qrTexto ? await QRCode.toDataURL(t.qrTexto, { width: 420, margin: 1 }) : '' };
});
tratar('pagamento:status', id => pagamentos.status(id));
tratar('pagamento:cancelar', id => pagamentos.cancelar(id));
tratar('pagamentos:provedores', soAdmin(() => pagamentos.listar()));
tratar('pagamentos:testar', soAdmin((id, credenciais) => pagamentos.testar(id, credenciais)));

// ---------- atualização ----------
const reiniciar = () => {
  if (process.env.PDV_SEM_REINICIAR) return; // usado nos testes automáticos
  setTimeout(() => { app.relaunch(); app.exit(0); }, 1500);
};
tratar('atualizacao:verificar', soAdmin(() => atualizador.verificar()));
tratar('atualizacao:aplicar', soAdmin(async () => { const r = await atualizador.atualizar(); reiniciar(); return r; }));
tratar('atualizacao:voltar', soAdmin(async () => { const r = await atualizador.voltar(); reiniciar(); return r; }));

// ---------- tela de pedidos ----------
tratar('preparo:listar', () => banco.listarPreparo());
tratar('preparo:marcar', (numero, status) => { banco.marcarPreparo(numero, status); return true; });
tratar('pedidos:abrir', logado(() => abrirTelaPedidos()));

// ---------- fechamento do dia ----------
// o fechamento manual é sempre do dia de hoje; se já foi fechado, as vendas de agora ficam para amanhã
function diaParaFechar() {
  const hoje = banco.diaOperacional();
  const d = new Date(), p = n => String(n).padStart(2, '0');
  if (hoje !== `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`)
    throw new Error('O caixa de hoje já foi fechado. As vendas de agora entram no fechamento de amanhã.');
  return hoje;
}
tratar('fechamento:resumo', logado(() => banco.resumoDia(diaParaFechar())));
tratar('fechamento:fechar', logado(async observacao => {
  const f = banco.fecharDia({ dia: diaParaFechar(), tipo: 'manual', por: sessao.nome, observacao });
  const avisos = [];
  try { await imprimirFechamento(f); } catch (e) { avisos.push(e.message); }
  const backup = fazerBackup(true);
  return { fechamento: f, backup, avisos };
}));
tratar('fechamentos:listar', logado(() => banco.getFechamentos()));
tratar('fechamento:imprimir', logado(id => {
  const f = banco.getFechamentos().find(x => x.id === id);
  if (!f) throw new Error('Fechamento não encontrado.');
  return imprimirFechamento(f);
}));
tratar('backup:agora', soAdmin(() => {
  const arq = fazerBackup(true);
  if (!arq) throw new Error('Ative o backup automático nas Configurações.');
  return arq;
}));

tratar('vendas:listar', logado(filtro => banco.listarVendas(filtro)));
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
tratar('produtos:exportar', soAdmin(async () => {
  const arq = await escolherOndeSalvar(`produtos-lisufit-${hojeArquivo()}.xlsx`);
  return arq ? planilha.exportarProdutos(arq, banco.getProdutos(), banco.getCategorias()) : '';
}));
let planilhaLida = null; // guarda a leitura entre a prévia e a confirmação
tratar('produtos:lerPlanilha', soAdmin(async () => {
  const r = await dialog.showOpenDialog(janela, { properties: ['openFile'],
    filters: [{ name: 'Planilha', extensions: ['xlsx', 'csv'] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  const linhas = await planilha.lerPlanilhaProdutos(r.filePaths[0]);
  planilhaLida = linhas;
  return { arquivo: path.basename(r.filePaths[0]), ...banco.importarProdutos(linhas, false) };
}));
tratar('produtos:importar', soAdmin(() => {
  if (!planilhaLida) throw new Error('Escolha a planilha de novo.');
  const res = banco.importarProdutos(planilhaLida, true);
  planilhaLida = null;
  return res;
}));
tratar('vendas:exportar', logado(async filtro => {
  const nome = filtro && filtro.de ? `vendas-lisufit-${filtro.de}${filtro.ate && filtro.ate !== filtro.de ? '-a-' + filtro.ate : ''}.xlsx` : `vendas-lisufit-${hojeArquivo()}.xlsx`;
  const arq = await escolherOndeSalvar(nome);
  return arq ? planilha.exportarVendas(arq, banco.listarVendas(filtro)) : '';
}));

tratar('impressoras:listar', async () =>
  (await janela.webContents.getPrintersAsync()).map(p => ({ nome: p.name, padrao: p.isDefault })));

tratar('sistema:escolherPasta', async () => {
  const r = await dialog.showOpenDialog(janela, { properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? '' : r.filePaths[0];
});
tratar('sistema:backup', soAdmin(async () => {
  const r = await dialog.showOpenDialog(janela, { properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled) return '';
  return banco.backup(r.filePaths[0]);
}));
tratar('sistema:sair', soAdmin(() => app.quit()));
