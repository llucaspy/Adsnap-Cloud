'use server'

import prisma from '@/lib/prisma'
import { startOfMonth, endOfMonth } from 'date-fns'

export async function getMonthlyCampaigns() {
    const now = new Date()
    const start = startOfMonth(now)
    const end = endOfMonth(now)

    const campaigns = await prisma.campaign.findMany({
        where: {
            isArchived: false,
            // Campaign intersects with this month
            flightStart: { lte: end },
            OR: [
                { flightEnd: { gte: start } },
                { flightEnd: null }
            ]
        },
        include: {
            _count: {
                select: { captures: true }
            }
        },
        orderBy: { flightStart: 'desc' }
    })

    const active = campaigns.filter(c => {
        if (!c.flightStart) return true
        const isStarted = c.flightStart <= now
        const isNotEnded = !c.flightEnd || c.flightEnd >= now
        return isStarted && isNotEnded
    })

    const ended = campaigns.filter(c => {
        return c.flightEnd && c.flightEnd < now
    })

    return { active, ended }
}
