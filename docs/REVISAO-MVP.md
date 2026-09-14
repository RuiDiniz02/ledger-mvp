# Ledger — revisão do MVP, 14 de setembro de 2026

## O produto que vale a pena construir

Uma resposta clara a «quanto posso gastar até ao próximo rendimento?», com o mínimo de registos manuais. O resumo deve mostrar o que está disponível, o que já está comprometido e o que precisa de atenção. O orçamento atual é um plano mensal: ainda não é uma representação reconciliada de uma conta bancária.

## Alterações implementadas

### Cálculos

- A estimativa diária deixou de somar apenas os saldos positivos das categorias variáveis. Um excesso numa categoria reduz agora a folga das restantes.
- O valor diário fica limitado pelo orçamento restante depois das contas fixas ainda por pagar, das poupanças e das contribuições libertadas para a reserva de redistribuição.
- O dia atual conta no divisor. O arredondamento é sempre por defeito, ao cêntimo. Meses passados e futuros não mostram uma recomendação para hoje.
- Dinheiro libertado por uma poupança deixa de estar disponível simultaneamente no orçamento e na reserva para redistribuir.
- As sobras transportadas ficam limitadas pela disponibilidade do mês. Um plano excessivo ou contas acima do previsto não podem gerar sobras só porque outra categoria não foi usada.
- O slider edita o objetivo base, sem incorporar novamente os extras já recebidos.
- O gráfico usa a contribuição efetiva da poupança quando o objetivo limita a contribuição. O indicador passou a dizer «usado», porque inclui gastos e poupanças.
- A previsão de uma despesa usa o mês da data escolhida e simula a substituição do registo anterior. Na divisão de despesas, corresponde ao pagamento integral que o modelo atual efetivamente regista.
- Valores monetários malformados deixam de ser interpretados parcialmente como números válidos.

Regra do valor diário, em cêntimos:

```
restante = limite + extras - gastos - poupanças - dinheiro libertado para redistribuir
reservado = soma dos valores positivos de (objetivo fixo - pagamentos registados)
variável líquido = objetivos variáveis - gastos variáveis - gastos sem categoria
para o dia a dia = máximo(0, mínimo(variável líquido, restante - reservado))
por dia = arredondar por defeito(para o dia a dia / dias restantes incluindo hoje)
```

Exemplo verificado: limite 1.500 €, contas 800 €, poupança 200 €, variáveis 500 €, 17 dias. A estimativa é 29,41 €/dia. Pagar os 800 € de contas mantém a estimativa. Gastar 400 € numa categoria com objetivo de 300 € deixa 100 € para o dia a dia, ou 5,88 €/dia, mesmo que outra categoria ainda mostre 200 €.

### UI e UX

- Estimativa diária com maior destaque e explicação expansível do cálculo.
- Aviso acionável quando os objetivos ultrapassam o limite mensal.
- Botão para regressar ao mês atual e nomes acessíveis nos controlos de navegação.
- Melhor contraste de texto secundário, foco visível, controlos monetários legíveis em telemóvel e anúncio das mensagens de estado.
- Diálogos retêm o foco do teclado, devolvem-no ao fechar e tornam o fundo inativo.
- Categorias com histórico não podem mudar de tipo ou ser eliminadas pela interface, evitando reclassificação retroativa de despesas e poupanças. A alternativa temporária é colocar o objetivo futuro a zero. Arquivar é o próximo passo adequado.

### Onboarding

Cinco passos: apresentação e idioma, orçamento inicial, categorias agrupadas por finalidade, distribuição com validação e revisão final com prévia diária. O idioma inicial acompanha o navegador. O fluxo explica como começar a meio do mês sem contar duas vezes despesas já descontadas. Apenas categorias selecionadas entram na soma; um plano excessivo não pode ser concluído. Dinheiro não atribuído fica explicitamente fora da estimativa diária.

### Integridade dos dados

Backups são validados também por dentro: categorias, transações, datas, percentagens, valores e orçamentos. JSON inválido é preservado para recuperação antes de permitir novas gravações. Falhas de armazenamento passam a ser visíveis e uma escrita falhada mantém os dados pendentes para nova tentativa. Cancelar a partilha de um backup deixa de marcar a exportação como concluída.

## Validação

- 98 testes automatizados: matemática, migrações, backups e traduções.
- Verificação TypeScript e compilação de produção.
- Teste manual no navegador: onboarding completo, plano excessivo bloqueado, correspondência entre prévia e resumo, pagamento de conta, excesso numa categoria e persistência após recarregar.
- Inspeção visual a 390 × 844 e no tamanho de desktop do navegador.
- Não foi feito um teste de instalação/offline em iPhone ou Android físico, nem uma auditoria exaustiva com leitor de ecrã.

## Limitações ainda importantes

1. **Plano versus dinheiro real.** Contribuições de poupança e sobras são calculadas a partir do plano e propagam-se em meses sem atividade. Sem saldos iniciais, rendimentos efetivamente recebidos e confirmação de fecho mensal, estes valores não devem ser tratados como dinheiro confirmado no banco.
2. **Histórico financeiro.** O objetivo global de uma poupança ainda pode recalcular meses anteriores quando alterado. Falta versionar as regras por mês e oferecer arquivo de categorias, sem apagar o seu passado. Antes de automatizar dinheiro real, é necessário um modelo de movimentos explícitos e imutáveis.
3. **Meses anteriores editáveis.** Alterar despesas antigas pode reduzir uma reserva já distribuída em meses seguintes. O sistema precisa de reconciliação e indicação explícita de défice, em vez de ocultar saldos negativos na reserva. A origem descritiva dos extras também precisa de rastreio completo, incluindo capital externo.
4. **Despesas partilhadas.** O modelo guarda percentagens, mas ainda não tem um fluxo completo de reembolsos e liquidação. O pagamento integral conta no orçamento; a parte a receber não deve ser apresentada como dinheiro disponível.
5. **Persistência.** Não há resolução de conflitos entre separadores/dispositivos. A app ainda guarda o documento completo no navegador. Pedir armazenamento persistente não garante que o navegador conceda o pedido: a decisão é do navegador ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist)).
6. **Escala e manutenção.** `App.tsx` concentra demasiados ecrãs e ações. A reserva percorre repetidamente meses e transações; históricos longos beneficiam de um cálculo único por mês. O limite de 600 meses deve ter tratamento explícito.

## Próximos passos, por ordem

| Prioridade | Entrega | Resultado para a pessoa |
|---|---|---|
| 1 | Saldos iniciais, rendimentos, compromissos com vencimento e fecho mensal confirmado | Saber quanto há realmente até ao próximo rendimento; deixar de confundir plano com saldo |
| 2 | Movimentos explícitos de poupança, transferências e reembolsos; regras versionadas e arquivo | Editar o futuro sem reescrever o passado |
| 3 | Despesas recorrentes com confirmação e deduplicação | Confirmar renda e subscrições em um toque; nunca criar a mesma despesa duas vezes |
| 4 | Importação de extratos com prévia, deteção de duplicados e regras por comerciante | Reduzir o registo manual antes de investir numa ligação bancária |
| 5 | Conta opcional, backup automático, sincronização e resolução de conflitos | Recuperar dados e usar mais de um dispositivo com confiança |
| 6 | Ligação bancária e caixa de entrada de movimentos a rever | Automatizar a entrada; pedir ajuda apenas em casos ambíguos |
| 7 | Resumo semanal e alertas oportunos | Saber o que mudou sem abrir a app todos os dias |

Para concorrência local, estudar uma escrita coordenada e revisões do documento; a Web Locks API coordena acesso a recursos entre separadores da mesma origem ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API)). A sincronização remota continuará a precisar de resolução própria de conflitos.

A automação deve ter confirmação inicial, identificadores estáveis e possibilidade de desfazer. Repetir uma importação ou reabrir a app não pode criar novos movimentos. Uma regra reconhecida pode classificar automaticamente; a pessoa deve conseguir corrigir a regra e perceber de onde veio o valor.

Critérios propostos para os próximos testes com utilizadores: concluir configuração sem ajuda, compreender a diferença entre saldo e orçamento, registar uma despesa em poucos segundos e explicar o valor diário depois de um excesso. Medir estes comportamentos antes de acrescentar mais ecrãs.
