# Plano de Otimizacao

Atualizado em: 2026-06-23

## Prioridade 0 - Estancar sobreposicao

- Adicionar `concurrency` no `.github/workflows/nexus-worker.yml`.
- Comecar com `cancel-in-progress: false` para evitar dois workers de captura ao mesmo tempo.
- Reduzir lote inicial de 20 para 3-5 enquanto a fila nao tiver lease robusto.
- Colocar captura mais cedo no ciclo ou separar o worker de captura das tarefas auxiliares.

Exemplo de direcao:

```yaml
concurrency:
  group: nexus-worker-main
  cancel-in-progress: false
```

## Prioridade 1 - Timeout cancelavel

- Trocar `Promise.race` solto por helper com cancelamento real.
- Fazer `processCampaign` receber `AbortSignal` ou um contexto de execucao.
- Garantir `browser.close()` quando o timeout vence.
- O timeout deve produzir um estado unico: `TIMEOUT_RETRYABLE` ou `QUEUED` com tentativa incrementada, nunca deixar a captura antiga rodando sem dono.

Regra: se o worker desistiu da campanha, a captura antiga deve parar.

## Prioridade 2 - Lease de fila

Adicionar campos no modelo `Campaign` ou criar tabela propria de jobs:

- `processingStartedAt`
- `processingHeartbeatAt`
- `processingRunId`
- `processingAttempts`
- `lastWorkerError`
- `lockedUntil`

Objetivo: saber quem pegou, quando pegou, quando expirou e por que voltou para fila.

## Prioridade 3 - Claim atomico com SKIP LOCKED

Quando houver chance de mais de um worker, reclamar linhas com `FOR UPDATE SKIP LOCKED` no Postgres.

Direcao SQL:

```sql
update "Campaign"
set
  status = 'PROCESSING',
  "updatedAt" = now()
where id in (
  select id
  from "Campaign"
  where status in ('QUEUED', 'AUTOCONFIG')
    and "isArchived" = false
  order by "updatedAt" asc
  limit 5
  for update skip locked
)
returning *;
```

## Prioridade 4 - Indices alinhados ao worker

Criar indices parciais/compostos para os filtros reais. Em Supabase/Postgres, preferir `CONCURRENTLY` fora de uma transacao de migration quando tabela estiver em uso.

Direcao inicial:

```sql
create index concurrently if not exists "Campaign_worker_queue_idx"
on "Campaign" (status, "isArchived", "updatedAt")
where "isArchived" = false
  and status in ('QUEUED', 'AUTOCONFIG', 'PROCESSING');

create index concurrently if not exists "Campaign_schedule_idx"
on "Campaign" ("isScheduled", "isArchived", status, "updatedAt")
where "isScheduled" = true
  and "isArchived" = false;

create index concurrently if not exists "Campaign_federal_boundary_idx"
on "Campaign" (segmentation, "captureCadence", status, "updatedAt")
where "isArchived" = false;

create index concurrently if not exists "Capture_campaign_status_created_idx"
on "Capture" ("campaignId", status, "createdAt" desc)
where status = 'SUCCESS';

create index concurrently if not exists "NexusLog_level_created_idx"
on "NexusLog" (level, "createdAt" desc);
```

## Prioridade 5 - Separar responsabilidades

Separar cadencias:

- Capture worker: apenas fila de `QUEUED`/`AUTOCONFIG`.
- Scheduler worker: apenas enfileirar campanhas por horario.
- Report worker: Governo Federal e email dispatch.
- GAM worker: ja existe dedicado; remover do worker principal ou rodar so quando explicitamente necessario.
- Alert worker: Telegram/Gmail/alertas em janela propria.

## Prioridade 6 - Observabilidade

- Criar resumo de ciclo: `runId`, itens reclamados, sucessos, falhas, timeouts, duracao total.
- Reduzir logs por frame/tentativa em `NexusLog`; manter detalhes tecnicos em `details` compactado.
- Criar consulta rapida para ver fila com idade, tentativa e ultimo erro.
- Expor no painel uma fila com `QUEUED`, `PROCESSING`, idade e erro recente.

## Ordem recomendada de implementacao

1. `concurrency` no workflow + reduzir lote.
2. Timeout cancelavel com fechamento garantido do browser.
3. Indices de fila/log/captura.
4. Campos de lease no schema.
5. Claim com `SKIP LOCKED`.
6. Separar worker principal em workers menores.
