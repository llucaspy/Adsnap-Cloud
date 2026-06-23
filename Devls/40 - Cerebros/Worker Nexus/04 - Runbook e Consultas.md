# Runbook e Consultas

Atualizado em: 2026-06-23

## Arquivos principais

- `src/scripts/worker.ts`: ciclo principal do worker.
- `src/lib/captureService.ts`: Playwright, deteccao de banner, montagem e save da captura.
- `src/lib/gamJobProcessor.ts`: fila de jobs GAM baseada em `NexusLog`.
- `src/lib/governmentReportAutomation.ts`: fila de relatorios Governo Federal.
- `src/lib/campaignSchedule.ts`: regras de agendamento e boundary federal.
- `src/lib/nexusLogStore.ts`: logs em memoria e em Postgres.
- `src/app/actions.ts`: actions que colocam campanhas em `QUEUED` e disparam GitHub Actions.
- `.github/workflows/nexus-worker.yml`: execucao agendada/manual do worker principal.
- `.github/workflows/gam-import.yml`: worker dedicado GAM.
- `prisma/schema.prisma`: modelos `Campaign`, `Capture`, `NexusLog`, `EmailDispatch`.
- `src/app/workers/page.tsx`: pagina server-side do painel operacional dos workers.
- `src/components/WorkerLogsPanel.tsx`: painel visual com fila, ciclos, erros, jobs GAM e timeline.
- `prisma/manual-migrations/20260623_worker_performance_indexes.sql`: migration manual de lease e indices de performance.

## Painel operacional

Abrir `/workers` dentro do Adsnap autenticado.

O painel mostra:

- KPIs de fila, processamento, autoconfig, erros 24h, sucessos 24h e idade da fila mais antiga.
- Cards de lotes: totais, em execucao, em espera e com erro, calculados por status real no banco.
- Fila viva com `QUEUED`, `PROCESSING`, `AUTOCONFIG`, `FAILED` e `QUARANTINE`.
- Ciclos recentes com `runId`, duracao, itens reclamados, sucesso, falha, timeout e quarentena.
- Jobs GAM recentes e erros recentes.
- Timeline de logs `NexusLog`.

Leitura rapida:

- `lockedUntil` vencido em `PROCESSING`: lease expirou e o proximo ciclo deve reenfileirar.
- `processingAttempts` alto: campanha instavel ou erro recorrente de preview/storage.
- `lastWorkerError` preenchido: ponto inicial de investigacao antes de reprocessar.
- `quar` nos ciclos: captura falhou de forma controlada e foi para quarentena, nao deve ser contada como sucesso.
- Em producao, `NEXUS_WORKER_DRAIN_QUEUE` fica ligado por padrao: o worker reclama lotes de ate 20 itens repetidamente ate esvaziar a janela capturada no inicio da etapa de captura.
- `NEXUS_WORKER_MAX_RUNTIME_MS` e um freio opcional. Sem configurar, a regra padrao e drenar a janela inteira.

## Checklist quando campanhas travarem

1. Quantas campanhas estao em `QUEUED` e qual a idade da mais antiga?
2. Existe `PROCESSING` ha mais que o timeout esperado?
3. O GitHub Actions tem mais de um `Nexus Engine Worker` rodando ao mesmo tempo?
4. O erro recente e de banner vazio, timeout, storage ou banco?
5. A campanha tem captura `SUCCESS` recente, mas status errado?
6. O lote atual tinha `TARGET_CAMPAIGN_IDS` ou era ciclo agendado?
7. O problema aparece em um formato especifico ou em todos?
8. O preview abre manualmente e renderiza o banner correto?

## Diagnostico rapido via Prisma

Usar o padrao abaixo para leitura local. Nao imprimir segredos e nao usar scripts que tenham token hardcoded.

```powershell
npx.cmd tsx -e "import './src/lib/env'; import prisma from './src/lib/prisma'; async function main(){ const statuses=await prisma.campaign.groupBy({by:['status'],where:{isArchived:false},_count:{_all:true}}); console.log(statuses); } main().finally(()=>prisma.`$disconnect());"
```

## Consultas SQL uteis

Fila por idade:

```sql
select
  id,
  pi,
  client,
  format,
  status,
  "updatedAt",
  extract(epoch from (now() - "updatedAt")) / 60 as age_minutes
from "Campaign"
where "isArchived" = false
  and status in ('QUEUED', 'PROCESSING', 'AUTOCONFIG')
order by "updatedAt" asc
limit 50;
```

Leases ativos ou vencidos:

```sql
select
  id,
  pi,
  client,
  status,
  "processingRunId",
  "processingAttempts",
  "processingStartedAt",
  "lockedUntil",
  "lastWorkerError"
from "Campaign"
where "isArchived" = false
  and status = 'PROCESSING'
order by "lockedUntil" asc nulls first
limit 50;
```

Capturas por status nas ultimas 24h:

```sql
select status, count(*)
from "Capture"
where "createdAt" >= now() - interval '24 hours'
group by status
order by count(*) desc;
```

Erros recentes:

```sql
select level, message, "campaignId", "createdAt"
from "NexusLog"
where "createdAt" >= now() - interval '24 hours'
  and level in ('ERROR', 'API_ERROR')
order by "createdAt" desc
limit 50;
```

Campanhas com muitas capturas/quarentenas:

```sql
select
  c.pi,
  c.client,
  c.format,
  cap.status,
  count(*) as total
from "Capture" cap
join "Campaign" c on c.id = cap."campaignId"
where cap."createdAt" >= now() - interval '7 days'
group by c.pi, c.client, c.format, cap.status
order by total desc
limit 50;
```

## Coisas a nao fazer

- Nao reprocessar a fila inteira sem antes impedir workflow sobreposto.
- Nao aumentar o lote acima de 20 sem lease e `SKIP LOCKED`.
- Nao confiar em `Promise.race` como cancelamento real.
- Nao diagnosticar pelo status isolado; sempre olhar status + idade + ultimo erro + captura recente.
- Nao usar scripts com token hardcoded. Rotacionar e mover para env.
