# Mercado Pago: ligar a Point integrada

A maquininha da Lisufit é uma **Point Pro 3**, compatível com a integração de PDV do Mercado Pago. O conector já está pronto e testado (`src/pagamentos/provedores/mercadopago.js`; teste em `testes/e2e/mercadopago.js`).

**Não precisa de homologação nem de cadastro como parceiro**, ao contrário da Stone. Basta criar uma aplicação **na conta Mercado Pago da loja**: o dinheiro cai na conta dona do Access Token.

## Como vai funcionar na loja

1. O cliente escolhe **Cartão** no totem e toca em **Crédito** ou **Débito**.
2. O valor aparece sozinho na Point. O cliente passa ou aproxima o cartão.
3. No **PIX**, o QR Code aparece **na Point** e o cliente paga com o app do banco. O dinheiro cai no Mercado Pago, e precisa ter **chave PIX cadastrada** na conta.
4. O totem confirma sozinho, grava a referência e a bandeira na venda e imprime o cupom.
5. Cartão recusado: o totem mostra o motivo (ex.: saldo insuficiente) e oferece tentar de novo.

Se o Mercado Pago ou a internet cair, o totem volta para o modo manual: a Point vira maquininha avulsa ou o QR fixo do PIX, com o atendente confirmando por PIN.

## Passo a passo (uns 15 minutos, com a Lívia logada)

**No app Mercado Pago (celular da Lívia):**
- [ ] Confirmar que a Point está **vinculada a uma loja e a um caixa** (Seu negócio › Lojas e caixas). Cada caixa aceita uma maquininha.
- [ ] Ter uma **chave PIX** cadastrada na conta Mercado Pago, para o PIX na maquininha.
- [ ] Atualizar o app da Point, se pedir.

**No site [Mercado Pago Developers](https://www.mercadopago.com.br/developers/panel/app), logado na conta da Lisufit:**
- [ ] **Suas integrações › Criar aplicação**: nome "Totem Lisufit"; tipo de solução: pagamentos presenciais / Point.
- [ ] Abrir a aplicação › **Credenciais de produção** › copiar o **Access Token** (`APP_USR-...`).

> O Access Token dá acesso à conta. Passe por mensagem direta, nunca em grupo ou e-mail aberto, e cole só no totem.

**No totem (Admin › Configurações › Gateway de pagamento):**

| Campo | O que colocar |
|---|---|
| PIX | Mercado Pago (Point integrada) |
| Cartão | Mercado Pago (Point integrada) |
| Access Token | o `APP_USR-...` |
| Número de série | o S/N da etiqueta atrás da Point |
| Cartão | Cliente escolhe crédito ou débito |
| Comprovante na maquininha | Não (o totem já imprime) |

Depois: **Testar conexão**. Ele procura a Point pelo número de série e, se ela não estiver no **modo PDV**, coloca nesse modo. Se avisar, **desligue e ligue a Point**. Na Point, em Mais opções › Configurações › Modo de vinculação, deve aparecer "Ponto de Venda (PDV)".

Por fim, faça uma venda de R$ 1,00 no crédito, uma no débito e uma no PIX, e estorne pelo app Mercado Pago.

> No modo PDV, a Point recebe as cobranças do totem. Para cobrar avulso nela, volte o modo de vinculação no app.

## O que o conector faz

| Caso | Comportamento |
|---|---|
| Achar a maquininha | `GET /terminals/v1/list`; o id da Point é `TIPO__SERIAL`, achado pelo S/N |
| Modo PDV | `PATCH /terminals/v1/setup` com `operating_mode: PDV` no "Testar conexão" |
| Venda | `POST /v1/orders`, `type: point`, valor em reais com 2 casas, `default_type` `credit_card` (à vista), `debit_card` ou `qr` (PIX), `X-Idempotency-Key` por tentativa |
| Acompanhamento | `GET /v1/orders/{id}` a cada 3 s enquanto a tela espera; `processed` = aprovado |
| Recusado | `failed`: o motivo (`status_detail`) aparece em português para o cliente |
| Desistência / tempo | Confere a order; se não foi paga, `POST /v1/orders/{id}/cancel` com `x-allow-cancelable-status: at_terminal` |
| Pago depois que o cliente saiu | Não cancela e grava um aviso no registro de erros, para conferir |
| Estorno | Pelo app ou pelo painel do Mercado Pago (o totem não estorna sozinho) |

O Mercado Pago recomenda webhook em vez de consultas repetidas. O totem não tem endereço público na internet, então consulta só enquanto espera, a cada 3 s. Se um dia for preciso webhook, a saída é um pequeno serviço na nuvem (Cloudflare Workers, gratuito) que recebe o aviso, e o totem consulta esse serviço.

Documentação: <https://www.mercadopago.com.br/developers/pt/docs/mp-point/overview>
