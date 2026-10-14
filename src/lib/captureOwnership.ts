import type { Prisma } from '@prisma/client'

/** Unique worker cycle and attempt fence old executions after recovery. */
export type CaptureOwnership = { campaignId: string; runId: string; jobId?: string; attempt?: number }

export class CaptureOwnershipLostError extends Error {
    readonly code = 'CAPTURE_OWNERSHIP_LOST'
    constructor() {
        super('A captura perdeu a posse da tarefa; resultado antigo nao sera publicado')
        this.name = 'CaptureOwnershipLostError'
    }
}

/** Call in the capture commit transaction, always Campaign before WorkerJob. */
export async function assertCaptureOwnership(tx: Prisma.TransactionClient, ownership: CaptureOwnership) {
    const campaigns = await tx.$queryRawUnsafe<{ id: string }[]>(`
        select id from "Campaign"
        where id = $1 and status = 'PROCESSING'
          and "processingRunId" = $2 and "lockedUntil" > (now() at time zone 'UTC') and "isArchived" = false
        for update
    `, ownership.campaignId, ownership.runId)
    if (campaigns.length !== 1) throw new CaptureOwnershipLostError()
    if (ownership.jobId) {
        const jobs = await tx.$queryRawUnsafe<{ id: string }[]>(`
            select id from "WorkerJob"
            where id = $1 and "campaignId" = $2 and "runId" = $3
              and status = 'PROCESSING' and attempts = $4 and "lockedUntil" > (now() at time zone 'UTC')
            for update
        `, ownership.jobId, ownership.campaignId, ownership.runId, ownership.attempt ?? -1)
        if (jobs.length !== 1) throw new CaptureOwnershipLostError()
    }
}

/** ACK belongs to the same transaction as Capture and Campaign, after assert. */
export async function completeCaptureOwnership(tx: Prisma.TransactionClient, ownership: CaptureOwnership) {
    if (!ownership.jobId) return
    const updated = await tx.workerJob.updateMany({
        where: { id: ownership.jobId, campaignId: ownership.campaignId, status: 'PROCESSING',
            runId: ownership.runId, attempts: ownership.attempt ?? -1, lockedUntil: { gt: new Date() } },
        data: { status: 'SUCCESS', finishedAt: new Date(), lockedUntil: null, lastError: null },
    })
    if (updated.count !== 1) throw new CaptureOwnershipLostError()
}
