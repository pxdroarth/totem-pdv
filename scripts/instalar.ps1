# =====================================================================
#  Lisufit PDV - instalador para Windows zerado
#  Rode com dois cliques em "instalar.bat" (ele chama este arquivo como administrador).
#
#  O que faz, nesta ordem (pode rodar de novo quantas vezes quiser: o que já existe é pulado):
#   1. Instala o Git e o Node.js LTS (pelo winget; sem winget, baixa os instaladores oficiais)
#   2. Baixa o sistema do GitHub em C:\lisufit-pdv (ou atualiza, se já existir)
#      - se este arquivo já estiver dentro da pasta do sistema (pendrive/zip), usa essa pasta
#   3. Instala as bibliotecas do projeto (npm ci), incluindo o Electron
#   4. Cria os atalhos: Área de Trabalho e "abrir sozinho ao ligar o PC"
#   5. Deixa o PC sem suspender nem desligar a tela (é um totem)
#   6. Confere tudo e mostra um resumo. O registro fica em instalacao.log na pasta do sistema.
# =====================================================================
param(
  [string]$Pasta = 'C:\lisufit-pdv',
  [string]$Repositorio = 'https://github.com/pxdroarth/lisufit-pdv.git',
  [switch]$SemIniciarComWindows,
  [switch]$SemEnergia,
  [switch]$NaoAbrir
)

# 'Continue': no PowerShell 5, programas como git e npm escrevem progresso no stderr e 'Stop' trataria isso como erro.
# Os erros de verdade são conferidos pelo código de saída ($LASTEXITCODE) e pelos arquivos esperados.
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'   # deixa os downloads bem mais rápidos no PowerShell 5
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Passo($n, $texto) { Write-Host ''; Write-Host "[$n/6] $texto" -ForegroundColor Cyan }
function Ok($texto) { Write-Host "  OK  $texto" -ForegroundColor Green }
function Aviso($texto) { Write-Host "  !!  $texto" -ForegroundColor Yellow }
function Falha($texto) {
  Write-Host ''
  Write-Host "  ERRO: $texto" -ForegroundColor Red
  Write-Host '  Tire uma foto desta tela e mande para o suporte.' -ForegroundColor Red
  try { Stop-Transcript | Out-Null } catch {}
  Read-Host '  Aperte Enter para fechar'
  exit 1
}

# ---------- precisa ser administrador (para instalar programas) ----------
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
  Write-Host 'Pedindo permissão de administrador...'
  $argumentos = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"", '-Pasta', "`"$Pasta`"")
  if ($SemIniciarComWindows) { $argumentos += '-SemIniciarComWindows' }
  if ($SemEnergia) { $argumentos += '-SemEnergia' }
  if ($NaoAbrir) { $argumentos += '-NaoAbrir' }
  Start-Process powershell.exe -Verb RunAs -ArgumentList $argumentos
  exit 0
}

$log = Join-Path $env:TEMP 'lisufit-instalacao.log'
try { Start-Transcript -Path $log -Force | Out-Null } catch {}
Write-Host '============================================' -ForegroundColor Cyan
Write-Host '   Lisufit PDV - instalação do totem' -ForegroundColor Cyan
Write-Host '============================================' -ForegroundColor Cyan

function Atualizar-Path {
  $m = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $u = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = "$m;$u"
  foreach ($p in @("$env:ProgramFiles\nodejs", "$env:ProgramFiles\Git\cmd")) {
    if ((Test-Path $p) -and ($env:Path -notlike "*$p*")) { $env:Path = "$env:Path;$p" }
  }
}
function Tem($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
$temWinget = Tem 'winget'

function Baixar($url, $destino) {
  for ($i = 1; $i -le 3; $i++) {
    try { Invoke-WebRequest -Uri $url -OutFile $destino -UseBasicParsing -ErrorAction Stop; return }
    catch { if ($i -eq 3) { throw } ; Start-Sleep -Seconds 3 }
  }
}

function Instalar-Git {
  if ($temWinget) {
    winget install --id Git.Git -e --silent --accept-package-agreements --accept-source-agreements
    Atualizar-Path
    if (Tem 'git') { return }
    Aviso 'O winget não conseguiu; vou baixar o instalador do Git direto do site.'
  }
  if ($true) {
    $rel = Invoke-RestMethod -Uri 'https://api.github.com/repos/git-for-windows/git/releases/latest' -UseBasicParsing -ErrorAction Stop
    $asset = $rel.assets | Where-Object { $_.name -match '^Git-[\d.]+-64-bit\.exe$' } | Select-Object -First 1
    if (-not $asset) { throw 'Não achei o instalador do Git.' }
    $exe = Join-Path $env:TEMP $asset.name
    Baixar $asset.browser_download_url $exe
    Start-Process $exe -ArgumentList '/VERYSILENT', '/NORESTART', '/NOCANCEL', '/SP-' -Wait -ErrorAction Stop
  }
}

function Instalar-Node {
  if ($temWinget) {
    winget install --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements
    Atualizar-Path
    if ((Tem 'node') -and [int]((node -v).TrimStart('v').Split('.')[0]) -ge 18) { return }
    Aviso 'O winget não conseguiu; vou baixar o instalador do Node.js direto do site.'
  }
  if ($true) {
    $lista = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -UseBasicParsing -ErrorAction Stop
    $lts = $lista | Where-Object { $_.lts } | Select-Object -First 1
    $msi = Join-Path $env:TEMP "node-$($lts.version)-x64.msi"
    Baixar "https://nodejs.org/dist/$($lts.version)/node-$($lts.version)-x64.msi" $msi
    Start-Process msiexec.exe -ArgumentList '/i', "`"$msi`"", '/qn', '/norestart' -Wait -ErrorAction Stop
  }
}

# ---------- 1. Git e Node.js ----------
Passo 1 'Git e Node.js'
Atualizar-Path
if (-not $temWinget) { Aviso 'winget não encontrado: vou baixar os instaladores direto dos sites oficiais.' }
try {
  if (Tem 'git') { Ok "Git já instalado ($(git --version))" }
  else { Write-Host '  Instalando o Git...'; Instalar-Git; Atualizar-Path; if (-not (Tem 'git')) { throw 'o Git não apareceu depois da instalação' }; Ok "Git instalado ($(git --version))" }
} catch { Falha "Não consegui instalar o Git: $($_.Exception.Message). Confira a internet ou instale pelo site git-scm.com." }

try {
  $precisaNode = $true
  if (Tem 'node') {
    $maior = [int]((node -v).TrimStart('v').Split('.')[0])
    if ($maior -ge 18) { $precisaNode = $false; Ok "Node.js já instalado ($(node -v))" }
    else { Aviso "Node.js $(node -v) é antigo: vou instalar a versão LTS." }
  }
  if ($precisaNode) { Write-Host '  Instalando o Node.js LTS...'; Instalar-Node; Atualizar-Path; if (-not (Tem 'node')) { throw 'o Node.js não apareceu depois da instalação' }; Ok "Node.js instalado ($(node -v))" }
} catch { Falha "Não consegui instalar o Node.js: $($_.Exception.Message). Confira a internet ou instale pelo site nodejs.org (versão LTS)." }

# ---------- 2. O sistema ----------
Passo 2 'Baixar o sistema'
$daqui = Split-Path -Parent (Split-Path -Parent $PSCommandPath)   # scripts\ -> pasta do projeto
if (Test-Path (Join-Path $daqui 'package.json')) {
  $Pasta = $daqui
  Ok "Usando a pasta onde este instalador está: $Pasta"
  if (Test-Path (Join-Path $Pasta '.git')) {
    Push-Location $Pasta
    git pull --ff-only
    if ($LASTEXITCODE -eq 0) { Ok 'Atualizado com o GitHub' } else { Aviso 'Não consegui atualizar pelo GitHub agora; segue com a versão desta pasta.' }
    Pop-Location
  } else { Aviso 'Esta pasta não veio do GitHub: o botão "Atualizar" do painel não vai funcionar. Para ter o botão, rode o instalador fora desta pasta.' }
} elseif (Test-Path (Join-Path $Pasta '.git')) {
  Push-Location $Pasta
  git pull --ff-only
  if ($LASTEXITCODE -eq 0) { Ok "Sistema já existia em $Pasta e foi atualizado" }
  else { Aviso "Sistema já existe em $Pasta, mas não consegui atualizar (segue com a versão que está lá)." }
  Pop-Location
} else {
  if ((Test-Path $Pasta) -and (Get-ChildItem $Pasta -Force | Select-Object -First 1)) { Falha "A pasta $Pasta já existe e não é do sistema. Apague ou rode com -Pasta outra\pasta." }
  Write-Host "  Baixando de $Repositorio"
  Write-Host '  (se o repositório for privado, vai abrir uma janela do GitHub para entrar com a sua conta)'
  git clone $Repositorio $Pasta
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path (Join-Path $Pasta 'package.json'))) { Falha 'Não consegui baixar do GitHub. Confira a internet e o acesso ao repositório.' }
  Ok "Sistema baixado em $Pasta"
}

# a instalação roda como administrador, mas o totem e o botão "Atualizar" rodam como usuário comum:
# libera a pasta para os usuários e avisa o Git que ela é confiável (senão ele recusa por "dono diferente")
icacls $Pasta /grant '*S-1-5-32-545:(OI)(CI)M' /T /Q | Out-Null
git config --system --add safe.directory ($Pasta -replace '\\', '/') 2>$null
Ok 'Pasta liberada para o usuário do totem (atualizações pelo painel)'

# ---------- 3. Bibliotecas ----------
Passo 3 'Instalar as bibliotecas (pode levar alguns minutos)'
Push-Location $Pasta
$ok = $false
for ($i = 1; $i -le 3 -and -not $ok; $i++) {
  if (Test-Path 'package-lock.json') { npm ci --no-audit --no-fund } else { npm install --no-audit --no-fund }
  if ($LASTEXITCODE -eq 0) { $ok = $true } else { Aviso "Tentativa $i falhou; tentando de novo..."; Start-Sleep -Seconds 5 }
}
$electron = Join-Path $Pasta 'node_modules\electron\dist\electron.exe'
if (-not $ok -or -not (Test-Path $electron)) { Pop-Location; Falha 'As bibliotecas não instalaram. Confira a internet e rode o instalador de novo.' }
Ok 'Bibliotecas instaladas (Electron, Excel, QR Code)'
Pop-Location

# ---------- 4. Atalhos ----------
Passo 4 'Atalhos'
$bat = Join-Path $Pasta 'iniciar-totem.bat'
$icone = Join-Path $Pasta 'renderer\assets\icone.ico'
function Criar-Atalho($arquivo) {
  $w = New-Object -ComObject WScript.Shell
  $s = $w.CreateShortcut($arquivo)
  $s.TargetPath = $bat
  $s.WorkingDirectory = $Pasta
  $s.WindowStyle = 7   # minimizado: só a tela do totem aparece
  if (Test-Path $icone) { $s.IconLocation = $icone } else { $s.IconLocation = "$electron,0" }
  $s.Description = 'Abre o Lisufit PDV em modo totem'
  $s.Save()
}
Criar-Atalho (Join-Path ([Environment]::GetFolderPath('CommonDesktopDirectory')) 'Lisufit PDV.lnk')
Ok 'Atalho "Lisufit PDV" na Área de Trabalho'
if (-not $SemIniciarComWindows) {
  Criar-Atalho (Join-Path ([Environment]::GetFolderPath('CommonStartup')) 'Lisufit PDV.lnk')
  Ok 'Abre sozinho quando o PC liga'
} else { Aviso 'Não vai abrir sozinho ao ligar (opção -SemIniciarComWindows)' }

# ---------- 5. Energia ----------
Passo 5 'Energia (totem não pode dormir)'
if (-not $SemEnergia) {
  powercfg /change standby-timeout-ac 0 | Out-Null
  powercfg /change monitor-timeout-ac 0 | Out-Null
  powercfg /change hibernate-timeout-ac 0 | Out-Null
  Ok 'Na tomada: o PC não suspende e a tela não apaga'
} else { Aviso 'Configuração de energia não alterada (opção -SemEnergia)' }

# ---------- 6. Conferência ----------
Passo 6 'Conferência'
$tudoOk = $true
foreach ($c in @(@('Git', 'git --version'), @('Node.js', 'node -v'), @('npm', 'npm -v'))) {
  $v = Invoke-Expression $c[1] 2>$null
  if ($v) { Ok "$($c[0]): $v" } else { Aviso "$($c[0]) não respondeu"; $tudoOk = $false }
}
if (Test-Path $electron) { Ok 'Electron pronto' } else { Aviso 'Electron não encontrado'; $tudoOk = $false }
if (Test-Path (Join-Path $Pasta '.git')) { Push-Location $Pasta; Ok "Versão: $(git log -1 --pretty=format:'%h - %s')"; Pop-Location }
try { Stop-Transcript | Out-Null; Copy-Item $log (Join-Path $Pasta 'instalacao.log') -Force } catch {}

Write-Host ''
if ($tudoOk) {
  Write-Host '============================================' -ForegroundColor Green
  Write-Host '   Instalação concluída!' -ForegroundColor Green
  Write-Host '============================================' -ForegroundColor Green
  Write-Host "  Pasta do sistema: $Pasta"
  Write-Host '  Painel da loja: Ctrl + Shift + A  ou  5 toques no logo.  PIN de fábrica: 1234 (troque!)'
  Write-Host '  Para sair do modo totem: painel > Configurações > "Fechar o sistema".'
  if (-not $NaoAbrir) {
    $resp = Read-Host '  Abrir o totem agora? (S/n)'
    if ($resp -notmatch '^[nN]') { Start-Process -FilePath $bat -WorkingDirectory $Pasta -WindowStyle Minimized }
  }
} else {
  Falha 'Alguma parte não ficou pronta (veja os avisos acima).'
}
