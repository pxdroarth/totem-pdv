# Instalação da Lisufit (meta: terça, 03/11/2026)

Configuração tirada do formulário respondido pela loja. Itens com **(falta)** dependem de resposta da Lívia. Impressora: **(falta: marca e modelo)**.

## Plano até terça

| Quando | O quê |
|---|---|
| Sáb/dom (31/10–01/11) | Lívia manda as respostas pendentes, a planilha de produtos e as fotos renomeadas. Comprar o **leitor de código de barras**. |
| Seg (02/11) | Instalar no Dell, importar planilha e fotos, configurar tudo abaixo, imprimir um cupom de teste. |
| Ter (03/11) | PIX real de R$ 1 e um cartão de teste, 15 min de treino com os atendentes, colocar no ar. |

Sem o leitor o totem funciona pelo toque: o cliente acha o produto pela categoria ou pela busca.

## Instalar no Dell (tela de toque: sim)

1. Ligue o Dell na internet (cabo) e faça o login no Windows.
2. Copie `instalar.bat` e `scripts\instalar.ps1` para a mesma pasta no Dell (pendrive) e dê **dois cliques no `instalar.bat`**. Aceite o pedido de administrador.
3. Quando abrir a janela do GitHub, entre com a conta que tem acesso ao repositório.
4. Espere o resumo "Instalação concluída!", que leva de 5 a 15 minutos. Ele instala Git, Node.js, o sistema e as bibliotecas, cria os atalhos, faz o sistema abrir sozinho ao ligar o PC e tira a suspensão.
5. Impressora: instalar o driver **(falta: marca e modelo)**.
6. Reinicie o Dell e confira se o totem abre sozinho.

## Admin › Configurações

**Loja**
- Nome: Lisufit · Endereço: R. Cel. Bia, 2597 – Cascavel/CE · CNPJ: em branco (ainda não tem)
- (O formulário dizia 2626; a mensagem do Pedro, 2597. Confirmar o número.)

**Gateway de pagamento**
- Formas no totem: **PIX** ✓ · **Cartão** ✓ · **Pagar no caixa** ✓ (é por onde entra o **dinheiro**: o atendente recebe no balcão, escolhe Dinheiro/PIX/Cartão e o sistema calcula o troco)
- PIX: **Manual** · Cartão: **Manual** (veja "Pagamento automático" abaixo)
- "Se o gateway falhar, o atendente pode confirmar com PIN": ✓

**PIX com QR fixo**
- Chave: liviarachelribeiro@gmail.com (tipo e-mail, Nubank) · Nome do recebedor: **(falta: nome completo da titular)** · Cidade: Cascavel

**Segurança e pagamento**
- PIN do admin: trocar o 1234 (só a Lívia entra no painel). Enquanto for o de fábrica, aparece um aviso vermelho. O PIN fica guardado só como código embaralhado, e 5 PINs errados seguidos bloqueiam o painel por 5 minutos.
- Exigir PIN do atendente para confirmar PIX e cartão: ✓ (necessário no modo manual)

**Atendentes** (um PIN diferente para cada um; apagar o "Atendente" de exemplo)
- Lívia Rachel · Suzana Rhayna · Ednardo Nogueira · Aline Ribeiro
- Atendente pode cancelar venda já paga: ✗ (só a gerente ou a dona)

**Fechamento e backup**
- Fechar o caixa sozinho às **20:30** (seg–sex até 20h, sábado até 14h)
- Backup automático: ✓ na pasta padrão. A loja não tem Google Drive nem OneDrive: copiar a pasta de backups num pendrive uma vez por semana.

**Pedidos e estoque**
- Controlar estoque: ✗ (a loja não vai controlar por enquanto; nada fica esgotado)
- Totem pergunta o nome do cliente: ✓ · Comer aqui ou levar: ✓
- Tela de pedidos no 2º monitor: ✗ (não terão) · Via de preparo impressa com a senha: ✓
- Pedido "pagar no balcão": fica em Vendas › Pedidos aguardando; o atendente toca em **Marcar como pago** e escolhe como recebeu

**Nota fiscal**
- Integração: **Desativada**. Sem CNPJ ainda, o totem sai com cupom não fiscal. Regularizar com o contador.

## Produtos (200 a 500, a maioria com código de barras)

1. **Produtos › Planilha › Baixar modelo em branco** e mandar para a loja. A Lívia preenche e você usa **Importar planilha**.
2. **Produto com vários sabores** (ex.: Whey Isolado Pro Fit): uma linha por sabor, com o **mesmo nome**, a coluna **Sabor** e o código de barras daquela embalagem. No totem vira um produto só. Passar a embalagem no leitor já entra no sabor certo.
3. **Fotos:** nome do arquivo = código de barras (ou nome do produto) › **Produtos › Importar fotos**. O sistema reduz e converte sozinho.
4. **Carnes congeladas:** pacote com preço fixo, cadastro normal com código de barras.
5. **Shakes, smoothies e sorvete montado na hora:** marcar "feito na hora" e cadastrar as variações.
   - **Shake Protein Premium** (cardápio recebido): sabores Morango, Chocolate, Cookies, Maracujá e Manga, Supercoffee e Pink Lemonade. **(falta: preço e tamanho do copo; o cardápio não traz)**
   - Sorvete montado na hora: **(falta: sabores, coberturas e preços)**
6. **Salgados (prontos na vitrine):** marcar "feito na hora" para saírem na via de preparo, já que o pedido é **entregue na mesa**.
7. **Combos e kits:** cadastrar como produto próprio com o preço do kit (ex.: "Kit Whey + Coqueteleira").

Entrega na mesa: o atendente chama pelo nome do cliente (confirmado; não precisa número da mesa).

### Empório (já vem cadastrado)
- O sistema abre com os 28 produtos do Empório, com foto, e o Shake Protein Premium com os 6 sabores e ingredientes. Não precisa importar planilha nem fotos do Empório.
- Os preços são **de exemplo**. Quando a Lívia mandar os preços: digitar na tabela de Produtos (Enter salva) ou preencher `Produtos Emporio Lisufit.xlsx` e importar. O aviso amarelo some quando não sobrar nenhum preço de exemplo.
- Confira os nomes que eu deduzi pela foto, principalmente **Caldo de Mocotó**, **Guaraná Natural 300ml** e **Folhado de Presunto e Queijo**.
- Os suplementos: **Produtos › Planilha › Baixar modelo em branco**, mandar para a loja e importar de volta.

## Decisões de 01/11

- **Granel:** fora do sistema (sem integração com balança). Continua sendo vendido no balcão como hoje.
- **Carnes:** congeladas, pacote de preço fixo: cadastro normal.
- **Validade e alérgenos:** a loja controla por fora; os alérgenos estão nas embalagens.
- **Queda de energia:** o totem fica parado e a loja vende no balcão, fora do sistema. Ao voltar, o sistema abre sozinho (atalho no `shell:startup`) com os dados até a última venda gravada.
- **Privacidade:** o nome do cliente serve só para chamar o pedido e é apagado das vendas depois de 30 dias.

## Indicadores e fluxo de caixa

**Admin › Indicadores:** faturamento, vendas, ticket médio, cancelamentos e tempo médio de preparo, comparando com o período anterior; fluxo de caixa com as entradas de cada dia por Dinheiro, PIX e Cartão e o acumulado; vendas por hora; faturamento por seção e categoria; mais vendidos. Filtros: hoje, 7 dias, 30 dias, este mês ou datas.

## Se algo der errado

- **Restaurar backup:** Admin › Configurações › Fechamento e backup › Restaurar um backup. O estado de antes fica guardado na pasta `seguranca` dos backups.
- **Registro de erros:** `%APPDATA%\Lisufit PDV\logs\erros-AAAA-MM.log` (impressora, pagamento, backup, PIN bloqueado).

## Fica para depois da inauguração

- **Pagamento automático:** a loja quer, mas não fica pronto até terça.
  - **A maquininha é Mercado Pago (Point Pro 3, S/N 1733216565)** e o conector já está pronto (cartão e PIX na maquininha). Não precisa de homologação: é criar uma aplicação na conta Mercado Pago da loja e colar o Access Token. Passo a passo em `docs/MERCADO-PAGO.md`. Dá até para ligar antes da inauguração.
  - PIX: pela Point, o QR aparece na maquininha e o dinheiro cai no Mercado Pago (precisa de chave PIX cadastrada lá). O QR fixo do Nubank continua como plano B no modo manual.
  - Se um dia a loja trocar para Stone, o conector dela também existe (`docs/STONE.md`).
  - Até lá, o atendente confirma com o PIN.
- **Cupom de desconto e programa de fidelidade:** ainda não existem no sistema.
- **Relatório diário por e-mail:** por enquanto, exportar a planilha do dia em Admin › Vendas.
- **NFC-e e CPF na nota:** dependem de CNPJ, inscrição estadual, contador, certificado A1 e código CSC.
