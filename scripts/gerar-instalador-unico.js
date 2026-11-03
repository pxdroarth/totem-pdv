// Gera dist-instalador/instalar-lisufit.bat: UM arquivo só, com o instalar.ps1 dentro.
// Serve para baixar direto no totem (navegador, e-mail, WhatsApp Web) quando não dá para usar pendrive.
//   node scripts/gerar-instalador-unico.js
// Como funciona: o cmd lê só as primeiras linhas (até o "exit /b"); elas copiam a parte depois
// da marca #__PS1__ para um .ps1 temporário e rodam com o PowerShell.
const fs = require('fs'), path = require('path');
const raiz = path.join(__dirname, '..');
const ps1 = fs.readFileSync(path.join(__dirname, 'instalar.ps1'), 'utf8').replace(/^﻿/, '');
const cabeca = [
  '@echo off',
  'REM Lisufit PDV - instalador de arquivo unico. Dois cliques. Deixe o token.txt na mesma pasta (ou cole quando pedir).',
  'set "LISU_BAT=%~f0"',
  'set "LISU_DIR=%~dp0"',
  'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$c=[IO.File]::ReadAllText($env:LISU_BAT,[Text.Encoding]::UTF8); $i=$c.LastIndexOf(\'#__PS1__\'); $f=Join-Path $env:TEMP \'lisufit-instalar.ps1\'; [IO.File]::WriteAllText($f,$c.Substring($i),(New-Object Text.UTF8Encoding $true)); & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $f -PastaToken $env:LISU_DIR"',
  'exit /b',
  ''
].join('\r\n');
const saida = path.join(raiz, 'dist-instalador');
fs.mkdirSync(saida, { recursive: true });
const arq = path.join(saida, 'instalar-lisufit.bat');
fs.writeFileSync(arq, cabeca + '#__PS1__\r\n' + ps1.replace(/\r?\n/g, '\r\n'), 'utf8'); // sem BOM: o cmd não aceita BOM na 1ª linha
console.log('gerado:', arq);
