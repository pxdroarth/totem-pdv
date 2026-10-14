@echo off
REM Abre o Lisufit PDV em modo totem (tela cheia).
REM Coloque um atalho deste arquivo em shell:startup para abrir sozinho ao ligar o PC.
cd /d "%~dp0"
call npm run kiosk
