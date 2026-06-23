# Cerebro - Worker Nexus

Criado em: 2026-06-23

Este cerebro guarda o mapa operacional do worker do Adsnap Cloud: como a fila de capturas roda, onde ela costuma travar, quais consultas pesam no banco e qual ordem de otimizacao deve ser seguida.

## Notas

- [[01 - Mapa Atual do Worker|Mapa Atual do Worker]]
- [[02 - Diagnostico de Performance 2026-06-23|Diagnostico de Performance 2026-06-23]]
- [[03 - Plano de Otimizacao|Plano de Otimizacao]]
- [[04 - Runbook e Consultas|Runbook e Consultas]]
- [[05 - Mudancas Aplicadas 2026-06-23|Mudancas Aplicadas 2026-06-23]]

## Principio central

O worker precisa ser tratado como sistema de fila, nao como script sequencial. Cada campanha deve ter dono temporario, timeout cancelavel, tentativa rastreavel e indice de banco alinhado com o padrao de busca da fila.

## Sinais que este cerebro deve ajudar a investigar

- Campanhas ficando muito tempo em `QUEUED`.
- Campanhas ficando em `PROCESSING` sem captura nova.
- GitHub Actions sobrepondo execucoes do worker.
- Logs `ERROR`/`API_ERROR` crescendo mais rapido que capturas.
- Quarentena por banner vazio ou invisivel.
- Capturas demorando mais que a janela do agendamento.
- Painel `/workers` mostrando fila antiga, leases vencidos ou ciclos com falha.
