import { sanitizeLogMessage } from './logRedaction'

/** A diagnostic hint, never a claim that the underlying cause has been proven. */
export function describeCaptureFailure(error: string | null) {
    const reason = sanitizeLogMessage(error || 'O worker não registrou um motivo detalhado.')
    if (/timeout|timed out|tempo.*esgot/i.test(reason)) return { category: 'Tempo esgotado', suggestion: 'Verifique se a página e o anúncio carregam no prazo configurado.', reason }
    if (/selector|seletor|locator|element.*not found|elemento.*encontr|banner.*encontr/i.test(reason)) return { category: 'Localização do anúncio', suggestion: 'Confira a página, o canal e o seletor configurado para este formato.', reason }
    if (/storage|upload|drive|supabase|armazen|quota/i.test(reason)) return { category: 'Armazenamento', suggestion: 'Confira a disponibilidade, as permissões e o espaço do destino das imagens.', reason }
    if (/private|reserved|blocked|ssrf|destination|destino|network|net::|dns|navigation/i.test(reason)) return { category: 'Acesso à página', suggestion: 'Confira se a URL pública abre e se houve bloqueio de rede ou redirecionamento.', reason }
    if (/empty|blank|vazio|opacity|invisible|clipped|creative|criativo|visib/i.test(reason)) return { category: 'Conteúdo do anúncio', suggestion: 'Verifique se o criativo está carregado, visível e sem cortes.', reason }
    if (/lease|reserva|interromp|expir|ownership/i.test(reason)) return { category: 'Execução interrompida', suggestion: 'Consulte a execução do worker e os eventos antes de tentar novamente.', reason }
    return { category: 'Falha de captura', suggestion: 'Consulte o motivo e a sequência de eventos para investigar a origem.', reason }
}

export const CAPTURE_ATTEMPT_EVENT = 'Nexus: tentativa de captura'
export type CaptureAttemptEvent = {
    jobId: string; runId: string; attempt: number; phase: 'STARTED' | 'SUCCESS' | 'RETRY' | 'FAILED' | 'QUARANTINE' | 'UNCONFIRMED'
    error?: string; timeoutMs?: number
}

export function readCaptureAttempt(details: string | null, jobId: string): CaptureAttemptEvent | null {
    try {
        const value = JSON.parse(details || '')
        if (value.jobId !== jobId || !Number.isSafeInteger(value.attempt) || value.attempt < 1
            || typeof value.runId !== 'string' || !['STARTED', 'SUCCESS', 'RETRY', 'FAILED', 'QUARANTINE', 'UNCONFIRMED'].includes(value.phase)) return null
        return { jobId, runId: value.runId, attempt: value.attempt, phase: value.phase,
            ...(typeof value.error === 'string' ? { error: sanitizeLogMessage(value.error) } : {}),
            ...(typeof value.timeoutMs === 'number' ? { timeoutMs: value.timeoutMs } : {}) }
    } catch { return null }
}
