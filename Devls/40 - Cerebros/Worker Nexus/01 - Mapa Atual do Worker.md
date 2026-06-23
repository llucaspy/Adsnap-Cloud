# Mapa Atual do Worker

Atualizado em: 2026-06-23

## Entradas do sistema

- Interface chama `runCapture` ou `runCaptureBatch` em `src/app/actions.ts`.
- Essas actions marcam campanhas como `QUEUED` e disparam o workflow `nexus-worker.yml` via GitHub Actions.
- O workflow `.github/workflows/nexus-worker.yml` tambem roda por agenda a cada 15 minutos.
- Em CI/producao, o comando principal e `npm run worker`, que executa `src/scripts/worker.ts`.
- Existe um worker dedicado para importacao GAM em `.github/workflows/gam-import.yml`, chamando `src/scripts/gam-worker.ts`.

## Ordem atual do ciclo em `src/scripts/worker.ts`

1. Reenfileira campanhas em `PROCESSING` ha mais de 1h.
2. Remove filas federais boundary fora do dia de inicio/fim.
3. Checa Gmail e classifica conversas.
4. Enfileira campanhas agendadas.
5. Processa fila de relatorios Governo Federal.
6. Processa jobs GAM pendentes.
7. Envia alerta Telegram de performance.
8. Envia alertas de meta diaria.
9. So entao busca campanhas `QUEUED`/`AUTOCONFIG` e processa capturas.
10. Processa relatorios Governo Federal novamente depois das capturas.

## Fluxo de captura

- O worker busca ate 100 candidatas `QUEUED`, prioriza boundary federal quando aplicavel e processa ate 20 itens no lote.
- Cada item e reclamado com `updateMany` mudando `QUEUED`/`AUTOCONFIG` para `PROCESSING`.
- Captura normal chama `processCampaign(campaign.id)` em `src/lib/captureService.ts`.
- `processCampaign` carrega settings, tenta `_executeCapture` ate `nexusMaxRetries`, salva sucesso ou poe em `QUARANTINE`.
- `_executeCapture` abre Chromium, navega no preview, faz warm-up com scroll, tenta seletor configurado, depois auto-detecta banner, seleciona frame visual e monta imagem final.
- `saveCapture` envia PNG para Supabase Storage e grava `Capture` + atualiza `Campaign` para `SUCCESS`.

## Estados principais

- `PENDING`: cadastrada, ainda nao enfileirada.
- `QUEUED`: pronta para worker.
- `PROCESSING`: worker reclamou a campanha.
- `SUCCESS`: captura salva.
- `FAILED`: falha ao salvar captura final.
- `QUARANTINE`: todas as tentativas de captura falharam.
- `AUTOCONFIG`: montagem automatica pendente.
- `EXPIRED`/`FINISHED`/`ACTIVE`: usados fora do fluxo central de captura.

## Dependencias externas

- GitHub Actions executa o worker e instala Chromium.
- Playwright/Chromium captura previews.
- Supabase Storage recebe os screenshots.
- Postgres/Supabase guarda fila, campanhas, capturas e logs.
- Gmail/Gemini/Telegram/relatorios rodam no mesmo ciclo do worker principal.
