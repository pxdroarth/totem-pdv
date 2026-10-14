# Integrar um gateway de pagamento

O totem já está preparado para trocar de gateway sem mexer nas telas, nas vendas, no cupom ou no fechamento. Cada gateway é **um arquivo** em `src/pagamentos/provedores/`. Depois de criado, ele aparece sozinho em **Admin › Configurações › Gateway de pagamento**.

## Como funciona hoje

| Modo | PIX | Cartão |
|---|---|---|
| **Manual** (padrão) | QR fixo com o valor; o atendente confirma com PIN | Maquininha avulsa; o valor é digitado nela e o atendente confirma com PIN |
| **Simulador** | QR de teste que aprova ou recusa sozinho | Finge mandar o valor para a maquininha |
| **Gateway real** | QR gerado pelo gateway; a tela confirma sozinha | Valor vai direto para a maquininha; a tela confirma sozinha |

PIX e cartão podem usar gateways diferentes. Por exemplo, PIX pelo banco e cartão pela maquininha de outra empresa.

## Passo a passo para um gateway novo

1. Copie `src/pagamentos/provedores/_modelo.js` para `src/pagamentos/provedores/<nome>.js`, sem o `_` na frente.
2. Preencha `id`, `nome`, `suporta` e `campos`. Os campos que você listar são os que aparecem no admin (token, ID da maquininha etc.).
3. Escreva as 5 funções:
   - `testarConexao(cfg)`: confere as credenciais.
   - `criarPix(pedido, cfg)`: devolve `{ id, qrTexto }`.
   - `criarCartao(pedido, cfg)`: manda o valor para a maquininha e devolve `{ id }`.
   - `consultar(id, cfg)`: devolve `{ status, detalhe, nsu, autorizacao, bandeira }`.
   - `cancelar(id, cfg)`: cancela a cobrança que não foi paga.
4. Use o `simulador.js` como exemplo de um gateway que funciona de verdade.
5. Teste com as **credenciais de teste** do gateway antes de usar as de produção.
6. Suba no GitHub e atualize o totem pelo botão do admin.

## Regras que o sistema já garante (não precisa repetir no gateway)

- O valor cobrado é calculado pelo sistema a partir do cadastro de produtos. A tela não consegue mandar outro valor.
- A venda só é gravada se a cobrança estiver **aprovada**, for da **mesma forma** (PIX ou cartão) e do **mesmo valor** do pedido. Cada cobrança vale para **uma** venda só.
- A tela consulta o gateway a cada 2 segundos (`consultar`). Não usamos webhook, porque o totem fica dentro da loja, sem endereço público na internet.
- Se a cobrança não vier com prazo, o PIX expira em 10 minutos e o cartão em 3 minutos. Ao vencer, o sistema chama `cancelar`.
- Se a internet cair por alguns segundos, o sistema continua tentando. Só desiste depois de 10 falhas seguidas.
- Se o gateway estiver fora do ar ao criar a cobrança e a loja permitir, o totem volta para o modo manual (QR fixo ou maquininha avulsa com PIN).
- O cliente pagando pelo celular não é interrompido pelo tempo de inatividade enquanto a cobrança está valendo.
- Os dados da transação (NSU, autorização, bandeira) ficam gravados na venda e saem no cupom.
- As credenciais ficam só nos dados da loja no computador. A tela do cliente nunca recebe essas informações.

## Status que `consultar` deve devolver

| status | quando |
|---|---|
| `pendente` | ainda esperando o cliente pagar |
| `aprovado` | pago; o totem finaliza a venda |
| `recusado` | o banco ou a maquininha recusou; mande o motivo em `detalhe` |
| `cancelado` | alguém cancelou (na maquininha ou pelo `cancelar`) |
| `expirado` | o prazo acabou |

## Anotações sobre os gateways mais comuns

Confira sempre a documentação atual de cada um, porque as APIs mudam.

- **Mercado Pago:** a integração de maquininha (Point) com sistema de PDV é feita pela **API Orders**, que substitui a integração antiga do Point. Você cria uma "order" para a maquininha (pelo ID do terminal) e consulta o status. O PIX também sai pela API, com QR dinâmico. Tem credenciais de teste no painel de desenvolvedor.
- **Cielo:** tem soluções de pagamento integrado (Cielo Conecta, LIO). Verifique qual modelo de maquininha a loja vai ter.
- **Stone e PagBank:** os dois têm integração com PDV. Em geral é preciso pedir a habilitação ao comercial deles.

Antes de fechar com um gateway, pergunte:

1. A maquininha recebe o valor **pela internet (nuvem)**, com o computador mandando para ela, ou precisa de cabo ou Bluetooth?
2. Tem **PIX com QR dinâmico** e consulta de status pela API?
3. Tem **ambiente de teste** (sandbox)?
4. Qual é a **taxa por transação** e há mensalidade de integração?

Fontes consultadas:
- [Como integrar a Point Smart ao seu sistema de gestão (PDV) — Mercado Pago](https://www.mercadopago.com.br/blog/integrar-point-smart-sistema-pdv)
- [Nova API Orders — Mercado Pago Developers](https://www.mercadopago.com.br/developers/pt/docs/mp-point-legacy/overview)
- [Cielo Conecta — Blog Cielo](https://blog.cielo.com.br/produtos-e-servicos/cielo-conecta)
- [Maquininhas com TEF / PDV / gestão comercial em 2026 — Calculadora de Taxas](https://www.calculadoradetaxas.com.br/maquininha-com-tef_pdv)
