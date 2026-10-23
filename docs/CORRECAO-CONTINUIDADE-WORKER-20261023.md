# Continuidade da fila de capturas

## Problema identificado

O ciclo de 22/10/2026 iniciado às 12:42 UTC encerrou por orçamento de execução após 40 capturas bem-sucedidas. Tarefas liberadas sem iniciar continuaram na fila. O workflow não solicitava continuação: dependia de um novo agendamento, cujas execuções observadas estavam separadas por horas. O horário de corte fixo também impedia que retries com scheduledFor posterior ao início do ciclo fossem reservados por esse mesmo ciclo.

Os registros de interrupção pelo painel constituem outro resultado: não demonstram falha do navegador e não devem ser tratados como captura concluída. Esta alteração preserva os registros históricos e não reabre quarentenas.

## Correção

- Cada reserva de WorkerJob usa o instante atual; tentativas que vencem durante outros lotes podem ser processadas.
- Depois da execução, inclusive em caso de falha, um passo consulta a fila e solicita workflow_dispatch quando ainda existe trabalho elegível para os próximos 15 minutos.
- A retomada usa o token efêmero do próprio job com actions:write, apenas na main. Não exige novo segredo ou serviço externo.
- Retomadas direcionadas consomem somente tarefas existentes. Não recriam pedidos concluídos ou cancelados durante a espera pelo runner.
- O escopo global permanece global, sem truncar a fila ao limite da consulta de inspeção.
- Uma cadeia tem até 12 retomadas. Erro de despacho ou limite atingido com pendências torna o passo visivelmente falho, em vez de indicar conclusão.
- O cron permanece a cada 15 minutos, deslocado dos minutos de maior concentração. Isso não é garantia de pontualidade do provedor nem substitui a validação de cobertura diária.

## Validação

- Suíte completa local: 117 testes aprovados antes dos dois testes adicionais do ciclo.
- Testes adicionais: avanço do cutoff entre lotes e preservação de pedidos cancelados/concluídos.
- PostgreSQL real local: 13/13 verificações, incluindo retries pendentes e exclusão de tarefas canceladas, concluídas, esgotadas, arquivadas, com outro proprietário ou fora da janela.
- A publicação e a retomada real precisam ser confirmadas pelo commit e pelas execuções do GitHub Actions; os testes locais isoladamente não comprovam operação na nuvem.

Referência do mecanismo de despacho: https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow
