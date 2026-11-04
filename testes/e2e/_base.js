// Base dos testes de ponta a ponta: abre o sistema de verdade (Electron) numa pasta de dados limpa.
// No Linux sem tela: xvfb-run -a npm run test:e2e
const { _electron } = require('playwright-core');
const path = require('path'), fs = require('fs'), os = require('os');

const PROJ = path.join(__dirname, '..', '..');
const SAIDA = process.env.PDV_TESTE_SAIDA || path.join(os.tmpdir(), 'lisufit-pdv-testes');

function verificador(nome) {
  let falhas = 0;
  const ok = (c, m) => { if (!c) falhas++; console.log(c ? 'OK   ' : 'FALHA', m); };
  const fim = () => { console.log(falhas ? `${nome}: ${falhas} FALHA(S)` : `${nome}: TUDO OK`); if (falhas) process.exitCode = 1; };
  return { ok, fim };
}

// catalogo: 'emporio' (padrão da loja) ou 'exemplo' (suplementos fictícios)
async function abrir(nome, { catalogo = 'emporio', largura = 1366, altura = 768, teclado = false } = {}) {
  const HOME = path.join(SAIDA, nome, 'home');
  const ARQ = path.join(SAIDA, nome, 'arquivos');
  fs.rmSync(path.join(SAIDA, nome), { recursive: true, force: true });
  fs.mkdirSync(HOME, { recursive: true }); fs.mkdirSync(ARQ, { recursive: true });
  const env = { ...process.env, HOME, APPDATA: HOME, PDV_CATALOGO: catalogo === 'exemplo' ? 'exemplo' : '' };
  const app = await _electron.launch({ executablePath: require(path.join(PROJ, 'node_modules', 'electron')), args: ['--no-sandbox', PROJ], cwd: PROJ, env });
  const pg = await app.firstWindow();
  const erros = [];
  pg.on('pageerror', e => erros.push(e.message));
  pg.on('console', m => m.type() === 'error' && erros.push(m.text()));
  await app.evaluate(({ BrowserWindow, dialog }, [w, h]) => {
    const j = BrowserWindow.getAllWindows()[0]; j.setKiosk(false); j.setBounds({ x: 0, y: 0, width: w, height: h });
    global.__abrir = ''; global.__salvar = '';
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [].concat(global.__abrir) });
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: global.__salvar });
  }, [largura, altura]);
  await pg.waitForTimeout(1500);
  // os testes usam mouse e teclado do robô; o teclado da tela é testado à parte (testes/e2e/teclado.js)
  if (!teclado) await pg.evaluate(() => { Teclado.desligado = true; });
  const dadosDir = await app.evaluate(({ app }) => app.getPath('userData'));
  const set = (k, v) => app.evaluate((_e, [k, v]) => { global[k] = v; }, [k, v]);
  const shot = n => pg.screenshot({ path: path.join(SAIDA, `${nome}-${n}.png`) });
  const pin = async p => { await pg.waitForSelector('#modal-pin.aberto'); await pg.keyboard.type(p); await pg.keyboard.press('Enter'); await pg.waitForTimeout(600); };
  const entrar = async p => { pg.evaluate(() => { abrirAdmin(); }); await pin(p); };
  return { app, pg, erros, set, shot, pin, entrar, ARQ, dadosDir };
}

module.exports = { abrir, verificador, PROJ, SAIDA };
