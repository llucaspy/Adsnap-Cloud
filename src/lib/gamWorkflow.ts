import type { NexusLog, PrismaClient } from '@prisma/client'
import { GAM_ERROR_LEVEL, GAM_PENDING_LEVEL, isGamActiveJobLevel } from './gamJobStatus'

type Job = Pick<NexusLog, 'id' | 'level' | 'message' | 'details' | 'createdAt'>

function readDetails(raw: string | null): Record<string, unknown> {
    if (!raw) return {}
    try {
        const details = JSON.parse(raw)
        if (details && typeof details === 'object' && !Array.isArray(details)) return details
    } catch {}
    return { orderUrl: raw }
}

function githubConfig() {
    const token = process.env.GITHUB_TOKEN
    const repo = (process.env.GITHUB_REPO || '').replace(/^https:\/\/github\.com\//, '').replace(/\.git\/?$/, '').replace(/\/$/, '')
    if (!token || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return null
    return {
        url: `https://api.github.com/repos/${repo}/actions`,
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' },
    }
}

function time(value: unknown) {
    const parsed = typeof value === 'string' ? Date.parse(value) : NaN
    return Number.isFinite(parsed) ? parsed : 0
}

export function gamJobExpired(job: Job, now = Date.now()) {
    const details = readDetails(job.details)
    const events = Array.isArray(details.executionLogs) ? details.executionLogs : []
    const anchor = Math.max(job.createdAt.getTime(), time(details.dispatchRequestedAt), time(events.at(-1)?.at))
    return now - anchor >= (job.level === GAM_PENDING_LEVEL ? 15 : 35) * 60_000
}

async function failJob(db: PrismaClient, job: Job, message: string, details = readDetails(job.details)) {
    const logs = Array.isArray(details.executionLogs) ? details.executionLogs : []
    const changed = {
        level: GAM_ERROR_LEVEL,
        message,
        details: JSON.stringify({
            ...details,
            executionLogs: [...logs, { at: new Date().toISOString(), message, tone: 'error' }].slice(-100),
        }),
    }
    const result = await db.nexusLog.updateMany({
        where: { id: job.id, level: job.level, details: job.details },
        data: changed,
    })
    return result.count ? { ...job, ...changed } : (await db.nexusLog.findUnique({ where: { id: job.id } })) || job
}

export async function reconcileGamJob<T extends Job>(db: PrismaClient, job: T) {
    if (!isGamActiveJobLevel(job.level)) return job
    const details = readDetails(job.details)
    const runId = String(details.workflowRunId || '')
    const now = Date.now()
    const expired = gamJobExpired(job, now)
    const github = githubConfig()

    if (github && /^\d+$/.test(runId) && now - time(details.workflowCheckedAt) >= 30_000) {
        let result: { status?: string; conclusion?: string } | undefined
        try {
            const response = await fetch(`${github.url}/runs/${runId}`, { headers: github.headers, cache: 'no-store', signal: AbortSignal.timeout(4000) })
            if (response.ok) result = await response.json()
        } catch {
            // The deadline below also covers interruptions in GitHub's API.
        }
        if (result?.status === 'completed' && result.conclusion !== 'success') {
            return failJob(db, job, 'O GitHub interrompeu o worker de cadastro. Tente cadastrar a Order novamente.')
        }
        if (!expired) {
            await db.nexusLog.updateMany({
                where: { id: job.id, level: job.level, details: job.details },
                data: { details: JSON.stringify({ ...details, workflowCheckedAt: new Date(now).toISOString() }) },
            })
        }
    }

    if (!expired) return job
    const message = job.level === GAM_PENDING_LEVEL
        ? 'O worker não iniciou no prazo de 15 minutos. Tente cadastrar a Order novamente.'
        : 'O cadastro ficou sem progresso por 35 minutos. Tente cadastrar a Order novamente.'
    return failJob(db, job, message, details)
}

export async function dispatchGamWorkflow(db: PrismaClient, jobId?: string) {
    const github = githubConfig()
    if (!github) return false
    const job = jobId ? await db.nexusLog.findUnique({ where: { id: jobId } }) : null
    if (jobId && job?.level !== GAM_PENDING_LEVEL) return false
    let pending = job?.level === GAM_PENDING_LEVEL ? job : null

    if (pending) {
        const details = readDetails(pending.details)
        delete details.workflowRunId
        delete details.workflowCheckedAt
        const updated = JSON.stringify({ ...details, dispatchRequestedAt: new Date().toISOString() })
        const result = await db.nexusLog.updateMany({
            where: { id: pending.id, level: pending.level, details: pending.details },
            data: { details: updated },
        })
        if (!result.count) return false
        pending = { ...pending, details: updated }
    }

    let response: Response
    try {
        response = await fetch(`${github.url}/workflows/gam-import.yml/dispatches`, {
            method: 'POST', headers: github.headers, signal: AbortSignal.timeout(15_000),
            body: JSON.stringify({ ref: 'main', inputs: jobId ? { job_id: jobId } : {}, return_run_details: true }),
        })
    } catch {
        // Delivery is uncertain. Leave the job claimable until its startup deadline.
        return false
    }
    if (!response.ok) {
        if (pending && response.status < 500) await failJob(db, pending, 'O GitHub recusou o início do cadastro. Tente novamente.')
        return false
    }
    if (response.status === 200 && pending) {
        const result = await response.json().catch(() => null)
        if (Number.isSafeInteger(result?.workflow_run_id) && result.workflow_run_id > 0) {
            await db.nexusLog.updateMany({
                where: { id: pending.id, level: pending.level, details: pending.details },
                data: { details: JSON.stringify({ ...readDetails(pending.details), workflowRunId: String(result.workflow_run_id) }) },
            })
        }
    }
    return true
}
