# Testes

Abrem o sistema de verdade (Electron) numa pasta de dados limpa e usam como a loja usaria.

```
npm install
npm test                 # Windows / Mac
xvfb-run -a npm test     # Linux sem tela
```

| Arquivo | O que confere |
|---|---|
| `e2e/caixa-indicadores.js` | PIN do admin só como hash e bloqueio após 5 erros, dinheiro no balcão com troco, fluxo de caixa, indicadores, restaurar backup, registro de erros |
| `e2e/catalogo-carregar.js` | Botão "Carregar catálogo da loja" numa instalação antiga: cadastra o que falta, põe foto, não duplica nem muda preço |
| `e2e/catalogo-admin.js` | Catálogo do Empório já cadastrado com fotos, preço de exemplo, filtros, preço rápido, ações em massa, duplicar, modelo de planilha |
| `e2e/sabores-pagamentos.js` | Produto com vários sabores e código por sabor, formas de pagamento do totem, estoque desligado |

Prints e arquivos de cada teste ficam em `%TEMP%/lisufit-pdv-testes` (ou `PDV_TESTE_SAIDA`). Rode antes de cada versão nova.
