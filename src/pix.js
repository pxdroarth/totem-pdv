// Gera o "PIX Copia e Cola" (BR Code estático) seguindo o padrão EMV do Banco Central.
// O QR é estático: o sistema NÃO consegue saber sozinho se o cliente pagou.
// Para confirmação automática é preciso a API de PIX do banco/PSP (ver README).

function campo(id, valor) {
  const v = String(valor);
  return id + String(v.length).padStart(2, '0') + v;
}

function limpar(texto, max) {
  return String(texto || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .toUpperCase().trim().slice(0, max);
}

function crc16(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function gerarPix({ chave, nome, cidade, valorCentavos, txid }) {
  if (!chave) throw new Error('Chave PIX não configurada no painel admin.');
  const conta = campo('00', 'br.gov.bcb.pix') + campo('01', chave.trim());
  const tx = (txid || '***').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';
  let payload =
    campo('00', '01') +
    campo('26', conta) +
    campo('52', '0000') +
    campo('53', '986') +
    (valorCentavos > 0 ? campo('54', (valorCentavos / 100).toFixed(2)) : '') +
    campo('58', 'BR') +
    campo('59', limpar(nome, 25) || 'LOJA') +
    campo('60', limpar(cidade, 15) || 'BRASIL') +
    campo('62', campo('05', tx)) +
    '6304';
  return payload + crc16(payload);
}

module.exports = { gerarPix, crc16 };
