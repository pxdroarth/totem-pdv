// Atualização em 1 clique pelo GitHub, com volta para a versão anterior.
// Funciona quando o totem roda a partir da pasta clonada do repositório (iniciar-totem.bat).
// Os dados da loja ficam fora desta pasta (%APPDATA%\Lisufit PDV), então atualizar não mexe neles.
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const WIN = process.platform === 'win32';

function rodar(cmd, args, { timeout = 60000, shell = false } = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd: RAIZ, timeout, shell, windowsHide: true, maxBuffer: 10 * 1024 * 1024 }, (err, out, errOut) => {
      if (err) reject(new Error(String(errOut || err.message).trim().split('\n').slice(-3).join(' ')));
      else resolve(String(out).trim());
    });
  });
}
const git = (...args) => rodar('git', args);

async function info(ref) {
  const [curto, hash, data, msg] = (await git('log', '-1', '--pretty=format:%h%x09%H%x09%cI%x09%s', ref)).split('\t');
  return { curto, hash, data, msg };
}

class Atualizador {
  // arquivoEstado: onde guardar qual era a versão anterior (fica junto dos dados da loja)
  constructor({ arquivoEstado, empacotado, fazerBackup }) {
    this.arquivoEstado = arquivoEstado;
    this.empacotado = empacotado;
    this.fazerBackup = fazerBackup;
    this.ocupado = false;
  }

  _estado() { try { return JSON.parse(fs.readFileSync(this.arquivoEstado, 'utf8')); } catch { return {}; } }
  _salvarEstado(e) { fs.writeFileSync(this.arquivoEstado, JSON.stringify({ ...this._estado(), ...e }, null, 2)); }

  async verificar({ buscar = true } = {}) {
    if (this.empacotado) return { suportado: false, motivo: 'Este computador usa a versão instalada pelo .exe. A atualização por botão funciona quando o totem roda pela pasta do GitHub (iniciar-totem.bat).' };
    try { await git('rev-parse', '--is-inside-work-tree'); }
    catch { return { suportado: false, motivo: 'A pasta do sistema não é um repositório do GitHub (ou o Git não está instalado).' }; }
    const ramo = await git('rev-parse', '--abbrev-ref', 'HEAD');
    const atual = await info('HEAD');
    let erroRede = '';
    if (buscar) {
      try { await rodar('git', ['fetch', '--quiet', 'origin', ramo], { timeout: 30000 }); }
      catch (e) { erroRede = 'Não consegui falar com o GitHub agora. Confira a internet e tente de novo.'; }
    }
    let novidades = [];
    try {
      const log = await git('log', `HEAD..origin/${ramo}`, '--pretty=format:%h%x09%cI%x09%s');
      novidades = log ? log.split('\n').map(l => { const [hash, data, msg] = l.split('\t'); return { hash, data, msg }; }) : [];
    } catch { /* ainda não buscou o origin */ }
    const est = this._estado();
    let anterior = null;
    if (est.anterior && est.anterior !== atual.hash) anterior = await info(est.anterior).catch(() => null);
    const sujo = (await git('status', '--porcelain', '--untracked-files=no')).length > 0;
    return { suportado: true, ramo, atual, novidades, anterior, erroRede, sujo };
  }

  async _dependenciasMudaram(de, para) {
    const arqs = await git('diff', '--name-only', de, para, '--', 'package.json', 'package-lock.json');
    return arqs.length > 0;
  }

  async _instalarDependencias() {
    await rodar(WIN ? 'npm.cmd' : 'npm', ['install', '--no-audit', '--no-fund'], { timeout: 15 * 60000, shell: WIN });
  }

  // vai de "de" para "para"; se falhar no meio, volta para "de"
  async _trocarVersao(de, para) {
    await git('reset', '--hard', para);
    try {
      if (await this._dependenciasMudaram(de, para)) await this._instalarDependencias();
    } catch (e) {
      await git('reset', '--hard', de).catch(() => {});
      throw new Error('Não consegui instalar as bibliotecas da versão nova, então continuei na versão que estava. Detalhe: ' + e.message);
    }
  }

  async _executar(fn) {
    if (this.ocupado) throw new Error('Já tem uma atualização em andamento.');
    this.ocupado = true;
    try { return await fn(); } finally { this.ocupado = false; }
  }

  atualizar() {
    return this._executar(async () => {
      const v = await this.verificar();
      if (!v.suportado) throw new Error(v.motivo);
      if (v.erroRede) throw new Error(v.erroRede);
      if (v.sujo) throw new Error('Tem arquivos do sistema alterados nesta pasta. Cancelei para não perder nada; chame o suporte.');
      if (!v.novidades.length) throw new Error('O sistema já está na versão mais nova.');
      this.fazerBackup('antes-da-atualizacao');
      const alvo = (await git('rev-parse', `origin/${v.ramo}`));
      await this._trocarVersao(v.atual.hash, alvo);
      this._salvarEstado({ anterior: v.atual.hash, atualizadoEm: new Date().toISOString() });
      return { de: v.atual, para: await info('HEAD') };
    });
  }

  voltar() {
    return this._executar(async () => {
      const v = await this.verificar({ buscar: false });
      if (!v.suportado) throw new Error(v.motivo);
      if (!v.anterior) throw new Error('Não há versão anterior registrada.');
      if (v.sujo) throw new Error('Tem arquivos do sistema alterados nesta pasta. Cancelei para não perder nada; chame o suporte.');
      this.fazerBackup('antes-de-voltar-versao');
      await this._trocarVersao(v.atual.hash, v.anterior.hash);
      // guarda a versão de onde saiu: assim dá para desfazer a volta
      this._salvarEstado({ anterior: v.atual.hash, voltouEm: new Date().toISOString() });
      return { de: v.atual, para: await info('HEAD') };
    });
  }
}

module.exports = { Atualizador };
