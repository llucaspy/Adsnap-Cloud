import { createHash, timingSafeEqual } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { shouldQueueScheduledCampaign } from './campaignSchedule'

export class SchedulerUnauthorized extends Error {}

export function schedulerTokenHash(token: string) {
    return createHash('sha256').update(token).digest('hex')
}

export async function runCaptureScheduler(db: PrismaClient, authorization: string | null,
    options: { repository: string; token: string; request?: typeof fetch; now?: Date }) {
    // No cookies, user roles or query-string credentials can authorize this service endpoint.
    if (!authorization || !/^Bearer [a-f0-9]{64}$/.test(authorization)) throw new SchedulerUnauthorized()
    const supplied = schedulerTokenHash(authorization.slice(7))
    const now = options.now ?? new Date()
    const request = options.request ?? fetch
    return db.$transaction(async tx => {
        const rows = await tx.$queryRawUnsafe<{ token_hash: string; dispatched_at: Date | null }[]>(
            'SELECT token_hash, dispatched_at FROM adsnap_private.capture_scheduler WHERE id=1 FOR UPDATE')
        const row = rows[0]
        if (!row || row.token_hash.length !== supplied.length || !timingSafeEqual(Buffer.from(row.token_hash), Buffer.from(supplied))) {
            throw new SchedulerUnauthorized()
        }
        const finish = async (decision: string, dispatched = false, error: string | null = null) => {
            await tx.$executeRawUnsafe(`UPDATE adsnap_private.capture_scheduler
                SET checked_at=$1, decision=$2, last_error=$3,
                    dispatched_at=CASE WHEN $4 THEN $1 ELSE dispatched_at END WHERE id=1`, now, decision, error, dispatched)
            return { decision, dispatched }
        }
        if (row.dispatched_at && now.getTime() - row.dispatched_at.getTime() < 120_000) return finish('debounced')
        if (options.repository !== 'llucaspy/Adsnap-Cloud' || !options.token) return finish('error', false, 'Dispatch configuration unavailable')

        const campaigns = await tx.campaign.findMany({ where: {
            isArchived: false, isScheduled: true, adOpsStatus: 'ATIVA',
            status: { notIn: ['EXPIRED', 'FINISHED', 'PROCESSING', 'QUEUED', 'FAILED', 'QUARANTINE'] },
        } })
        const due = campaigns.some(c => shouldQueueScheduledCampaign(c, now))
        const pending = await tx.$queryRawUnsafe<{ id: string }[]>(`SELECT j.id FROM "WorkerJob" j
            JOIN "Campaign" c ON c.id=j."campaignId"
            WHERE j.type='CAPTURE' AND j.status='QUEUED' AND j."scheduledFor" <= ($1::timestamptz AT TIME ZONE 'UTC')
              AND j.attempts < j."maxAttempts" AND NOT c."isArchived" AND c.status='QUEUED' LIMIT 1`, now)
        const stale = await tx.campaign.count({ where: {
            isArchived: false, status: 'PROCESSING', lockedUntil: { lt: now },
        } })
        if (!due && !pending.length && !stale) return finish('idle')

        const headers = { Authorization: `Bearer ${options.token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }
        const url = `https://api.github.com/repos/${options.repository}/actions/workflows/nexus-worker.yml`
        try {
            // A running or queued runner already owns recovery. Do not build a backlog of dispatches.
            const listing = await request(`${url}/runs?branch=main&per_page=30`, { headers, signal: AbortSignal.timeout(8_000) })
            if (!listing.ok) return finish('error', false, `Runner lookup HTTP ${listing.status}`)
            const data = await listing.json() as { workflow_runs?: { status: string; created_at: string }[] }
            if (!Array.isArray(data.workflow_runs)) return finish('error', false, 'Invalid runner lookup response')
            if (data.workflow_runs.some(r => r.status !== 'completed' && now.getTime() - Date.parse(r.created_at) < 45 * 60_000)) return finish('runner-active')
            const response = await request(`${url}/dispatches`, { method: 'POST', headers,
                body: JSON.stringify({ ref: 'main', inputs: { campaign_ids: '' } }), signal: AbortSignal.timeout(8_000) })
            if (response.status !== 204) return finish('error', false, `Dispatch HTTP ${response.status}`)
            await tx.nexusLog.create({ data: { level: 'SYSTEM', message: 'Agendador de recuperação: worker geral disparado para capturas pendentes.' } })
            return finish('dispatched', true)
        } catch {
            // Never persist response bodies or credential-bearing request objects.
            return finish('error', false, 'GitHub request failed or timed out')
        }
    }, { maxWait: 5_000, timeout: 30_000 })
}
