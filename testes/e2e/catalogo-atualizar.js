// Fluxo real do "Atualizar": a loja tem uma base sem o produto novo; ao abrir a versão nova, o app sincroniza
// sozinho, o admin vê o aviso e a tela de Configurações mostra o resumo e o botão "Atualizar produtos".
const fs = require('fs'), path = require('path');
const { abrir, verificador } = require('./_base');
const { ok, fim } = verificador('catalogo-atualizar');

(async () => {
  // 1ª abertura: cria a base; depois simulamos uma base "de antes" sem 2 produtos e sem o registro do catálogo
  let s = await abrir('catalogo-atualizar');
  const dir = s.dadosDir;
  await s.app.close();
  const arq = path.join(dir, 'dados.json');
  const d = JSON.parse(fs.readFileSync(arq, 'utf8'));
  d.produtos = d.produtos.filter(p => !['Feijoada', 'Ginseng em Pó Vila Natural 100g'].includes(p.nome));
  delete d.catalogo;
  fs.writeFileSync(arq, JSON.stringify(d));
  // 2ª abertura (= depois do "Atualizar", que reinicia o app)
  const { _electron } = require('playwright-core');
  const PROJ = path.join(__dirname, '..', '..');
  const app = await _electron.launch({ executablePath: require(path.join(PROJ, 'node_modules', 'electron')), args: ['--no-sandbox', PROJ], cwd: PROJ,
    env: { ...process.env, HOME: path.dirname(path.dirname(dir)), APPDATA: path.dirname(path.dirname(dir)), PDV_CATALOGO: '' } });
  const pg = await app.firstWindow(); const erros = [];
  ok(await app.evaluate(({ app }) => app.getPath('userData')) === dir, 'abriu a mesma pasta de dados');
  pg.on('pageerror', e => erros.push(e.message));
  await app.evaluate(({ BrowserWindow }) => { const j = BrowserWindow.getAllWindows()[0]; j.setKiosk(false); j.setBounds({ x: 0, y: 0, width: 1366, height: 768 }); });
  await pg.waitForTimeout(1500);
  const nomes = (await pg.evaluate(() => pdv.produtos())).map(p => p.nome);
  ok(nomes.includes('Feijoada') && nomes.includes('Ginseng em Pó Vila Natural 100g') && nomes.length === 75, 'ao abrir a versão nova, os produtos que faltavam entram sozinhos');
  pg.evaluate(() => { abrirAdmin(); }); await pg.waitForSelector('#modal-pin.aberto'); await pg.keyboard.type('1234'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(900);
  ok((await pg.textContent('#toast')).includes('2 novo(s)'), 'admin vê o aviso: ' + (await pg.textContent('#toast')));
  await pg.evaluate(() => trocarAba('config')); await pg.waitForTimeout(800);
  ok(/2 novo\(s\).*Catálogo em dia/.test(await pg.textContent('#info-catalogo')) && await pg.isVisible('#btn-atualizar-produtos'), 'Configurações mostra o resumo e o botão Atualizar produtos');
  pg.once('dialog', x => x.accept());
  await pg.click('#btn-atualizar-produtos'); await pg.waitForTimeout(900);
  ok((await pg.textContent('#toast')).startsWith('0 produto(s) novo(s)'), 'botão Atualizar produtos: nada novo, nada duplicado');
  ok(!erros.length, 'sem erros na tela' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await app.close();
  fim();
})().catch(e => { console.error(e); process.exit(1); });
