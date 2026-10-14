/** Redact operational diagnostics before storage and when reading older logs. */
export const LOG_MESSAGE_LIMIT = 1_200
export const LOG_DETAILS_LIMIT = 8_000
const INPUT_LIMIT = 100_000
const REDACTED = '[REDACTED]'
const TRUNCATED = '…[TRUNCATED]'

function bounded(value: string, limit: number) {
    return value.length > limit ? `${value.slice(0, Math.max(0, limit - TRUNCATED.length))}${TRUNCATED}` : value
}

function sensitiveKey(key: string) {
    const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase()
    return /password|passwd|secret|token|apikey|accesskey|authorization|credential|cookie|privatekey/.test(normalized)
        || /^(?:auth|authentication|pwd|session|sessionid|sessionkey)$/.test(normalized)
}

function sensitiveQueryKey(key: string) {
    return sensitiveKey(key) || /^(?:code|key|sig|signature|state)$/i.test(key)
        || /signature|securitytoken/i.test(key)
}

function sanitizeUrl(raw: string, depth = 0): string {
    try {
        const url = new URL(raw, 'https://redacted.invalid')
        if (url.username || url.password) {
            url.username = ''
            url.password = ''
        }
        for (const [key, value] of url.searchParams) {
            if (sensitiveQueryKey(key)) url.searchParams.set(key, REDACTED)
            else if (depth < 2 && /^(?:(?:https?|wss?):\/\/|\/|\?)/i.test(value)) {
                url.searchParams.set(key, sanitizeUrl(value, depth + 1))
            }
        }
        // OAuth/preview credentials can also be carried in the URL fragment.
        let fragment = url.hash
        for (let i = 0; i < 2 && fragment.includes('%'); i++) {
            try { fragment = decodeURIComponent(fragment) } catch { break }
        }
        if (fragment && /(?:token|secret|password|credential|signature|authorization|api[_-]?key|(?:^|[?&#])(?:code|key|auth))\s*=/i.test(fragment)) {
            url.hash = REDACTED
        }
        if (raw.startsWith('//')) return `//${url.host}${url.pathname}${url.search}${url.hash}`
        if (raw.startsWith('/') || raw.startsWith('?')) return `${url.pathname}${url.search}${url.hash}`
        return url.toString()
    } catch {
        return '[REDACTED_URL]'
    }
}

export function redactLogText(value: string, limit = LOG_DETAILS_LIMIT) {
    let result = value.slice(0, INPUT_LIMIT)
        .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
        .replace(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?(?:-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|$)/g, REDACTED)
        .replace(/\bgh[pousr]_[a-z0-9]{4,}/gi, REDACTED)
        .replace(/\bgithub_pat_[a-z0-9_]{8,}/gi, REDACTED)
        .replace(/\b(?:sk-[a-z0-9_-]{12,}|AIza[a-z0-9_-]{20,}|xox[baprs]-[a-z0-9-]{10,}|AKIA[A-Z0-9]{16})\b/gi, REDACTED)
        .replace(/\beyJ[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+\b/gi, REDACTED)
        .replace(/\bbot\d{5,}:[a-z0-9_-]+/gi, `bot${REDACTED}`)
        .replace(/\b(Bearer|Basic)\s+[a-z0-9+/_=.~-]+/gi, `$1 ${REDACTED}`)
        .replace(/\b((?:set-cookie|cookie|authorization|proxy-authorization)\s*:\s*)[^\r\n]*/gi, `$1${REDACTED}`)
        .replace(/\b(?:https?|wss?|postgres(?:ql)?|mysql|redis):\/\/[^\s<>"'`]+/gi, raw => sanitizeUrl(raw))

    // Free-form assignments and historical "GITHUB_TOKEN (prefix...)" diagnostics.
    result = result.replace(/\b([a-z0-9_-]*(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|authorization|credential|cookie|session|private[_-]?key)[a-z0-9_-]*["']?\s*(?:[:=]\s*|\(\s*))(?:\[REDACTED\]|"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;}\]"'&#)]+)/gi, `$1${REDACTED}`)
        .replace(/(?:[a-z]:\\Users\\|\/(?:Users|home)\/)[^\\/\s]+/gi, '[USER_HOME]')

    if (value.length > INPUT_LIMIT) result += TRUNCATED
    return bounded(result, limit)
}

export function sanitizeLogMessage(message: string) {
    // Keep stack traces in restricted technical details, never the summary.
    return redactLogText(message.replace(/^\s*at\s+[^\r\n]*/gm, '[stack frame omitted]'), LOG_MESSAGE_LIMIT)
}

function sanitizeStructured(value: unknown, depth = 0): unknown {
    if (depth > 6) return TRUNCATED
    if (typeof value === 'string') return redactLogText(value, 2_000)
    if (Array.isArray(value)) {
        const items = value.slice(0, 40).map(item => sanitizeStructured(item, depth + 1))
        if (value.length > 40) items.push(TRUNCATED)
        return items
    }
    if (value && typeof value === 'object') {
        const entries = Object.entries(value).slice(0, 64).map(([key, item]) => [
            redactLogText(key, 120), sensitiveKey(key) ? REDACTED : sanitizeStructured(item, depth + 1),
        ])
        if (Object.keys(value).length > 64) entries.push(['_truncated', true])
        return Object.fromEntries(entries)
    }
    return value
}

export function sanitizeLogDetails(details: string | null | undefined): string | null {
    if (details == null) return null
    // JSON is preserved so existing run summaries remain usable after redaction.
    if (details.length <= INPUT_LIMIT && /^[\s]*[\[{]/.test(details)) {
        try {
            const sanitized = sanitizeStructured(JSON.parse(details))
            const serialized = JSON.stringify(sanitized)
            if (serialized.length <= LOG_DETAILS_LIMIT) return serialized
            const runId = sanitized && !Array.isArray(sanitized) && typeof sanitized === 'object'
                ? (sanitized as Record<string, unknown>).runId : undefined
            let summaryLimit = 3_000
            let summary = JSON.stringify({ runId, truncated: true, summary: bounded(serialized, summaryLimit) })
            while (summary.length > LOG_DETAILS_LIMIT && summaryLimit > 100) {
                summaryLimit = Math.floor(summaryLimit / 2)
                summary = JSON.stringify({ runId, truncated: true, summary: bounded(serialized, summaryLimit) })
            }
            return summary
        } catch { /* Non-JSON diagnostics are still redacted below. */ }
    }
    const lines = redactLogText(details).split('\n')
    return bounded(lines.length > 20 ? `${lines.slice(0, 20).join('\n')}\n${TRUNCATED}` : lines.join('\n'), LOG_DETAILS_LIMIT)
}

export function sanitizeLogRecord<T extends { message: string; details?: string | null }>(log: T): T {
    return { ...log, message: sanitizeLogMessage(log.message), details: sanitizeLogDetails(log.details) }
}
