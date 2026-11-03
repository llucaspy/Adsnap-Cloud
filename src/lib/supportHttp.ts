import { getSession } from './auth'
import prisma from './prisma'
import { createSupportStore, SupportError } from './supportStore'

export const supportStore = createSupportStore(prisma)
export const supportJson = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
export function supportFailure(error: unknown) {
    if (error instanceof SupportError) return supportJson({ error: error.message }, error.status)
    return supportJson({ error: 'Atendimento temporariamente indisponível. Tente novamente mais tarde.' }, 503)
}
export async function supportIdentity() {
    const session = await getSession()
    if (!session) throw new SupportError('Entre no Adsnap para usar o atendimento.', 401)
    const user = await supportStore.liveUser(session)
    return { userId: user.id, role: user.role }
}
export async function supportBody(request: Request) {
    if (request.headers.get('origin') !== new URL(request.url).origin) throw new SupportError('Origem não autorizada.', 403)
    if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw new SupportError('Formato de solicitação inválido.')
    const reader = request.body?.getReader()
    if (!reader) throw new SupportError('Solicitação vazia.')
    const chunks: Uint8Array[] = []; let size = 0
    for (;;) {
        const next = await reader.read()
        if (next.done) break
        size += next.value.byteLength
        if (size > 20000) { await reader.cancel(); throw new SupportError('Solicitação muito grande.', 413) }
        chunks.push(next.value)
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown> }
    catch { throw new SupportError('Solicitação inválida.') }
}
