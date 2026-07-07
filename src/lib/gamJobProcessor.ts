import prisma from './prisma'
import { gamCrawler } from './gamCrawlerService'
import { buildGamImportDraft, type GamImportDraft } from './gamImportPlanner'
import { createCampaignsFromGamDraft, type GamImportWriteResult } from './gamImportWriter'
import { sendGamOrderReviewEmail } from './gamOrderReviewEmail'
import { sendTelegramAlert } from './telegram'
import { normalizeCaptureCadence, type CaptureCadence } from './governmentReportScope'
import { GAM_AUTH_REQUIRED_LEVEL } from './gamJobStatus'
import { buildGamReviewUrl, notifyGamOrderReadyForReview, notifyGamOrderStarted } from './gamOrderTelegram'

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
        reviewReadyAt?: string
        reviewReminderCount?: number
        reviewReminderLastAt?: string
        reviewReminderTelegram?: boolean
        orderStartedTelegram?: boolean
        orderStartedTelegramAt?: string
    }
    authWorkflowUrl?: string
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

function normalizeRepo(value: string | undefined) {
    if (!value) return ''
    if (value.includes('github.com/')) {
        return value.split('github.com/')[1].replace(/\/$/, '').replace(/\.git$/, '')
    }
    return value.replace(/\/$/, '').replace(/\.git$/, '')
}

function gamSessionRefreshWorkflowUrl() {
    const repo = normalizeRepo(process.env.GITHUB_REPO || process.env.GITHUB_REPOSITORY)
    return repo ? `https://github.com/${repo}/actions/workflows/gam-session-refresh.yml` : ''
}

function isGamAuthRequiredError(message: string) {
    return /GAM_SESSION_EXPIRADA|GAM_SESSION_REMOTA_AUSENTE|GAM_LOGIN_NAO_CONCLUIDO|DESAFIO_LOGIN_DETECTADO/i.test(message)
}

export async function releaseGamAuthRequiredJobs() {
    const jobs = await prisma.nexusLog.findMany({
        where: { level: GAM_AUTH_REQUIRED_LEVEL },
        orderBy: { createdAt: 'asc' },
    })

    for (const job of jobs) {
        const details = withEvent(
            readDetails(job.details),
            'Sessao GAM renovada; job liberado para voltar a fila',
            'success',
        )
        await prisma.nexusLog.updateMany({
            where: { id: job.id, level: GAM_AUTH_REQUIRED_LEVEL },
            data: {
                level: 'JOB_GAM_PENDING',
                message: 'Nexus GAM: sessao renovada; job liberado para processamento',
                details: JSON.stringify(details),
            },
        })
    }

    return jobs.length
}

async function pausePendingGamJobsForAuth(workflowUrl: string, authRequiredAt: string) {
    const pendingJobs = await prisma.nexusLog.findMany({
        where: { level: 'JOB_GAM_PENDING' },
        select: { id: true, details: true },
        orderBy: { createdAt: 'asc' },
    })

    let pausedCount = 0
    for (const pendingJob of pendingJobs) {
        const details = {
            ...withEvent(
                readDetails(pendingJob.details),
                'Sessao GAM expirada. Job pausado ate a renovacao do login Google.',
                'error',
            ),
            authRequiredAt,
            authWorkflowUrl: workflowUrl || undefined,
        }
        const paused = await prisma.nexusLog.updateMany({
            where: { id: pendingJob.id, level: 'JOB_GAM_PENDING' },
            data: {
                level: GAM_AUTH_REQUIRED_LEVEL,
                message: 'Nexus GAM: aguardando renovacao da sessao autenticada',
                details: JSON.stringify(details),
            },
        })
        pausedCount += paused.count
    }

    return pausedCount
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
            await notifyGamOrderStarted(job.id)

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
                const reviewUrl = buildGamReviewUrl(job.id)
                const reviewReadyAt = new Date().toISOString()
                const telegramSent = await notifyGamOrderReadyForReview({ jobId: job.id, draft, reviewUrl, writeResult })

                const emailSent = writeResult
                    ? await sendGamOrderReviewEmail({ draft, jobId: job.id, reviewUrl, writeResult })
                    : false

                await prisma.nexusLog.updateMany({
                    where: { id: job.id, level: 'JOB_GAM_REVIEW' },
                    data: {
                        details: JSON.stringify({
                            ...completedDetails,
                            notifications: {
                                ...(completedDetails.notifications || {}),
                                reviewUrl,
                                telegram: telegramSent,
                                email: emailSent,
                                reviewReadyAt,
                                reviewReminderCount: 0,
                                reviewReminderLastAt: reviewReadyAt,
                            },
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
            if (isGamAuthRequiredError(message)) {
                const workflowUrl = gamSessionRefreshWorkflowUrl()
                const authRequiredAt = new Date().toISOString()
                const details = {
                    ...withEvent(
                        readDetails(current.details),
                        'Sessao GAM expirada. Renove a autenticacao supervisionada antes de retomar a fila.',
                        'error',
                    ),
                    authRequiredAt,
                    authWorkflowUrl: workflowUrl || undefined,
                }
                await prisma.nexusLog.update({
                    where: { id: job.id },
                    data: {
                        level: GAM_AUTH_REQUIRED_LEVEL,
                        message: 'Nexus GAM: autenticacao supervisionada necessaria',
                        details: JSON.stringify(details),
                    },
                })
                const pausedCount = await pausePendingGamJobsForAuth(workflowUrl, authRequiredAt)
                await sendTelegramAlert(
                    'Sessao GAM expirada',
                    'O Google solicitou uma nova autenticacao supervisionada. A fila GAM foi pausada ate a sessao ser renovada.',
                    `Jobs pausados: ${pausedCount + 1}. Rode o workflow "Renovar sessao GAM" no GitHub e aprove a verificacao no celular quando solicitado.`,
                    undefined,
                    workflowUrl ? { label: 'Renovar no GitHub', url: workflowUrl } : undefined,
                )
                break
            }

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
