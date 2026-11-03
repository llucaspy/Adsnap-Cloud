import prisma from '@/lib/prisma'
import { supportIdentity, supportBody, supportJson, supportFailure } from '@/lib/supportHttp'
import { createSupportActions } from '@/lib/supportActions'
export const dynamic = 'force-dynamic'
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const identity = await supportIdentity()
        await supportBody(request)
        const actions = createSupportActions(prisma, async ids => (await import('@/app/actions')).triggerNexusWorker(ids))
        return supportJson(await actions.confirm((await context.params).id, identity))
    } catch (error) { return supportFailure(error) }
}
