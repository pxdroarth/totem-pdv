# Lisufit PDV — Autoatendimento (Windows)

Sistema de totem/PDV **100% offline** feito em Electron (HTML + CSS + JavaScript puro, sem framework),
fácil de editar. Roda no Dell com Windows em tela cheia travada (modo quiosque).

## O que ele faz
- **Catálogo na tela de toque** com categorias, busca e fotos
- **Leitor de código de barras USB**: passou o produto, entra no carrinho (em qualquer tela do cliente)
- **3 formas de pagamento**: PIX (QR Code gerado com o valor exato), cartão na maquininha ao lado, ou "pagar no caixa" (gera nº de pedido)
- **Confirmação por PIN do atendente** para PIX e cartão (pode desligar nas configurações)
- **Cupom não fiscal** impresso na impressora térmica escolhida
- **Controle de estoque** (baixa automática, alerta de estoque baixo, produto esgotado some do totem)
- **Categorias por seção** (Suplementos, Empório...): cadastro no painel com ícone, ordem e opção de ocultar
- **Itens feitos na hora** (smoothies, shakes): produto sem controle de estoque, nunca fica esgotado
- **Variações de produto** (sabor, frutas, adicionais): o cliente monta o pedido no totem; cada opção pode ter preço extra
- **Painel admin**: produtos, categorias, vendas do dia/período, mais vendidos, pedidos aguardando caixa, cancelamentos, reimpressão, backup
- Volta sozinho para a tela inicial após inatividade

## Instalar e rodar (no Windows)
1. Instale o **Node.js LTS**: https://nodejs.org
2. Copie a pasta `pdv-suplementos` para o computador (ex.: `C:\pdv-suplementos`)
3. Abra o **Prompt de Comando** nessa pasta e rode:
   ```
   npm install
   npm start        (modo desenvolvimento: janela normal + DevTools)
   npm run kiosk    (modo totem: tela cheia travada)
   ```
4. Para gerar o **instalador .exe**: `npm run dist` → o instalador fica em `dist\`

### Abrir o painel admin
- Teclado: **Ctrl + Shift + A**
- Tela de toque: **toque 5 vezes no logo** da tela inicial
- PIN padrão do admin: **1234** · atendente de exemplo: **0000** → **troque em Configurações!** (cadastre um atendente para cada funcionário e apague o de exemplo)
- O mesmo atalho serve para o atendente: com o PIN dele, o painel abre só com Vendas e o fechamento do caixa.

### Primeira configuração (painel admin → Configurações)
1. Nome da loja, CNPJ e endereço (saem no cupom)
2. **Chave PIX**, nome do recebedor (igual ao do banco) e cidade
3. Escolha a **impressora** do cupom
4. Troque os PINs
5. Em Produtos, apague os produtos de exemplo e cadastre os seus (dá para passar o código no leitor direto no campo)

### Abrir sozinho quando ligar o PC
Depois de instalar com o `.exe`, aperte `Win + R`, digite `shell:startup` e coloque ali um atalho do "Lisufit PDV".

## Identidade visual (Lisufit)
- **Logo**: salve como `renderer/assets/logo.png` (fundo transparente). Sem esse arquivo, aparece o nome em texto.
- **Cores**: no topo de `renderer/styles.css`, bloco `:root` → `--marca`, `--marca-escura`, `--marca-suave`.
- **Fonte**: Rubik (gratuita, licença OFL), embutida em `renderer/assets/fonts/` — funciona offline.
- **Ícones**: Lucide (licença ISC), embutidos em `renderer/icons.js`. O ícone de cada categoria é
  escolhido no painel admin (aba Categorias). Para oferecer mais ícones, adicione em `ICONES_CATEGORIA`.

## Categorias
Painel admin → **Categorias**:
- **Seção** agrupa as categorias no totem (ex.: "Suplementos", "Empório"). Digite uma seção nova para criar outro grupo.
- As setas mudam a ordem em que aparecem no totem.
- Renomear uma categoria muda todos os produtos dela junto.
- Só é possível excluir categoria sem produtos (mude os produtos de categoria antes).
- Categoria sem produto disponível não aparece para o cliente.

## Variações (sabor, frutas, adicionais)
Painel admin → Produtos → Editar → **Variações (opcional)**:
- Cada **grupo** tem nome, mínimo e máximo. Ex.: *Sabor* (mín 1, máx 1), *Frutas* (mín 1, máx 2), *Adicionais* (mín 0, máx 2).
- Cada **opção** pode ter preço extra (ex.: *Dose extra de whey* + R$ 5,00). Deixe em branco para sem custo.
- No totem, tocar (ou passar no leitor) um produto com variações abre a tela "Monte do seu jeito"; o botão só libera quando os grupos obrigatórios estão escolhidos.
- O preço final é recalculado no sistema na hora da venda; as escolhas saem no cupom e no relatório.

## Planilhas (Excel)
- **Produtos › Exportar planilha** gera um `.xlsx` com todos os produtos. Ele serve de modelo: a loja edita no Excel (preço, estoque, produtos novos) e usa **Importar planilha**.
- Antes de gravar, a importação mostra uma prévia com o que é novo, o que vai ser atualizado e quais linhas têm erro, informando o número da linha.
- O produto é encontrado pelo código de barras ou, se não tiver código, pelo nome. Fotos e variações não vão na planilha e continuam como estão.
- **Vendas › Exportar planilha do período** gera um `.xlsx` com duas abas, Vendas e Itens vendidos (com as opções escolhidas), para a gestora.
- Também aceita `.csv` separado por ponto e vírgula.

## Estoque
- Cada produto tem **estoque mínimo** (padrão 3). Abaixo dele, aparece o aviso vermelho no painel e o filtro "Estoque baixo".
- Em Configurações › Pedidos e estoque, defina o que acontece quando o produto acaba: aparece como esgotado, some do totem ou continua vendendo.

## Senha e via de preparo
- Pedido com item **feito na hora** recebe uma **senha** (o número da venda). Ela aparece na tela final e no cupom do cliente.
- Quando o pedido é pago, sai uma **via de preparo** com a senha, os itens e as opções (sabor, frutas). No "pagar no balcão", a via só sai quando o atendente marca como pago.
- Pedidos "pagar no balcão" esquecidos podem ser cancelados sozinhos (15 min, 30 min, 1 h ou no dia seguinte). O padrão é nunca cancelar.

## Atendentes e fechamento do caixa
- **Atendentes** (Configurações › Atendentes): cada funcionário tem nome e PIN próprio. O PIN é guardado embaralhado (hash), nunca em texto.
- Fica registrado na venda quem confirmou o PIX ou o cartão, quem marcou como pago e quem cancelou. Para ver, passe o mouse em "por Fulano" na lista de vendas.
- Atendente pode cancelar pedido não pago. Venda já paga só o admin cancela, a não ser que a opção "Atendente pode cancelar venda já paga" esteja ligada.
- **Fechar o caixa de hoje** (aba Vendas) mostra os totais de PIX, cartão e balcão, aceita uma observação, imprime o fechamento e faz backup.
- Se ninguém fechar, o caixa fecha sozinho no horário configurado (padrão 22:00). Se o computador estava desligado, o dia esquecido é fechado quando o sistema abrir.
- Vendas feitas depois do fechamento entram no dia seguinte.

## Onde ficam os dados
`%APPDATA%\Lisufit PDV\dados.json` (e as fotos em `imagens\`). O **backup automático** grava uma cópia por dia em `backups\` (guarda 30 dias). Em Configurações dá para apontar a pasta para o OneDrive ou o Google Drive, assim a cópia também vai para a nuvem.

## Estrutura do código
```
src/main.js      processo principal: janela quiosque, impressão, comunicação com o banco
src/preload.js   ponte segura entre a tela e o sistema (window.pdv)
src/db.js        banco local em JSON (produtos, vendas, configurações) — valores em centavos
src/pix.js       gera o PIX Copia e Cola / QR (padrão do Banco Central)
src/fiscal.js    ponto único de integração com a nota fiscal
renderer/        telas: index.html, styles.css, app.js (cliente), admin.js (painel), util.js
```

## Limitações importantes (leia)
- **PIX**: o QR é estático. O sistema não consegue saber sozinho se o dinheiro caiu — por isso o
  atendente confirma com PIN após ver no app do banco. Para confirmação automática é preciso internet
  e a API PIX do seu banco (Mercado Pago, Inter, Efí etc.) — dá para adicionar depois.
- **Cartão**: a maquininha é avulsa, então o valor é digitado nela e o atendente confirma com PIN.
  Integração direta (TEF) depende do modelo/adquirente.
- **Nota fiscal**: por enquanto o sistema imprime **cupom não fiscal**. A integração com o equipamento
  fiscal fica em `src/fiscal.js`; o modo "pasta" já exporta cada venda paga em JSON para um
  emissor/integrador ler. A integração direta depende do modelo do equipamento e da sua contabilidade.
