'use server'

import prisma from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { enqueueCaptureJobs } from '@/lib/workerJobs'
import { triggerNexusWorker } from '@/app/actions'
import { revalidatePath } from 'next/cache'

export async function retryQuarantinedCapture(jobId: string) {
    await requireAdmin()
    const job = await prisma.workerJob.findUnique({ where: { id: jobId }, include: { campaign: true } })
    if (!job?.campaign || job.type !== 'CAPTURE' || job.status !== 'FAILED') throw new Error('Ocorrência indisponível para reprocessamento.')
    if (job.campaign.isArchived || !['FAILED', 'QUARANTINE'].includes(job.campaign.status)) {
        throw new Error('A campanha já mudou de estado. Atualize a página antes de reprocessar.')
    }
    const result = await enqueueCaptureJobs([job.campaign.id], { source: 'quarantine-review', priority: 20, allowTerminalStatuses: true, requireFailureStatus: true })
    if (!result.campaignIds.includes(job.campaign.id)) throw new Error('A campanha não está disponível para reprocessamento.')
    const triggered = await triggerNexusWorker([job.campaign.id])
    revalidatePath('/quarantine')
    revalidatePath(`/quarantine/${jobId}`)
    revalidatePath('/workers')
    return { message: triggered ? 'Nova captura enfileirada. O worker foi acionado.' : 'Nova captura enfileirada. O disparo imediato não foi confirmado; ela aguarda o próximo worker.' }
}
