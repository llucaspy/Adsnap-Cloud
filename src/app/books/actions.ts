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

    // Group by PI
    const piGroups: Record<string, any> = {}

    campaigns.forEach(c => {
        if (!piGroups[c.pi]) {
            piGroups[c.pi] = {
                id: c.id, // reference id
                pi: c.pi,
                client: c.client,
                agency: c.agency,
                campaignName: c.campaignName,
                flightStart: c.flightStart,
                flightEnd: c.flightEnd,
                captureCount: 0,
                formats: []
            }
        }
        
        const group = piGroups[c.pi]
        group.captureCount += c._count.captures
        group.formats.push(c.format)
        
        // Use earliest start and latest end for the group
        if (c.flightStart && (!group.flightStart || c.flightStart < group.flightStart)) {
            group.flightStart = c.flightStart
        }
        if (c.flightEnd && (!group.flightEnd || c.flightEnd > group.flightEnd)) {
            group.flightEnd = c.flightEnd
        } else if (c.flightEnd === null) {
            group.flightEnd = null // remains ongoing
        }
    })

    const groupedArray = Object.values(piGroups)

    const active = groupedArray.filter(g => {
        if (!g.flightStart) return true
        const isStarted = g.flightStart <= now
        const isNotEnded = !g.flightEnd || g.flightEnd >= now
        return isStarted && isNotEnded
    })

    const ended = groupedArray.filter(g => {
        return g.flightEnd && g.flightEnd < now
    })

    return { active, ended }
}
