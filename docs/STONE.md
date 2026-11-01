# Stone: ligar a maquininha integrada

O conector já está pronto e testado (`src/pagamentos/provedores/stone.js`, teste em `testes/e2e/stone.js` contra uma API falsa da Pagar.me). Falta só a Stone liberar o acesso.

## Como vai funcionar na loja

1. O cliente escolhe **Cartão** no totem e toca em **Crédito** ou **Débito** (ou a loja fixa um deles).
2. O valor aparece sozinho na maquininha Stone ao lado do totem. O cliente passa ou aproxima o cartão.
3. No **PIX**, o QR Code aparece **na maquininha** e o cliente paga com o app do banco.
4. O totem confirma sozinho, grava NSU, autorização e bandeira na venda e imprime o cupom.

Se a Stone ou a internet cair, o totem volta para o modo manual: maquininha avulsa ou QR fixo, com o atendente confirmando por PIN.

> **PIX pela Stone:** o dinheiro do PIX cai na conta Stone, não no Nubank. Se a loja quiser manter o PIX no Nubank, deixe em Configurações › PIX = **Manual** e só o cartão = **Stone**.

## O que pedir à Stone

**O Pedro (desenvolvedor / parceiro):**
- [ ] Cadastro no **Stone Partner Program** (programa de parceiros), como integrador do sistema da Lisufit.
- [ ] O **ServiceRefererName**: o ID de parceiro que vai em todas as chamadas.
- [ ] Acesso ao **Dashboard da Pagar.me de testes** e a chave **sk_test_...**.
- [ ] O **roteiro de homologação**: a Stone manda os casos de teste para preencher antes da produção.
- [ ] Pergunte se aceitam **consulta do pedido a cada 3 s** em vez de webhook. O totem fica na loja, sem endereço na internet para receber webhook. A Stone recomenda webhook e diz que a consulta tem limite. Se exigirem webhook, a saída é um pequeno serviço na nuvem que recebe o webhook e o totem consulta esse serviço.

**A Lívia (lojista):**
- [ ] Conta Stone com **Stone Connect / maquininha integrada** liberada. Peça ao gerente comercial Stone.
- [ ] Maquininha **S920 ou Q92**, com o app de pagamentos **6.4 ou mais novo**, para o PIX direto.
- [ ] **PIX habilitado** na conta Stone, se o PIX for pela maquininha.
- [ ] A **Secret Key de produção** (`sk_...`): Dashboard da Pagar.me › Desenvolvimento › Chaves.
- [ ] O **número de série** da maquininha (etiqueta atrás dela).

## Configurar no totem

Admin › Configurações › Gateway de pagamento:

| Campo | O que colocar |
|---|---|
| PIX | Stone (ou Manual, para continuar no Nubank) |
| Cartão | Stone |
| Secret Key | `sk_test_...` na homologação; `sk_...` na loja |
| ServiceRefererName | o ID de parceiro que a Stone deu |
| Número de série | da etiqueta da maquininha |
| Cartão | Cliente escolhe crédito ou débito / sempre crédito / sempre débito |
| Comprovante na maquininha | Não (o totem já imprime) |

Depois: **Testar conexão**. Ele avisa se a chave é de TESTE ou PRODUÇÃO. Faça uma venda de R$ 1,00 de cada tipo (crédito, débito, PIX) e cancele na maquininha em seguida.

## O que o conector faz (para a homologação)

| Caso | Comportamento |
|---|---|
| Venda | `POST /orders` com pedido direto: `closed: false`, `poi_payment_settings` com o número de série, `payment_setup` (`credit` à vista, `debit` ou `pix`), `code` único por tentativa |
| Acompanhamento | `GET /orders/{id}` a cada 3 s enquanto a tela espera (3 min no cartão, 5 min no PIX) |
| Aprovado | Lê `charges[].last_transaction` (NSU, autorização, bandeira) e **fecha o pedido**: `PATCH /orders/{id}/closed` com `paid` |
| Cliente desistiu / tempo acabou | Confere o pedido de novo; se não foi pago, `PATCH /closed` com `canceled` (sai da maquininha) |
| Pago depois que o cliente saiu | Não cancela e grava um aviso no registro de erros, para conferir e estornar pela maquininha ou pelo Portal Stone |
| Cartão recusado | O pedido continua aberto na maquininha e o cliente pode tentar outro cartão |
| Estorno de venda paga | Não tem rota na API: é feito na maquininha ou no Portal Stone |
| Sem internet / Stone fora | Modo manual com PIN, se "permitir manual se falhar" estiver ligado |

Documentação: <https://connect-stone.stone.com.br/reference>
