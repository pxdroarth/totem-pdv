@echo off
REM Instala o Lisufit PDV num Windows zerado: Git, Node.js, o sistema, as bibliotecas e os atalhos.
REM Dois cliques aqui. Pode rodar de novo quando quiser (o que ja existe e pulado).
setlocal
set "PS1=%~dp0scripts\instalar.ps1"
if not exist "%PS1%" set "PS1=%~dp0instalar.ps1"
if not exist "%PS1%" (
  echo Nao achei o instalar.ps1. Deixe este arquivo junto com ele.
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PS1%" %*
