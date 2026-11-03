import { supportIdentity, supportStore, supportBody, supportJson, supportFailure } from '@/lib/supportHttp'
import prisma from '@/lib/prisma'
import { createSupportActions } from '@/lib/supportActions'
export const dynamic = 'force-dynamic'
type Context = { params: Promise<{ id: string }> }
export async function GET(_request: Request, context: Context) {
    try {
        const identity = await supportIdentity(), id = (await context.params).id
        await createSupportActions(prisma, async () => false).refresh(id, identity)
        return supportJson({ conversation: await supportStore.read(id, identity), executor: await supportStore.status() })
    }
    catch (error) { return supportFailure(error) }
}
export async function POST(request: Request, context: Context) {
    try {
        const identity = await supportIdentity()
        const body = await supportBody(request)
        return supportJson(await supportStore.submit((await context.params).id, identity, String(body.requestId || ''), body.message), 202)
    } catch (error) { return supportFailure(error) }
}
