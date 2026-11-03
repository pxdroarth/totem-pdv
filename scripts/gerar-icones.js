// Gera os ícones do app a partir da corredora da logo (1º desenho de renderer/assets/logo.svg):
//   renderer/assets/favicon.svg  (aba/janela, vetor)   renderer/assets/icone.png (256 px)
//   renderer/assets/icone.ico    (Windows: janela, barra de tarefas, atalhos, instalador)
//   node scripts/gerar-icones.js   (usa o Chromium do Playwright para desenhar; o .ico é montado em Python/PIL)
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright-core');
const assets = path.join(__dirname, '..', 'renderer', 'assets');
const corredora = fs.readFileSync(path.join(assets, 'logo.svg'), 'utf8').match(/<path[\s\S]*?\/>/)[0];
// corredora ocupa x 323–1005, y 121–1057 no logo.svg: centraliza num quadrado verde-escuro arredondado
const FUNDO = '#1d4a31', OURO = '#d6b65a';
const icone = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
<rect width="1024" height="1024" rx="224" fill="${FUNDO}"/>
<g transform="translate(512 512) scale(0.93) translate(-664 -589)">${corredora.replace(/fill="[^"]+"/, `fill="${OURO}"`)}</g>
</svg>`;
fs.writeFileSync(path.join(assets, 'favicon.svg'), icone);
(async () => {
  const exe = process.env.PW_CHROMIUM || undefined;
  const b = await chromium.launch(exe ? { executablePath: exe } : {});
  const pg = await b.newPage();
  const tmp = path.join(require('os').tmpdir(), 'lisufit-icones'); fs.mkdirSync(tmp, { recursive: true });
  const tamanhos = [16, 20, 24, 32, 40, 48, 64, 128, 256];
  for (const t of tamanhos) {
    await pg.setViewportSize({ width: t, height: t });
    await pg.setContent(`<html><body style="margin:0;background:transparent">${icone.replace('<svg ', `<svg width="${t}" height="${t}" `)}</body></html>`);
    await pg.screenshot({ path: path.join(tmp, `${t}.png`), omitBackground: true });
  }
  await b.close();
  fs.copyFileSync(path.join(tmp, '256.png'), path.join(assets, 'icone.png'));
  execFileSync('python3', ['-c', `
import sys
from PIL import Image
pasta, saida, tams = sys.argv[1], sys.argv[2], [int(x) for x in sys.argv[3].split(',')]
imgs = [Image.open(f'{pasta}/{t}.png').convert('RGBA') for t in tams]
imgs[-1].save(saida, format='ICO', sizes=[(t, t) for t in tams], append_images=imgs[:-1])
`, tmp, path.join(assets, 'icone.ico'), tamanhos.join(',')]);
  console.log('ícones gerados em', assets);
})();
