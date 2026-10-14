import { sanitizeLogRecord } from './logRedaction'

type LogSession = { userId: string; role: string; email: string }
type StoredLog = {
    id: string
    level: string
    message: string
    details: string | null
    campaignId: string | null
    createdAt: Date
}

type Dependencies = {
    getSession: () => Promise<LogSession | null>
    readLogs: () => Promise<StoredLog[]>
}

const PRIVATE_HEADERS = {
    'Cache-Control': 'private, no-store, max-age=0',
    Pragma: 'no-cache',
    Vary: 'Cookie',
    'X-Content-Type-Options': 'nosniff',
}

/** The auth check runs before querying data, including for this otherwise public namespace. */
export function createNexusLogsHandler({ getSession, readLogs }: Dependencies) {
    return async function GET() {
        try {
            const session = await getSession()
            if (!session || typeof session.userId !== 'string' || !session.userId.trim()
                || !['admin', 'user'].includes(session.role)) {
                return Response.json({ error: 'Unauthorized' }, { status: 401, headers: PRIVATE_HEADERS })
            }

            const logs = await readLogs()
            return Response.json(logs.map(log => {
                const sanitized = sanitizeLogRecord(log)
                return {
                    id: sanitized.id,
                    level: sanitized.level,
                    message: sanitized.message,
                    details: session.role === 'admin' ? sanitized.details : null,
                    campaignId: sanitized.campaignId,
                    createdAt: sanitized.createdAt,
                }
            }), { headers: PRIVATE_HEADERS })
        } catch {
            // Never return the DB exception or its stack/connection string.
            return Response.json({ error: 'Failed to fetch logs' }, { status: 500, headers: PRIVATE_HEADERS })
        }
    }
}
