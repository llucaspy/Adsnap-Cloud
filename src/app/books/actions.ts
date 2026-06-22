'use server'

import prisma from '@/lib/prisma'

type MonthlyCampaignGroup = {
    id: string
    pi: string
    client: string
    agency: string
    campaignName: string
    flightStart: Date | null
    flightEnd: Date | null
    captureCount: number
    formats: string[]
}

function getCurrentMonthRangeInBrasilia() {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: 'numeric',
    }).formatToParts(new Date())
    const year = Number(parts.find(part => part.type === 'year')?.value)
    const month = Number(parts.find(part => part.type === 'month')?.value)

    return {
        start: new Date(Date.UTC(year, month - 1, 1, 3)),
        nextMonthStart: new Date(Date.UTC(year, month, 1, 3)),
    }
}

export async function getMonthlyCampaigns() {
    const now = new Date()
    const { start, nextMonthStart } = getCurrentMonthRangeInBrasilia()

    const campaigns = await prisma.campaign.findMany({
        where: {
            isArchived: false,
            flightStart: { not: null, lt: nextMonthStart },
            flightEnd: { not: null, gte: start },
        },
        include: {
            _count: {
                select: {
                    captures: {
                        where: {
                            status: 'SUCCESS',
                            createdAt: { gte: start, lt: nextMonthStart },
                        },
                    },
                },
            }
        },
        orderBy: { flightStart: 'desc' }
    })

    // Group by PI
    const piGroups: Record<string, MonthlyCampaignGroup> = {}

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
        }
    })

    const groupedArray = Object.values(piGroups)

    const active = groupedArray.filter(g => {
        if (!g.flightStart || !g.flightEnd) return false
        const isStarted = g.flightStart <= now
        const isNotEnded = g.flightEnd >= now
        return isStarted && isNotEnded
    })

    const ended = groupedArray.filter(g => {
        return Boolean(g.flightEnd && g.flightEnd >= start && g.flightEnd < now)
    })

    return { active, ended }
}
