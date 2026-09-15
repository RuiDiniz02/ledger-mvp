# Etapa 1 — perceber onde está o dinheiro

15 de setembro de 2026.

## Decisão de produto

O Ledger continua a ser uma app de controlo de orçamento. Para a pessoa com dinheiro espalhado por várias apps, acrescentámos uma única entrada no Resumo: **O meu dinheiro**. Os saldos são uma visão complementar ao plano mensal. Não há novos separadores, integração bancária, gráficos de rentabilidade nem configuração obrigatória adicional.

## O que foi implementado

- Adicionar uma app ou conta pelo nome, saldo em euros e finalidade: para despesas, guardado ou investido.
- Reservar parte do dinheiro dentro de uma conta para despesas, sem criar uma segunda conta artificial.
- Consultar o total registado e a sua separação pelas três finalidades.
- Atualizar o saldo quando se confirma o valor na app original. Uma alteração apenas ao nome ou à finalidade não renova a data de confirmação.
- Mostrar a idade de cada saldo e assinalar saldos sem confirmação há sete dias.
- Ocultar contas de forma reversível. As contas ocultas ficam fora dos totais e continuam incluídas nos backups.
- Evitar nomes ativos repetidos por engano, valores malformados e reservas maiores do que o saldo. Saldos negativos são permitidos nas contas para despesas e reduzem o total.
- Incluir as contas na exportação/importação e no resumo do backup a restaurar.
- Retirar da interface cartões de funcionalidades futuras indisponíveis. O separador de preferências chama-se agora Definições.
- Explicar no último passo do onboarding que reunir saldos é opcional; mantém-se o mesmo número de passos.

## Regras para não duplicar dinheiro

Exemplo: Revolut 800 €, dos quais 300 € guardados; cartão cashback 200 €; investimentos 4.500 €.

| Medida | Valor |
|---|---:|
| Para despesas | 700 € |
| Guardado | 300 € |
| Investido | 4.500 € |
| Total registado | 5.500 € |

Os 300 € guardados são parte dos 800 €, não um valor adicional. Os fundos virtuais do orçamento também não são adicionados ao total das contas. Investimentos e cashback ainda não creditado não aumentam o dinheiro registado para despesas.

**Para despesas não significa que se deva gastar todo esse saldo.** Ainda podem existir contas por pagar. A estimativa diária continua baseada no orçamento e nas despesas registadas. Os saldos manuais não alteram automaticamente essa estimativa.

Atualizar um saldo substitui a fotografia anterior. Não cria rendimento, despesa nem transferência. Registar uma despesa também não atualiza os saldos nesta etapa. Depois de transferir entre apps, devem confirmar-se os dois saldos, sem registar essa transferência como despesa.

Esta separação é deliberada: sem associar movimentos às contas e reconciliar os valores, usar os saldos manuais no cálculo diário poderia descontar a mesma despesa duas vezes ou anunciar dinheiro que já foi gasto.

## Compatibilidade e verificação

Schema 4. A migração de v3 cria uma lista vazia de contas e preserva integralmente categorias, orçamentos, despesas e preferências. A migração de v2 continua a passar por v3. Nunca se convertem poupanças virtuais em saldos bancários presumidos.

109 testes automatizados, incluindo agregação, reservas, saldos negativos, arquivo, validade dos dados, migração, backups e independência do orçamento. Verificação TypeScript e build de produção. Teste no navegador com saldos de exemplo: reserva inválida bloqueada, soma correta, classificação de investimentos, ocultar/repor e recarregar. Inspeção visual a 390 × 844.

## Próximo passo pequeno

Depois de validar este painel com os saldos reais, a próxima etapa deverá ligar uma despesa à conta usada, com a última conta selecionada por defeito. Para essa ligação ser fiável, precisa também de uma forma simples de registar transferências e confirmar saldos sem voltar a descontar movimentos já incluídos. O fluxo principal de despesa deve continuar rápido.

Só depois dessa reconciliação faria sentido limitar a estimativa diária pelo dinheiro disponível nas contas. A ligação bancária fica para uma etapa posterior; não é necessária para experimentar esta primeira melhoria.
