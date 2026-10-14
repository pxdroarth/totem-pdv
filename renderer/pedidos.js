// Tela de pedidos para quem prepara (2º monitor ou TV).
// Mostra os pedidos pagos com itens feitos na hora; "Pronto" chama a senha, "Entregue" tira da tela.
let vistos = null;         // números já mostrados (para tocar o aviso só quando chega pedido novo)
let ultimoPronto = null;   // destaca a senha que acabou de ser chamada
let somLigado = true;
try { somLigado = localStorage.getItem('pedidos-som') !== '0'; } catch { /* sem armazenamento: som ligado */ }

const minutosDesde = iso => Math.max(0, Math.floor((Date.now() - new Date(iso)) / 60000));
const textoLocal = l => l === 'levar' ? 'Para levar' : l === 'aqui' ? 'Comer aqui' : '';

// aviso sonoro gerado na hora (sem arquivo de áudio): 2 notas para pedido novo, 3 para pronto
function tocar(tipo) {
  if (!somLigado) return;
  try {
    const ctx = tocar.ctx || (tocar.ctx = new AudioContext());
    const notas = tipo === 'novo' ? [880, 1175] : [1047, 1319, 1568];
    notas.forEach((f, i) => {
      const t = ctx.currentTime + i * 0.18, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
      o.connect(g).connect(ctx.destination);
      o.start(t); o.stop(t + 0.2);
    });
  } catch { /* sem áudio */ }
}

function cartao(p) {
  const min = minutosDesde(p.desde);
  const nivel = min >= 10 ? 'atrasado' : min >= 6 ? 'atencao' : '';
  const local = textoLocal(p.cliente?.local);
  return `<article class="kds-card ${nivel}">
    <header class="kds-card-topo">
      <span class="kds-senha">${p.numero}</span>
      <div class="kds-quem">${p.cliente?.nome ? `<b>${esc(p.cliente.nome)}</b>` : ''}
        ${local ? `<span class="kds-local ${p.cliente.local}">${local}</span>` : ''}</div>
      <span class="kds-tempo">${min} min</span>
    </header>
    <ul class="kds-itens">${p.itens.map(i => `<li><b>${i.qtd}×</b> ${esc(i.nome)}
      ${i.opcoes ? `<div class="kds-opcoes">${i.opcoes.split('; ').map(esc).join('<br>')}</div>` : ''}</li>`).join('')}</ul>
    <button type="button" class="kds-btn-pronto" data-pronto="${p.numero}">${icone('check', 26)} Pronto — chamar ${p.numero}</button>
  </article>`;
}

function chamada(p) {
  return `<div class="kds-chamada ${p.numero === ultimoPronto ? 'recente' : ''}">
    <span class="kds-senha-grande">${p.numero}</span>
    <span class="kds-nome">${p.cliente?.nome ? esc(p.cliente.nome) : ''}${p.cliente?.local === 'levar' ? '<small>Para levar</small>' : ''}</span>
    <div class="kds-acoes-pronto">
      <button type="button" class="btn btn-pequeno" data-entregue="${p.numero}">Entregue</button>
      <button type="button" class="btn btn-pequeno btn-fantasma" data-voltar-fila="${p.numero}" aria-label="Voltar para preparando">Voltar</button>
    </div>
  </div>`;
}

async function atualizar() {
  let lista;
  try { lista = await pdv.pedidosPreparo(); } catch { return; }
  const fila = lista.filter(p => p.status === 'fila').sort((a, b) => a.numero - b.numero);
  const prontos = lista.filter(p => p.status === 'pronto').sort((a, b) => new Date(b.prontoEm) - new Date(a.prontoEm));
  const atuais = fila.map(p => p.numero);
  if (vistos && atuais.some(n => !vistos.has(n))) tocar('novo');
  vistos = new Set([...(vistos || []), ...atuais]);
  $('#qtd-fila').textContent = fila.length;
  $('#qtd-prontos').textContent = prontos.length;
  $('#lista-fila').innerHTML = fila.length ? fila.map(cartao).join('')
    : '<p class="kds-vazio">Nenhum pedido para preparar.<br><small>Os pedidos pagos com itens feitos na hora aparecem aqui.</small></p>';
  $('#lista-prontos').innerHTML = prontos.length ? prontos.map(chamada).join('') : '<p class="kds-vazio">Nenhuma senha chamada.</p>';
}

async function marcar(numero, status) {
  try {
    await pdv.marcarPreparo(Number(numero), status);
    if (status === 'pronto') { ultimoPronto = Number(numero); tocar('pronto'); setTimeout(() => { ultimoPronto = null; atualizar(); }, 20000); }
    await atualizar();
  } catch (e) { toast(e.message, 'erro'); }
}

document.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.pronto) marcar(b.dataset.pronto, 'pronto');
  if (b.dataset.entregue) marcar(b.dataset.entregue, 'entregue');
  if (b.dataset.voltarFila) marcar(b.dataset.voltarFila, 'fila');
});

function renderSom() { $('#btn-som').textContent = somLigado ? 'Som ligado' : 'Som desligado'; }
$('#btn-som').onclick = () => {
  somLigado = !somLigado;
  try { localStorage.setItem('pedidos-som', somLigado ? '1' : '0'); } catch { /* ok */ }
  renderSom();
  if (somLigado) tocar('novo');
};

function relogio() { $('#kds-relogio').textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
renderSom(); relogio(); atualizar();
setInterval(atualizar, 2000);
setInterval(relogio, 15000);
