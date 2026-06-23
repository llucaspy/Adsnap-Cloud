# Diagnostico de Performance - 2026-06-23

Snapshot lido do banco em 2026-06-23 10:35 BRT.

## Estado observado

- Campanhas nao arquivadas por status: `ACTIVE` 244, `SUCCESS` 127, `PENDING` 84, `QUEUED` 10, `PROCESSING` 1, `EXPIRED` 14, `QUARANTINE` 3.
- Havia 10 campanhas `QUEUED` ha cerca de 49 minutos.
- Havia 1 campanha `PROCESSING` ha cerca de 49 minutos.
- Capturas nas ultimas 24h: 142 `SUCCESS` e 4 `QUARANTINE`.
- Logs Nexus nas ultimas 24h: 1253 `SYSTEM`, 599 `SUCCESS`, 271 `INFO`, 72 `ERROR`, 17 `API_ERROR`.
- Erros recentes concentram em `Banners encontrados mas parecem vazios ou invisiveis` e uma ocorrencia de `Erro critico no processCampaign`.
- `EmailDispatch` estava estavel no snapshot: 3 registros `SENT`.

## Gargalos provaveis

1. Workflow sobreposto.
   - O workflow principal roda a cada 15 minutos e tambem por disparo manual.
   - O workflow nao tem `concurrency`.
   - O worker pode pegar ate 20 capturas, e cada captura tem timeout de 5 minutos no loop. Pior caso do lote: cerca de 100 minutos, sem contar setup, Playwright, retries e upload.
   - Resultado esperado: execucoes paralelas brigando por banco, conexoes, GitHub runners e recursos externos.

2. Timeout nao cancelavel.
   - O loop usa `Promise.race([processCampaign(...), timeout])`.
   - Quando o timeout vence, o `processCampaign` original continua vivo em background ate terminar ou falhar.
   - O catch do worker marca a campanha como `QUEUED`, mas a captura antiga ainda pode tentar salvar `SUCCESS`, `FAILED` ou `QUARANTINE`.
   - Isso cria estados concorrentes e pode deixar navegador/operacao externa consumindo recurso sem dono claro.

3. Captura fica no fim do ciclo.
   - Gmail, relatorios, jobs GAM, Telegram e metricas rodam antes da captura.
   - Qualquer atraso nessas tarefas empurra a fila de campanhas para o fim.
   - O worker principal esta acumulando responsabilidades que deveriam ter cadencias separadas.

4. Processamento sequencial e lote grande.
   - O worker processa campanhas uma por uma.
   - Lote de ate 20 e alto para GitHub Actions quando cada item abre Chromium, faz scroll, tira multiplos screenshots e sobe imagem.
   - O tempo do lote cresce linearmente com as campanhas problematicas.

5. Modelo de fila sem lease real.
   - Hoje o controle usa `status` e `updatedAt`.
   - Nao existe `processingStartedAt`, `processingHeartbeatAt`, `workerRunId`, `lockedUntil` ou contador persistente de tentativas do worker.
   - O cleanup de travadas usa `updatedAt < 1h`, que e fraco para diagnostico e recuperacao.

6. Indices ausentes nas tabelas centrais.
   - Indices reais encontrados: `Campaign`, `Capture` e `NexusLog` tinham basicamente apenas primary key.
   - `EmailDispatch` ja tinha indice em `(status, isActive, flightEnd)`.
   - As consultas mais frequentes do worker filtram por `status`, `isArchived`, `updatedAt`, `isScheduled`, `segmentation`, `captureCadence`, `createdAt` e `level`.

7. Logging muito ruidoso.
   - O worker cria muitos registros em `NexusLog`.
   - Sem indice por `createdAt`/`level`, telas e diagnosticos recentes ficam mais caros conforme a tabela cresce.

8. Risco de seguranca adjacente.
   - Scripts locais de diagnostico em `src/scripts/check-jobs.ts` e `src/scripts/check-worker-jobs.ts` contem token GitHub hardcoded.
   - Nao usar nem copiar esse token. Mover para env e rotacionar o segredo.

## Hipotese principal

O travamento percebido nao parece ser um unico bug de Playwright. O desenho atual permite acumulacao: execucoes sem trava global, lote longo, timeout que nao cancela a captura real, poucas colunas de lease e consultas sem indices. Quando algumas campanhas entram em preview ruim ou banner vazio, elas seguram a esteira e fazem a fila envelhecer.
