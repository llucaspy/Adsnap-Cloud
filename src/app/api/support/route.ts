import { supportIdentity, supportStore, supportBody, supportJson, supportFailure } from '@/lib/supportHttp'
export const dynamic = 'force-dynamic'
export async function GET() {
    try { const identity = await supportIdentity(); return supportJson({ executor: await supportStore.status(), conversations: await supportStore.list(identity) }) }
    catch (error) { return supportFailure(error) }
}
export async function POST(request: Request) {
    try {
        const identity = await supportIdentity()
        const body = await supportBody(request)
        return supportJson(await supportStore.create(identity, String(body.title || 'Atendimento Adsnap')), 201)
    } catch (error) { return supportFailure(error) }
}
