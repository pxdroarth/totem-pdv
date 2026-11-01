// Roda todos os testes de ponta a ponta, um depois do outro.  npm test   (Linux sem tela: xvfb-run -a npm test)
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const pasta = path.join(__dirname, 'e2e');
const arquivos = fs.readdirSync(pasta).filter(f => f.endsWith('.js') && !f.startsWith('_')).sort();
let falhou = [];
for (const f of arquivos) {
  console.log(`\n=== ${f}`);
  try { execFileSync(process.execPath, [path.join(pasta, f)], { stdio: 'inherit', timeout: 5 * 60 * 1000 }); }
  catch { falhou.push(f); }
}
console.log(falhou.length ? `\nFALHARAM: ${falhou.join(', ')}` : `\nTodos os ${arquivos.length} testes passaram.`);
process.exit(falhou.length ? 1 : 0);
