import type { PrismaClient } from '@prisma/client'

/** Only runnable capture work may request another runner. Historical failures never do. */
export async function pendingCaptureCampaignIds(prisma: PrismaClient, scope: string[] = []) {
    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(`
        select distinct c.id from "Campaign" c join "WorkerJob" j on j."campaignId" = c.id
        where c."isArchived" = false and c.status = 'QUEUED'
          and j.type = 'CAPTURE' and j.status = 'QUEUED' and j.attempts < j."maxAttempts"
          and j."scheduledFor" <= (now() at time zone 'UTC') + interval '15 minutes'
          and (cardinality($1::text[]) = 0 or c.id = any($1::text[]))
          and not exists (select 1 from "WorkerJob" active where active."campaignId" = c.id
              and active.type = 'CAPTURE' and active.status = 'PROCESSING')
        order by c.id limit 500`, scope)
    return rows.map(row => row.id)
}

export async function dispatchWorkerContinuation(options: {
    ids: string[]; scope?: string[]; repository: string; token: string; ref: string; depth: number
}, request: typeof fetch = fetch) {
    if (!options.ids.length) return false
    // A broken invariant must produce an actionable failure rather than unbounded runner usage.
    if (!Number.isInteger(options.depth) || options.depth < 0 || options.depth >= 12) {
        throw new Error('Limite de retomadas atingido com capturas pendentes; consulte a fila.')
    }
    if (!/^[\w.-]+\/[\w.-]+$/.test(options.repository) || !options.token || options.ref !== 'main') {
        throw new Error('Retomada requer repositorio, credencial e branch main protegida.')
    }
    const response = await request(`https://api.github.com/repos/${options.repository}/actions/workflows/nexus-worker.yml/dispatches`, {
        method: 'POST', signal: AbortSignal.timeout(15_000),
        headers: { Authorization: `Bearer ${options.token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: options.ref, inputs: {
            campaign_ids: (options.scope ?? options.ids).join(','), continuation_depth: String(options.depth + 1),
        } }),
    })
    if (response.status !== 204) throw new Error(`GitHub recusou a retomada automatica: HTTP ${response.status}`)
    return true
}
