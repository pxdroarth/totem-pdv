# Token do GitHub (instalar e atualizar sem login)

O repositório é privado. Em vez de entrar com a sua conta no totem, o sistema usa um **token só de leitura**, uma chave que só consegue **baixar** o `lisufit-pdv`. Não altera nada nem dá acesso a outros repositórios.

## Criar o token (uma vez, uns 2 minutos)

1. No GitHub, logado na conta dona do repositório: **Settings › Developer settings › Personal access tokens › Fine-grained tokens › Generate new token** (<https://github.com/settings/personal-access-tokens/new>).
2. **Token name:** `totem-lisufit`
3. **Expiration:** a maior opção que aparecer (ex.: 1 ano). Anote a data para trocar antes de vencer.
4. **Repository access:** *Only select repositories* › `pxdroarth/lisufit-pdv`.
5. **Permissions › Repository permissions › Contents:** **Read-only**. Não marque mais nada. O *Metadata: Read-only* entra sozinho.
6. **Generate token** e copie o código (`github_pat_...`). Ele só aparece essa vez.

## Usar no instalador

Escolha um dos jeitos:
- **Arquivo:** crie um `token.txt` com o código, na mesma pasta do `instalar.bat` no pendrive. **Apague do pendrive depois da instalação.**
- **Digitando:** sem o arquivo, o instalador tenta baixar e, quando o GitHub pedir acesso, pede para colar o token. O que você cola não aparece na tela.

O token fica guardado na pasta do sistema (`C:\lisufit-pdv\.git\config`). É ele que deixa o botão **Atualizar** do painel funcionar sem login.

## Quando vencer ou se vazar

- Venceu: o painel avisa "O GitHub recusou o acesso". Gere um token novo e rode o `instalar.bat` de novo com o `token.txt` novo. Ele troca o token e mantém os dados da loja.
- Vazou ou o PC foi trocado: em *Fine-grained tokens*, clique no token e **Revoke**. Quem tiver o token antigo perde o acesso na hora.

## Sem token nenhum

Se o repositório for **público**, o instalador baixa sem token e sem login. A desvantagem é que qualquer pessoa vê o código e a documentação, inclusive os dados da loja em `docs/`.
