// Teclado na tela (o totem não tem teclado físico e o teclado do Windows não abre em modo quiosque).
// Abre sozinho ao tocar em qualquer campo de texto ou número, no totem e no painel admin.
// Layouts: letras (com acentos ´ ~ ^ e Ç), símbolos e numérico (preço, PIN, quantidade).
// Fica de fora: caixas de marcar, datas/horários (o Chromium já abre um seletor de toque),
// campos somente leitura e qualquer campo com data-sem-teclado.
// Modo (Configurações > Totem): 'sempre' (padrão), 'toque' (só quando o campo é tocado) ou 'nunca'.
const Teclado = (() => {
  const TIPOS_TEXTO = ['text', 'search', 'password', 'tel', 'url', 'email', 'number', ''];
  const LETRAS = ['1234567890', 'qwertyuiop', 'asdfghjklç', 'zxcvbnm'];
  const SIMBOLOS = ['1234567890', '@#$%&*-+()', '/:;,.!?"\'_', '=<>[]{}\\|'];
  const ACENTOS = { '´': { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú' }, '~': { a: 'ã', o: 'õ', n: 'ñ' }, '^': { a: 'â', e: 'ê', o: 'ô' } };

  let alvo = null, painel = null, layout = 'letras', maiuscula = false, travaMaiuscula = false, acento = null;
  let ultimoToque = { tipo: '', quando: 0 }, alterado = false, paddingAntigo = null, vigia = null;
  const api = { modo: 'sempre', desligado: false };

  const ehCampo = el => {
    if (!el || el.disabled || el.readOnly || el.closest('[data-sem-teclado]')) return false;
    if (el.tagName === 'TEXTAREA') return true;
    return el.tagName === 'INPUT' && TIPOS_TEXTO.includes((el.getAttribute('type') || '').toLowerCase());
  };
  const modoOriginal = el => el.dataset.tecladoModo ?? (el.dataset.tecladoModo = el.getAttribute('inputmode') || '');
  const ehNumerico = el => el.type === 'number' || ['numeric', 'decimal', 'tel'].includes(modoOriginal(el));
  const aceitaVirgula = el => modoOriginal(el) === 'decimal';
  const autoMaiuscula = el => el.tagName === 'TEXTAREA' || (['text', 'search', ''].includes(el.type) && el.getAttribute('autocapitalize') !== 'off');

  function rotulo(el) {
    const l = el.closest('label');
    const doRotulo = l ? [...l.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(' ').replace(/\s+/g, ' ').trim() : '';
    return doRotulo || el.getAttribute('aria-label') || el.placeholder || '';
  }

  // ---------- montar ----------
  function criar() {
    painel = document.createElement('div');
    painel.id = 'teclado-virtual';
    painel.className = 'teclado-virtual';
    painel.setAttribute('role', 'group');
    painel.setAttribute('aria-label', 'Teclado na tela');
    painel.hidden = true;
    document.body.appendChild(painel);
    // pointerdown + preventDefault: o campo continua com o foco (e o cursor) enquanto se digita
    painel.addEventListener('pointerdown', e => {
      e.preventDefault();
      const b = e.target.closest('[data-t]');
      if (!b) return;
      b.classList.add('apertada');
      setTimeout(() => b.classList.remove('apertada'), 120);
      apertar(b.dataset.t);
    });
    painel.addEventListener('click', e => e.preventDefault());
  }

  const tecla = (t, conteudo, classe = '', rotuloAria = '') =>
    `<button type="button" tabindex="-1" class="tv-tecla ${classe}" data-t="${esc(t)}"${rotuloAria ? ` aria-label="${rotuloAria}"` : ''}>${conteudo}</button>`;

  function render() {
    const num = ehNumerico(alvo);
    const ultimo = !proximoCampo();
    const ok = tecla('ok', ultimo ? 'OK' : `Próximo ${icone('seta', 20)}`, 'tv-ok');
    const apagar = tecla('apagar', icone('apagar', 26), 'tv-acao tv-apagar', 'Apagar');
    let corpo;
    if (num) {
      const extra = aceitaVirgula(alvo) ? tecla(',', ',') : alvo.type === 'number' && alvo.min === '' ? tecla('-', '−') : '<span></span>';
      corpo = `<div class="tv-numerico">${'123456789'.split('').map(n => tecla(n, n)).join('')}${extra}${tecla('0', '0')}${apagar}</div>
        <div class="tv-linha tv-linha-ok">${ok}</div>`;
    } else {
      const grade = layout === 'letras' ? LETRAS : SIMBOLOS;
      const mai = maiuscula || travaMaiuscula;
      const linhas = grade.map((l, i) => {
        const teclas = [...l].map(c => {
          let mostra = c;
          if (layout === 'letras' && /\p{L}/u.test(c)) mostra = mai ? c.toUpperCase() : c;
          return tecla(c, esc(mostra), acento && ACENTOS[acento][c] ? 'tv-pode-acento' : '');
        }).join('');
        if (i === 3 && layout === 'letras')
          return `<div class="tv-linha">${tecla('shift', icone('shift', 24), `tv-acao ${mai ? 'tv-ativa' : ''} ${travaMaiuscula ? 'tv-trava' : ''}`, 'Maiúscula')}${teclas}${apagar}</div>`;
        if (i === 3) return `<div class="tv-linha">${teclas}${apagar}</div>`;
        return `<div class="tv-linha">${teclas}</div>`;
      }).join('');
      const acentos = layout === 'letras'
        ? Object.keys(ACENTOS).map(a => tecla('acento:' + a, a, `tv-acento ${acento === a ? 'tv-ativa' : ''}`, 'Acento ' + a)).join('')
        : tecla('.', '.') + tecla('-', '-');
      corpo = linhas + `<div class="tv-linha">${tecla('layout', layout === 'letras' ? '?123' : 'ABC', 'tv-acao tv-layout')}${acentos}${tecla(' ', 'espaço', 'tv-espaco')}${tecla('@', '@')}${ok}</div>`;
    }
    const valor = alvo.type === 'password' ? '•'.repeat(alvo.value.length) : alvo.value;
    painel.className = 'teclado-virtual' + (num ? ' tv-modo-numerico' : '');
    painel.innerHTML = `<div class="tv-topo">
        <span class="tv-rotulo">${icone('teclado', 20)}<b>${esc(rotulo(alvo) || 'Digite')}</b><span class="tv-valor">${esc(valor)}</span></span>
        ${tecla('fechar', `${icone('baixo', 22)} Fechar teclado`, 'tv-fechar')}
      </div><div class="tv-corpo">${corpo}</div>`;
  }

  // ---------- digitar ----------
  function inserir(txt) {
    const el = alvo;
    const max = el.maxLength > 0 ? el.maxLength : Infinity;
    let s = null, f = null;
    try { s = el.selectionStart; f = el.selectionEnd; } catch { /* type=number não tem cursor */ }
    if (s === null || s === undefined) {
      if (el.value.length >= max) return;
      el.value += txt;
    } else {
      if (el.value.length - (f - s) + txt.length > max) return;
      el.setRangeText(txt, s, f, 'end');
    }
    mudou();
  }
  function apagarUm() {
    const el = alvo;
    let s = null, f = null;
    try { s = el.selectionStart; f = el.selectionEnd; } catch { /* number */ }
    if (s === null || s === undefined) el.value = el.value.slice(0, -1);
    else if (s !== f) el.setRangeText('', s, f, 'end');
    else if (s > 0) el.setRangeText('', s - 1, s, 'end');
    else return;
    mudou();
  }
  function mudou() {
    alterado = true;
    alvo.dispatchEvent(new Event('input', { bubbles: true }));
    const v = painel.querySelector('.tv-valor');
    if (v) v.textContent = alvo.type === 'password' ? '•'.repeat(alvo.value.length) : alvo.value;
  }

  function apertar(t) {
    if (!alvo) return;
    if (t === 'fechar') return esconder(true);
    if (t === 'ok') return confirmar();
    if (t === 'apagar') { apagarUm(); return; }
    if (t === 'layout') { layout = layout === 'letras' ? 'simbolos' : 'letras'; acento = null; return render(); }
    if (t === 'shift') {
      if (travaMaiuscula) { travaMaiuscula = false; maiuscula = false; }
      else if (maiuscula) travaMaiuscula = true; // dois toques = trava maiúscula
      else maiuscula = true;
      return render();
    }
    if (t.startsWith('acento:')) { const a = t.slice(7); acento = acento === a ? null : a; return render(); }
    const antes = `${maiuscula}|${acento}`;
    let c = t;
    if (acento) {
      const comAcento = ACENTOS[acento][c.toLowerCase()];
      if (comAcento) c = c === c.toUpperCase() ? comAcento.toUpperCase() : comAcento;
      else if (c === ' ') c = acento; // acento + espaço = o próprio sinal
      else inserir(acento);
      acento = null;
    }
    if (layout === 'letras' && /\p{L}/u.test(c) && (maiuscula || travaMaiuscula)) c = c.toUpperCase();
    inserir(c);
    if (maiuscula && !travaMaiuscula) maiuscula = false; // maiúscula vale para uma letra (dois toques travam)
    if (`${maiuscula}|${acento}` !== antes) render();
  }

  // "Próximo": vai para o campo seguinte do mesmo formulário/janela; no último, OK fecha o teclado
  function proximoCampo() {
    if (!alvo) return null;
    const escopo = alvo.closest('form, .modal-caixa, .tela') || document.body;
    const campos = [...escopo.querySelectorAll('input, textarea')].filter(el => ehCampo(el) && el.offsetParent !== null);
    const i = campos.indexOf(alvo);
    return i >= 0 ? campos[i + 1] || null : null;
  }
  function confirmar() {
    // avisa a tela como se fosse o Enter (ex.: preço rápido na tabela de produtos salva no Enter)
    const ev = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true });
    const tratou = !alvo.dispatchEvent(ev);
    const prox = proximoCampo();
    if (prox && !tratou) { prox.focus(); return; }
    esconder(true);
  }

  // ---------- mostrar / esconder ----------
  function mostrar(el) {
    if (!painel) criar();
    if (alvo && alvo !== el) sair();
    alvo = el;
    alterado = false;
    acento = null; travaMaiuscula = false;
    layout = 'letras';
    maiuscula = !ehNumerico(el) && autoMaiuscula(el) && el.value === '';
    // impede o teclado do Windows de abrir junto com o nosso
    modoOriginal(el);
    el.setAttribute('inputmode', 'none');
    render();
    painel.hidden = false;
    document.body.classList.add('com-teclado');
    requestAnimationFrame(() => {
      document.documentElement.style.setProperty('--altura-teclado', painel.offsetHeight + 'px');
      requestAnimationFrame(garantirVisivel);
    });
    clearInterval(vigia);
    // o campo sumiu (janela fechou, troca de tela)? o teclado some junto
    vigia = setInterval(() => { if (alvo && (!alvo.isConnected || alvo.offsetParent === null || document.activeElement !== alvo)) esconder(false); }, 400);
  }
  function sair() {
    if (!alvo) return;
    const el = alvo;
    if (el.dataset.tecladoModo) el.setAttribute('inputmode', el.dataset.tecladoModo); else el.removeAttribute('inputmode');
    if (alterado) el.dispatchEvent(new Event('change', { bubbles: true }));
    alterado = false;
  }
  function esconder(tirarFoco) {
    clearInterval(vigia);
    const el = alvo;
    sair();
    alvo = null;
    if (painel) painel.hidden = true;
    document.body.classList.remove('com-teclado');
    document.documentElement.style.removeProperty('--altura-teclado');
    if (paddingAntigo) { paddingAntigo.el.style.paddingBottom = paddingAntigo.valor; paddingAntigo = null; }
    if (tirarFoco && el && document.activeElement === el) el.blur();
  }

  // rola a tela para o campo não ficar escondido atrás do teclado
  function garantirVisivel() {
    if (!alvo || painel.hidden) return;
    const altura = painel.offsetHeight;
    const limite = window.innerHeight - altura - 16;
    const r = alvo.getBoundingClientRect();
    if (r.bottom <= limite && r.top >= 0) return;
    let s = alvo.parentElement;
    while (s && s !== document.body && !/(auto|scroll)/.test(getComputedStyle(s).overflowY)) s = s.parentElement;
    if (!s || s === document.body) s = document.scrollingElement;
    if (!paddingAntigo && s !== document.scrollingElement) {
      paddingAntigo = { el: s, valor: s.style.paddingBottom };
      s.style.paddingBottom = altura + 'px';
    }
    s.scrollTop += r.bottom - limite + 8;
  }

  // ---------- eventos ----------
  document.addEventListener('pointerdown', e => { ultimoToque = { tipo: e.pointerType, quando: Date.now(), el: e.target }; }, true);
  document.addEventListener('focusin', e => {
    const el = e.target;
    if (api.desligado || api.modo === 'nunca' || !ehCampo(el)) return;
    if (api.modo === 'toque') {
      const tocou = ['touch', 'pen'].includes(ultimoToque.tipo) && Date.now() - ultimoToque.quando < 1000;
      if (!tocou) return;
    }
    mostrar(el);
  });
  document.addEventListener('focusout', e => {
    if (e.target !== alvo) return;
    // espera o foco ir para o próximo lugar: se foi para outro campo, o focusin já trocou o alvo
    setTimeout(() => { if (alvo === e.target && document.activeElement !== alvo) esconder(false); }, 0);
  });
  // tocar de novo no campo depois de fechar o teclado abre ele de novo
  document.addEventListener('pointerup', e => {
    if (alvo || api.desligado || api.modo === 'nunca') return;
    const el = e.target;
    if (ehCampo(el) && document.activeElement === el && (api.modo === 'sempre' || ['touch', 'pen'].includes(e.pointerType))) mostrar(el);
  });
  // Esc no teclado físico fecha o da tela
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && alvo) esconder(false); });

  api.configurar = modo => { api.modo = ['sempre', 'toque', 'nunca'].includes(modo) ? modo : 'sempre'; if (api.modo === 'nunca' && alvo) esconder(false); };
  api.aberto = () => !!alvo;
  api.esconder = () => esconder(true);
  return api;
})();
