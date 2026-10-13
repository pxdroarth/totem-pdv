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
- PIN padrão do admin: **1234** · PIN padrão do atendente: **0000** → **troque em Configurações!**

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

## Onde ficam os dados
`%APPDATA%\Lisufit PDV\dados.json` (e as fotos em `imagens\`). Use o botão **Fazer backup** com frequência (pendrive).

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
