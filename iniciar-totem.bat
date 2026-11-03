@echo off
REM Abre o Lisufit PDV em modo totem (tela cheia).
REM O instalar.bat ja cria o atalho para abrir sozinho ao ligar o PC.
cd /d "%~dp0"
if exist "node_modules\electron\dist\electron.exe" (
  start "" "node_modules\electron\dist\electron.exe" .
) else (
  echo As bibliotecas nao estao instaladas. Rode o instalar.bat primeiro.
  pause
)
