type QueuePrevious = { id: string; updatedAt: Date | string; processingStartedAt?: Date | string | null }
type QueueOutcome = { id: string; status: string; lastCaptureAt: Date | string | null }

function time(value: Date | string) {
    return value instanceof Date ? value.getTime() : Date.parse(value)
}

export function confirmedQueueSuccess(previous: QueuePrevious, outcome: QueueOutcome | undefined) {
    if (!outcome || outcome.id !== previous.id || outcome.status !== 'SUCCESS' || !outcome.lastCaptureAt) return false
    const began = time(previous.processingStartedAt || previous.updatedAt)
    const captured = time(outcome.lastCaptureAt)
    return Number.isFinite(began) && Number.isFinite(captured) && captured >= began
}
