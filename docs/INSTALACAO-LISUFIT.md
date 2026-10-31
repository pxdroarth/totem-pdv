# Instalação da Lisufit (meta: terça, 03/11/2026)

Configuração tirada do formulário respondido pela loja. Itens com **(falta)** dependem de resposta da Lívia.

## Plano até terça

| Quando | O quê |
|---|---|
| Sáb/dom (31/10–01/11) | Lívia manda as respostas pendentes, a planilha de produtos e as fotos renomeadas. Comprar o **leitor de código de barras**. |
| Seg (02/11) | Instalar no Dell, importar planilha e fotos, configurar tudo abaixo, imprimir um cupom de teste. |
| Ter (03/11) | PIX real de R$ 1 e um cartão de teste, 15 min de treino com os atendentes, colocar no ar. |

Sem o leitor o totem funciona pelo toque: o cliente acha o produto pela categoria ou pela busca.

## Instalar no Dell (tela de toque: sim)

1. Instalar **Node.js LTS** e **Git**.
2. `git clone https://github.com/pxdroarth/lisufit-pdv.git`, entrar na pasta e rodar `npm install`.
3. Abrir pelo `iniciar-totem.bat`. Para abrir sozinho ao ligar: `Win + R` › `shell:startup` › colar um atalho do `.bat`.
4. Internet: cabo. Impressora: instalar o driver **(falta: marca e modelo)**.

## Admin › Configurações

**Loja**
- Nome: Lisufit · Endereço: Rua Coronel Bia, 2626 **(falta: cidade)** · CNPJ: em branco (ainda não tem)

**Gateway de pagamento**
- Formas no totem: **PIX** ✓ · **Cartão** ✓ · **Pagar no caixa** ✗ (a loja não usa)
- PIX: **Manual** · Cartão: **Manual** (veja "Pagamento automático" abaixo)
- "Se o gateway falhar, o atendente pode confirmar com PIN": ✓

**PIX com QR fixo**
- Chave: liviarachelribeiro@gmail.com (tipo e-mail, Nubank) · Nome do recebedor: **(falta: nome completo da titular)** · Cidade: **(falta)**

**Segurança e pagamento**
- PIN do admin: trocar o 1234 (só a Lívia entra no painel)
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
- Pedido "pagar no balcão": não se aplica (forma desativada)

**Nota fiscal**
- Integração: **Desativada**. Sem CNPJ ainda, o totem sai com cupom não fiscal. Regularizar com o contador.

## Produtos (200 a 500, a maioria com código de barras)

1. **Produtos › Exportar planilha** e mandar como modelo. A Lívia preenche e você usa **Importar planilha**.
2. **Produto com vários sabores** (ex.: Whey Isolado Pro Fit): uma linha por sabor, com o **mesmo nome**, a coluna **Sabor** e o código de barras daquela embalagem. No totem vira um produto só. Passar a embalagem no leitor já entra no sabor certo.
3. **Fotos:** nome do arquivo = código de barras (ou nome do produto) › **Produtos › Importar fotos**. O sistema reduz e converte sozinho.
4. **Carnes congeladas:** pacote com preço fixo, cadastro normal com código de barras.
5. **Shakes, smoothies e sorvete montado na hora:** marcar "feito na hora" e cadastrar as variações (sabor, frutas, coberturas) **(falta: cardápio com preços)**.
6. **Salgados (prontos na vitrine):** marcar "feito na hora" para saírem na via de preparo, já que o pedido é **entregue na mesa**.
7. **Combos e kits:** cadastrar como produto próprio com o preço do kit (ex.: "Kit Whey + Coqueteleira").

Entrega na mesa: hoje o atendente entrega pelo nome do cliente. **(falta: confirmar se ela quer que o cliente digite o número da mesa.)**

## Fica para depois da inauguração

- **Pagamento automático:** a loja quer, mas não fica pronto até terça.
  - Cartão pela Stone: é preciso pedir à Stone a habilitação de integração com o sistema e ter credenciais de teste.
  - PIX: o Nubank não tem integração para confirmar o PIX sozinho; o PIX automático teria que passar por um gateway (Stone ou outro).
  - Até lá, o atendente confirma com o PIN.
- **Cupom de desconto e programa de fidelidade:** ainda não existem no sistema.
- **Relatório diário por e-mail:** por enquanto, exportar a planilha do dia em Admin › Vendas.
- **NFC-e e CPF na nota:** dependem de CNPJ, inscrição estadual, contador, certificado A1 e código CSC.
