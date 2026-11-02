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
**Recomendado para o totem: rodar pela pasta do GitHub.** Assim dá para atualizar pelo botão do painel e voltar de versão se precisar.
1. Instale o **Node.js LTS** (https://nodejs.org) e o **Git** (https://git-scm.com).
2. No Prompt de Comando:
   ```
   cd C:\
   git clone https://github.com/pxdroarth/lisufit-pdv.git
   cd lisufit-pdv
   npm install
   ```
3. Para abrir em modo totem, dê dois cliques em **`iniciar-totem.bat`**.
4. Para abrir sozinho quando ligar o PC, aperte Win+R, digite `shell:startup` e coloque ali um atalho para o `iniciar-totem.bat`.

Outros comandos: `npm start` abre em modo desenvolvimento (janela normal com DevTools). `npm run dist` gera o instalador .exe em `dist\`, mas com o instalador o botão de atualizar não funciona.

## Atualizar o sistema (1 clique)
- Você sobe a versão nova no GitHub (`git push`). No totem, abra **Admin › Configurações › Atualização do sistema**.
- A tela mostra a versão instalada e a lista do que mudou (as mensagens dos commits). **Atualizar agora** copia os dados, baixa a versão nova e reinicia.
- **Voltar para a versão anterior** desfaz a última troca, se algo não ficar bom. Dá para desfazer a volta também.
- Se as bibliotecas mudaram, ele roda o `npm install` sozinho. Se isso falhar, continua na versão que estava.
- Se alguém mexeu nos arquivos da pasta à mão, a atualização é cancelada para não apagar nada.
- Os dados da loja ficam em outra pasta (`%APPDATA%`), então trocar de versão não mexe neles. Mesmo assim, uma cópia é feita antes, em `backups\antes-da-atualizacao-*.json`.

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
5. Em Produtos, confira os preços: o sistema já abre com o catálogo do Empório (28 produtos com foto) e **preços de exemplo**, marcados com o selo "exemplo" até serem confirmados. Os suplementos entram pela planilha.

### Abrir sozinho quando ligar o PC
Aperte `Win + R`, digite `shell:startup` e coloque ali um atalho do `iniciar-totem.bat` (ou do "Lisufit PDV", se usou o instalador .exe).

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

## Gateway de pagamento (plugável)
- Em **Configurações › Gateway de pagamento** você escolhe quem confirma o **PIX** e quem confirma o **cartão**. Podem ser gateways diferentes.
- **Manual** (padrão) funciona como sempre: QR fixo e maquininha avulsa, com o atendente confirmando por PIN.
- Com um gateway, o PIX sai com QR dinâmico e o valor do cartão vai direto para a maquininha. A tela confirma sozinha, sem PIN.
- Se o pagamento for recusado ou o tempo acabar, o cliente pode tentar de novo. Se o gateway estiver fora do ar, o totem volta para o modo manual (dá para desligar isso).
- O **Simulador** aprova ou recusa sozinho e serve para testar e demonstrar para os donos. Enquanto estiver ligado, aparece o selo "Modo teste".
- Para integrar Mercado Pago, Stone, PagBank, Cielo etc.: **um arquivo novo** em `src/pagamentos/provedores/`. Veja `docs/INTEGRAR-GATEWAY.md`.

## Maquininha integrada (Mercado Pago e Stone)
- **Mercado Pago (Point Smart, Pro 2, Pro 3):** conector em `src/pagamentos/provedores/mercadopago.js` (API Orders, modo PDV). O valor vai direto para a Point; crédito, débito e PIX no QR da maquininha. Sem homologação: veja `docs/MERCADO-PAGO.md`. É o da Lisufit.
- **Stone:** conector em `src/pagamentos/provedores/stone.js` (Stone Connect 2.0, precisa de cadastro de parceiro e homologação). Veja `docs/STONE.md`.

## Produto com vários sabores (código de barras por sabor)
- Ex.: Whey Isolado Pro Fit em Chocolate, Baunilha e Cookies, cada um com a própria embalagem. No totem aparece **um card só**, e o cliente escolhe o sabor.
- No cadastro (Variações), cada opção do grupo "Sabor" pode ter o **código de barras** da embalagem. Passar a embalagem no leitor já adiciona aquele sabor, sem abrir a tela de escolha.
- Na planilha: **uma linha por sabor**, com o mesmo nome e a coluna **Sabor**. Na importação elas viram um produto só. Se um sabor custar mais, o preço da linha vira o adicional. A exportação faz o caminho de volta.
- O sistema não deixa o mesmo código de barras em dois produtos ou sabores.

## Ajustes da loja
- **Formas de pagamento no totem** (Configurações › Gateway de pagamento): escolha entre PIX, Cartão e Pagar no caixa. A forma desligada some do totem e o sistema recusa.
- **Controlar estoque** (Configurações › Pedidos e estoque): desligado, nenhum produto fica esgotado e as vendas não baixam estoque.
- Configuração da Lisufit: `docs/INSTALACAO-LISUFIT.md`.

## Fotos dos produtos
- Qualquer foto que você escolher (JPEG, PNG, WebP, GIF, foto grande de celular) é **reduzida e convertida sozinha** para WebP leve, com no máximo 800 px de lado. A rotação das fotos de celular é respeitada e PNG transparente continua transparente.
- **Produtos › Importar fotos:** escolha várias fotos de uma vez (por exemplo, do pendrive). O **nome do arquivo** diz de qual produto é a foto: o código de barras (`7891234567890.jpg`, aceita "(1)" no nome) ou o nome do produto (`Smoothie Proteico 400ml.jpg`, útil para itens sem código).
- Antes de aplicar, uma prévia mostra quantas fotos têm produto, quais ficam de fora e se alguma vai substituir uma foto que já existe.
- Fotos HEIC do iPhone não abrem. Mandadas pelo WhatsApp, elas já chegam convertidas em JPEG.
- Sugestão: a loja manda as fotos pelo WhatsApp normal, você salva no seu computador e leva para o totem num pendrive. Não precisa abrir o WhatsApp Web no totem.

## Catálogo inicial do Empório
- Na primeira vez que o sistema abre (base nova), já entram os 28 produtos do Empório com foto, categoria e o Shake Protein Premium com os 6 sabores e ingredientes. Ficam em `src/catalogo/` (lista em `emporio.js`, fotos em `fotos/`).
- Os preços são **de exemplo**. No admin, o aviso amarelo e o filtro **Preço de exemplo** mostram quais faltam. O selo some quando o preço é digitado na tabela, confirmado com Enter, confirmado em massa ou importado pela planilha.
- Para demonstração e testes automáticos há os produtos fictícios de suplementos: abra com `PDV_CATALOGO=exemplo`.

## Lista de produtos no admin
- **Filtros:** categoria e situação (preço de exemplo, sem foto, ocultos do totem, estoque baixo, esgotados).
- **Preço direto na tabela:** digite e aperte Enter. A chave **No totem** mostra ou esconde o produto na hora.
- **Ações em massa:** marque vários (ou todos do filtro, no quadrado do cabeçalho) e use mostrar, ocultar, confirmar preço, mudar categoria ou excluir.
- **Duplicar:** abre um produto novo com a foto, a categoria e as variações do original (útil para tamanhos, ex.: 300ml/500ml). Os códigos de barras ficam em branco.
- Com o controle de estoque desligado, a coluna Estoque some da tabela.

## Planilhas (Excel)
- **Produtos › Planilha › Baixar modelo em branco** gera o modelo com as colunas, 4 linhas de exemplo em cinza (começam com "(exemplo)" e são ignoradas ao importar) e a aba "Como preencher".
- **Exportar produtos cadastrados** gera um `.xlsx` com todos os produtos, no mesmo formato: a loja edita no Excel (preço, estoque, produtos novos) e usa **Importar planilha**.
- Produto que já está no sistema e não aparece na planilha continua como está.
- Antes de gravar, a importação mostra uma prévia com o que é novo, o que vai ser atualizado e quais linhas têm erro, informando o número da linha.
- O produto é encontrado pelo código de barras ou, se não tiver código, pelo nome. Fotos e variações não vão na planilha e continuam como estão.
- **Vendas › Exportar planilha do período** gera um `.xlsx` com duas abas, Vendas e Itens vendidos (com as opções escolhidas), para a gestora.
- Também aceita `.csv` separado por ponto e vírgula.

## Indicadores e fluxo de caixa
- **Admin › Indicadores** (só o admin): faturamento, vendas pagas e ticket médio comparados ao período anterior, cancelamentos, tempo médio de preparo, fluxo de caixa diário (entradas por Dinheiro, PIX e Cartão, com acumulado), vendas por hora, faturamento por seção e categoria e os 10 mais vendidos.
- **Dinheiro:** entra pela forma "Pagar no caixa". Em Vendas › Marcar como pago, o atendente escolhe Dinheiro, PIX ou Cartão; no dinheiro, digita o valor recebido e vê o troco. O fechamento mostra o **dinheiro que deve estar na gaveta**.

## Segurança e continuidade
- O PIN do admin fica gravado só como hash; o campo em Configurações fica em branco (em branco = mantém o atual). Enquanto for 1234, aparece um aviso.
- 5 PINs errados seguidos (painel ou confirmação de pagamento) bloqueiam novas tentativas por 5 minutos.
- **Restaurar backup** pela tela, em Configurações. Antes, o estado atual é copiado para `backups/seguranca`.
- Erros de impressora, pagamento, nota fiscal, backup e bloqueio de PIN vão para `logs/erros-AAAA-MM.log`, na pasta de dados.
- O nome do cliente é apagado das vendas depois de 30 dias.

## Testes
`npm test` (no Linux sem tela: `xvfb-run -a npm test`) abre o sistema de verdade e confere os fluxos principais. Detalhes em `testes/README.md`.

## Estoque
- Cada produto tem **estoque mínimo** (padrão 3). Abaixo dele, aparece o aviso vermelho no painel e o filtro "Estoque baixo".
- Em Configurações › Pedidos e estoque, defina o que acontece quando o produto acaba: aparece como esgotado, some do totem ou continua vendendo.

## Nome do cliente e comer aqui/levar
- Em Configurações › Pedidos e estoque, ligue "Totem pergunta o nome do cliente" e/ou "comer aqui ou levar".
- Antes de pagar, o totem mostra um teclado na tela para o nome e dois botões grandes (Comer aqui / Para levar).
- O nome e o "para levar" saem no cupom, na via de preparo, na tela final ("Pedro, retire seu cupom…") e na tela de pedidos.

## Tela de pedidos (preparo)
- Aba Vendas › **Tela de pedidos** abre uma janela para quem prepara. Com um 2º monitor ou TV ligado, ela vai para lá em tela cheia. Para abrir sempre junto com o sistema, há uma opção nas Configurações.
- Aparecem os pedidos **pagos** que têm item feito na hora, com senha, nome, "para levar" e as opções (sabor, frutas). Toca um aviso quando chega pedido novo.
- O cartão fica amarelo depois de 6 minutos e vermelho depois de 10.
- **Pronto** chama a senha: ela vai para "Prontos para retirar", com som e destaque. **Entregue** tira da tela e **Voltar** devolve para preparando.

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
src/catalogo/    catálogo inicial do Empório (lista + fotos) e os produtos fictícios de demonstração
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
