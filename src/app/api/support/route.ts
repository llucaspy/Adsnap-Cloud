import { supportIdentity, supportStore, supportBody, supportJson, supportFailure } from '@/lib/supportHttp'
import prisma from '@/lib/prisma'
import { getNexusAccess } from '@/lib/nexusPolicy'
export const dynamic = 'force-dynamic'
export async function GET() {
    try {
        const identity = await supportIdentity()
        const [access, executor, conversations] = await Promise.all([
            getNexusAccess(prisma, identity.userId), supportStore.status(), supportStore.list(identity),
        ])
        return supportJson({ executor, conversations, viewer: { isOwner: access?.isOwner === true } })
    }
    catch (error) { return supportFailure(error) }
}
export async function POST(request: Request) {
    try {
        const identity = await supportIdentity()
        const body = await supportBody(request)
        return supportJson(await supportStore.create(identity, String(body.title || 'Atendimento Adsnap')), 201)
    } catch (error) { return supportFailure(error) }
}
