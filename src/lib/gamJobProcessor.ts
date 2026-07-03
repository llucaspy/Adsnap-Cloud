import prisma from './prisma'
import { gamCrawler } from './gamCrawlerService'
import { buildGamImportDraft, type GamImportDraft } from './gamImportPlanner'
import { createCampaignsFromGamDraft, type GamImportWriteResult } from './gamImportWriter'
import { sendGamOrderReviewEmail } from './gamOrderReviewEmail'
import { sendTelegramAlert } from './telegram'
import { normalizeCaptureCadence, type CaptureCadence } from './governmentReportScope'

const STALE_JOB_MINUTES = 30
const MAX_JOB_EVENTS = 100

export interface GamJobEvent {
    at: string
    message: string
    tone: 'info' | 'success' | 'error'
}

type GamJobDetails = Partial<GamImportDraft> & {
    orderUrl?: string
    mode?: string
    requestedPi?: string
    requestedSegmentation?: string
    requestedCaptureCadence?: CaptureCadence
    autoRegisterResult?: GamImportWriteResult
    notifications?: {
        reviewUrl?: string
        telegram?: boolean
        email?: boolean
    }
    executionLogs?: GamJobEvent[]
}

function readDetails(details: string | null): GamJobDetails {
    const raw = details || ''
    if (!raw.trim().startsWith('{')) return { orderUrl: raw }

    try {
        return JSON.parse(raw) as GamJobDetails
    } catch {
        return { orderUrl: raw }
    }
}

function withEvent(details: GamJobDetails, message: string, tone: GamJobEvent['tone'] = 'info') {
    const executionLogs = [
        ...(details.executionLogs || []),
        { at: new Date().toISOString(), message, tone },
    ].slice(-MAX_JOB_EVENTS)

    return { ...details, executionLogs }
}

function isAutoRegisterMode(mode?: string) {
    const normalized = (mode || '').trim().toLowerCase()
    return normalized === 'auto_register'
        || normalized === 'auto-register'
        || normalized === 'autoregister'
        || normalized === 'nexus-order-autoregister'
}

async function updateProgress(jobId: string, message: string, tone: GamJobEvent['tone'] = 'info') {
    const current = await prisma.nexusLog.findUnique({ where: { id: jobId } })
    if (!current || current.level !== 'JOB_GAM_RUNNING') throw new Error('GAM_JOB_CANCELLED')

    const details = withEvent(readDetails(current.details), message, tone)
    const updated = await prisma.nexusLog.updateMany({
        where: { id: jobId, level: 'JOB_GAM_RUNNING' },
        data: {
            message: `Nexus GAM: ${message}`,
            details: JSON.stringify(details),
        },
    })

    if (updated.count === 0) throw new Error('GAM_JOB_CANCELLED')
    return details
}

export async function processPendingGamJobs(limit = 5, targetJobId?: string) {
    const staleBefore = new Date(Date.now() - STALE_JOB_MINUTES * 60 * 1000)
    const recovered = await prisma.nexusLog.updateMany({
        where: {
            level: 'JOB_GAM_RUNNING',
            createdAt: { lt: staleBefore },
            ...(targetJobId ? { id: targetJobId } : {}),
        },
        data: {
            level: 'JOB_GAM_PENDING',
            message: 'Nexus GAM: retomando uma execucao interrompida',
        },
    })

    if (recovered.count > 0) {
        console.log(`[Nexus GAM] ${recovered.count} job(s) interrompido(s) voltaram para a fila.`)
    }

    const jobs = await prisma.nexusLog.findMany({
        where: {
            level: 'JOB_GAM_PENDING',
            ...(targetJobId ? { id: targetJobId } : {}),
        },
        orderBy: { createdAt: 'asc' },
        take: limit,
    })

    for (const job of jobs) {
        const initialDetails = withEvent(readDetails(job.details), 'Worker iniciado; preparando o navegador')
        const claim = await prisma.nexusLog.updateMany({
            where: { id: job.id, level: 'JOB_GAM_PENDING' },
            data: {
                level: 'JOB_GAM_RUNNING',
                message: 'Nexus GAM: preparando o navegador',
                details: JSON.stringify(initialDetails),
            },
        })
        if (claim.count === 0) continue

        try {
            const url = initialDetails.orderUrl || ''
            if (!url.startsWith('http')) throw new Error('URL de job invalida')

            const data = await gamCrawler.startIngestion(url, async progress => {
                await updateProgress(job.id, progress)
            })
            const settings = await prisma.settings.findUnique({ where: { id: 1 } })
            const bannerFormats = JSON.parse(settings?.bannerFormats || '[]')
            const inferredDraft = buildGamImportDraft(data, bannerFormats)
            const draft: GamImportDraft = {
                ...inferredDraft,
                pi: initialDetails.requestedPi || inferredDraft.pi,
                segmentation: initialDetails.requestedSegmentation || inferredDraft.segmentation,
                captureCadence: normalizeCaptureCadence(
                    initialDetails.requestedSegmentation || inferredDraft.segmentation,
                    initialDetails.requestedCaptureCadence || inferredDraft.captureCadence,
                ),
            }

            if (draft.mediaEntries.length === 0 && draft.blockedItems.length === 0) {
                throw new Error('GAM_RASCUNHO_VAZIO: nenhum formato ou bloqueio foi identificado.')
            }

            let writeResult: GamImportWriteResult | undefined
            if (isAutoRegisterMode(initialDetails.mode)) {
                await updateProgress(job.id, 'Rascunho validado; cadastrando campanhas automaticamente')
                writeResult = await createCampaignsFromGamDraft(prisma, draft)
                await updateProgress(
                    job.id,
                    `Cadastro automatico concluido: ${writeResult.created} criada(s), ${writeResult.skipped} existente(s), ${writeResult.blocked} pendente(s)`,
                    'success',
                )
            }

            const current = await prisma.nexusLog.findUnique({ where: { id: job.id } })
            if (!current || current.level !== 'JOB_GAM_RUNNING') throw new Error('GAM_JOB_CANCELLED')
            const completedDetails = withEvent(
                {
                    ...draft,
                    requestedPi: initialDetails.requestedPi || draft.pi,
                    requestedSegmentation: initialDetails.requestedSegmentation || draft.segmentation,
                    requestedCaptureCadence: initialDetails.requestedCaptureCadence || draft.captureCadence,
                    autoRegisterResult: writeResult,
                    executionLogs: readDetails(current.details).executionLogs,
                },
                writeResult
                    ? `Cadastro pronto para revisao com ${writeResult.created} campanha(s) criada(s)`
                    : `Rascunho pronto com ${draft.mediaEntries.length} formato(s)`,
                'success',
            )
            const completed = await prisma.nexusLog.updateMany({
                where: { id: job.id, level: 'JOB_GAM_RUNNING' },
                data: {
                    level: 'JOB_GAM_REVIEW',
                    message: writeResult
                        ? `Cadastro GAM pronto para revisao: ${draft.client} (${writeResult.created} criada(s), ${writeResult.skipped} existente(s), ${writeResult.blocked} pendente(s))`
                        : `Rascunho GAM pronto: ${draft.client} (${draft.mediaEntries.length} formato(s), ${draft.blockedItems.length} bloqueado(s))`,
                    details: JSON.stringify(completedDetails),
                },
            })

            if (completed.count > 0) {
                const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://adsnap-cloud.vercel.app').replace(/\/$/, '')
                const reviewUrl = `${appUrl}/campaigns?jobId=${encodeURIComponent(job.id)}`
                const telegramSent = await sendTelegramAlert(
                    'Order pronta para revisao',
                    writeResult
                        ? `${draft.client} foi cadastrada automaticamente e precisa de conferencia.`
                        : `${draft.client} esta pronta para conferencia antes do cadastro.`,
                    writeResult
                        ? `Order ${draft.orderId} | PI ${draft.pi} | ${writeResult.created} criada(s) | ${writeResult.skipped} existente(s) | ${writeResult.blocked} pendente(s)`
                        : `Order ${draft.orderId} | PI ${draft.pi} | ${draft.mediaEntries.length} formato(s) | ${draft.blockedItems.length} bloqueado(s)`,
                    undefined,
                    { label: 'Abrir revisao', url: reviewUrl },
                )

                const emailSent = writeResult
                    ? await sendGamOrderReviewEmail({ draft, jobId: job.id, reviewUrl, writeResult })
                    : false

                await prisma.nexusLog.updateMany({
                    where: { id: job.id, level: 'JOB_GAM_REVIEW' },
                    data: {
                        details: JSON.stringify({
                            ...completedDetails,
                            notifications: { reviewUrl, telegram: telegramSent, email: emailSent },
                        }),
                    },
                })
            }
        } catch (error) {
            const current = await prisma.nexusLog.findUnique({ where: { id: job.id } })
            if (!current || current.level === 'JOB_GAM_CANCELLED') {
                console.log(`[Nexus GAM] Job ${job.id} encerrado pelo usuario.`)
                continue
            }

            const message = error instanceof Error ? error.message : String(error)
            console.error('[Nexus GAM] Falha no job:', error)
            await prisma.nexusLog.update({
                where: { id: job.id },
                data: {
                    level: 'JOB_GAM_ERROR',
                    message: `Erro: ${message}`,
                    details: JSON.stringify(withEvent(readDetails(current.details), message, 'error')),
                },
            })
        }
    }

    return jobs.length
}
