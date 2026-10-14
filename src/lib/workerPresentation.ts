export function readWorkerBatchSize(value: string | undefined) {
    const parsed = Number(value)
    return Number.isInteger(parsed) && parsed >= 1 ? Math.min(parsed, 20) : 5
}

export function parseWorkerRunDetails(value: string | null) {
    if (!value?.trim().startsWith('{')) return null
    try {
        const parsed: unknown = JSON.parse(value)
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed as Record<string, unknown>
            : null
    } catch {
        return null
    }
}

export function groupWorkerRunLogs<T extends { id: string; level: string; message: string; details: string | null; createdAt: Date }>(logs: T[]) {
    const runs = new Map<string, { log: T; details: Record<string, unknown> | null }>()
    for (const log of [...logs].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())) {
        const details = parseWorkerRunDetails(log.details)
        const runId = typeof details?.runId === 'string' ? details.runId : null
        if (!runId && !/Nexus Worker: Ciclo (?:iniciado|finalizado)/i.test(log.message)) continue
        const key = runId || log.id
        if (!runs.has(key)) runs.set(key, { log, details })
    }
    return [...runs.values()].slice(0, 10)
}

export function workerJobHref(item: { id: string; jobId?: string | null }) {
    return item.jobId ? `/workers/jobs/${encodeURIComponent(item.jobId)}` : `/workers/campaigns/${encodeURIComponent(item.id)}`
}

export function hasExpiredLease(item: { status: string; lockedUntil: string | null }, now = Date.now()) {
    return item.status === 'PROCESSING' && item.lockedUntil !== null && new Date(item.lockedUntil).getTime() < now
}
