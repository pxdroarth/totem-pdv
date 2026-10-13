// Utilitários compartilhados pela tela do cliente e pelo admin
const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];

const reais = c => 'R$ ' + (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// "129,90" | "129.90" | "1.299,90" -> centavos
function paraCentavos(texto) {
  let t = String(texto).trim().replace(/[^\d,.]/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  return Math.round(parseFloat(t || '0') * 100);
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const urlArquivo = caminho => caminho ? 'file:///' + caminho.replace(/\\/g, '/').replace(/^\/+/, '') : '';

function hojeLocal() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

let toastTimer;
function toast(msg, tipo = '') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast visivel ' + tipo;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = 'toast'), 3200);
}

function mostrarTela(nome) {
  $$('.tela').forEach(t => t.classList.toggle('ativa', t.id === 'tela-' + nome));
  $('#toast').className = 'toast'; // some o aviso ao trocar de tela
  document.body.dataset.tela = nome;
}

// Teclado numérico na tela para PIN. Resolve com o PIN digitado ou null se cancelar.
function pedirPin(titulo) {
  return new Promise(resolve => {
    let pin = '';
    const modal = $('#modal-pin'), disp = $('#pin-display'), tec = $('#teclado-pin');
    $('#pin-titulo').textContent = titulo;
    const render = () => (disp.textContent = '•'.repeat(pin.length) || ' ');
    tec.innerHTML = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'OK']
      .map(k => `<button type="button" class="tecla ${k === 'OK' ? 'ok' : ''}" data-k="${k}">${k}</button>`).join('');
    const fechar = valor => {
      modal.classList.remove('aberto');
      tec.onclick = null; $('#pin-cancelar').onclick = null; document.removeEventListener('keydown', teclado, true);
      resolve(valor);
    };
    const tecla = k => {
      if (k === 'C') pin = '';
      else if (k === 'OK') return fechar(pin);
      else if (pin.length < 8) pin += k;
      render();
    };
    const teclado = e => {
      if (/^\d$/.test(e.key)) tecla(e.key);
      else if (e.key === 'Enter') tecla('OK');
      else if (e.key === 'Backspace') { pin = pin.slice(0, -1); render(); }
      else if (e.key === 'Escape') fechar(null);
      else return;
      e.preventDefault(); e.stopPropagation();
    };
    tec.onclick = e => { const b = e.target.closest('[data-k]'); if (b) tecla(b.dataset.k); };
    $('#pin-cancelar').onclick = () => fechar(null);
    document.addEventListener('keydown', teclado, true);
    render();
    modal.classList.add('aberto');
  });
}

// Leitor de código de barras USB funciona como teclado: digita rápido e termina com Enter.
// Aqui separamos isso de uma pessoa digitando (intervalo entre teclas < 50 ms).
function ouvirLeitor(aoLer) {
  let buffer = '', ultimo = 0;
  document.addEventListener('keydown', e => {
    const alvo = e.target;
    const emCampo = alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT');
    if ($('#modal-pin').classList.contains('aberto')) return;
    const agora = Date.now();
    if (agora - ultimo > 50) buffer = '';
    ultimo = agora;
    if (e.key === 'Enter') {
      if (buffer.length >= 6) {
        // se estava num campo de busca, limpa o que o leitor digitou nele
        if (emCampo && alvo.id === 'busca') { alvo.value = alvo.value.slice(0, -buffer.length); alvo.dispatchEvent(new Event('input')); }
        if (!emCampo || alvo.id === 'busca') { e.preventDefault(); aoLer(buffer); }
      }
      buffer = '';
    } else if (e.key.length === 1) {
      buffer += e.key;
    }
  });
}
