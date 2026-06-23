# Mudancas Aplicadas 2026-06-23

## Objetivo

Reduzir travamentos do worker, impedir execucoes sobrepostas, tornar timeout cancelavel, dar dono temporario para cada campanha e criar um painel operacional para acompanhar a fila em tempo real.

## O que foi aplicado

- Workflow `.github/workflows/nexus-worker.yml` ganhou `concurrency` com `cancel-in-progress: false`.
- `Campaign` ganhou campos de lease: `processingStartedAt`, `processingHeartbeatAt`, `processingRunId`, `processingAttempts`, `lastWorkerError`, `lockedUntil`.
- Foram criados indices para fila, agendamento, boundary federal, capturas por campanha/status e logs por nivel/campanha.
- `src/scripts/worker.ts` passou a usar `runId`, lote configuravel, claim atomico via `FOR UPDATE SKIP LOCKED`, timeout por campanha e resumo de ciclo.
- Producao passou a drenar a janela de captura: cada lote continua limitado a 20, mas a execucao reclama novos lotes ate nao restar item elegivel com `updatedAt <= captureCutoff`.
- `src/lib/captureService.ts` passou a aceitar `AbortSignal`, cancelar delays, fechar browsers no abort e limpar lease em sucesso/quarentena/falha controlada.
- `src/app/actions.ts` passou a mostrar fila com `AUTOCONFIG` e itens antigos, sem esconder campanhas travadas.
- Novo painel em `/workers` com fila viva, ciclos recentes, erros, jobs GAM e timeline de logs.
- Painel `/workers` ganhou cards de lotes: totais, em execucao, em espera e com erro, calculados a partir das contagens reais do banco e do tamanho de lote ativo.
- `tsconfig.json` passou a excluir `PLANO DE HUB`, que era um projeto paralelo quebrando o typecheck do app principal.

## Migration aplicada

Arquivo:

```text
prisma/manual-migrations/20260623_worker_performance_indexes.sql
```

Status local:

- Colunas de lease adicionadas com `alter table`.
- Indices criados com `create index concurrently if not exists`.
- Prisma Client regenerado com sucesso.
- Banco verificado apos aplicacao: 6 colunas de lease e 7 indices novos presentes.

## Variaveis de controle

- `NEXUS_CAPTURE_BATCH_SIZE`: tamanho do lote de captura. Padrao: `5`. Maximo protegido: `20`.
- `NEXUS_CAPTURE_TIMEOUT_MS`: timeout por campanha. Padrao: `300000` ms.
- `NEXUS_CAPTURE_LEASE_MINUTES`: lease de processamento. Padrao: `15`.
- `NEXUS_WORKER_DRAIN_QUEUE`: em CI/producao, padrao `true`; em local, padrao `false`.
- `NEXUS_WORKER_MAX_RUNTIME_MS`: limite opcional de runtime. Se vazio, o worker drena a janela inteira.
- `TARGET_CAMPAIGN_IDS`: continua servindo para captura direcionada/manual.

## Como acompanhar

1. Entrar no Adsnap autenticado.
2. Abrir `/workers`.
3. Verificar primeiro a fila viva:
   - idade da campanha;
   - status;
   - tentativas;
   - runId;
   - ultimo erro.
4. Depois olhar ciclos recentes:
   - `claimed`: quantos itens o worker reclamou;
   - `ok`: capturas/montagens concluidas;
   - `fail`: falhas reais;
   - `time`: timeouts;
   - `quar`: quarentenas controladas.

## Validacao feita

- `npx.cmd prisma generate`: sucesso.
- `npm.cmd run build`: sucesso.
- `/workers` sem sessao redireciona para `/login`, mantendo o painel protegido.
- Dev server local subiu em modo webpack em `http://localhost:3000`.
- `npm.cmd run build`: sucesso apos incluir drenagem por janela e cards de lotes.

## Proximos passos recomendados

- Separar o worker principal em filas menores: captura, scheduler, relatorio, GAM e alertas.
- Criar retention/arquivamento de logs antigos se `NexusLog` crescer rapido.
- Adicionar alertas automaticos quando `PROCESSING` velho ou `failed/time/quar` crescerem no painel.
- Considerar uma tabela propria de jobs se a fila de campanhas crescer muito.
