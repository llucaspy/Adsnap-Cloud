import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    try {
        const campaigns = await prisma.campaign.findMany({
            where: status ? { status: status as any } : {},
            include: {
                captures: {
                    take: 1,
                    orderBy: { createdAt: 'desc' }
                }
            },
            orderBy: { updatedAt: 'desc' }
        })

        return NextResponse.json(campaigns)
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch campaigns' }, { status: 500 })
    }
}
