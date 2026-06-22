import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { nexusLogStore } from '@/lib/nexusLogStore'
import { triggerNexusWorker } from '@/app/actions'
import { shouldQueueScheduledCampaign } from '@/lib/campaignSchedule'

export const dynamic = 'force-dynamic'

// This route can be triggered by a Cron service (like Vercel Cron or GitHub Actions)
// or manually by hitting /api/cron/process
export async function GET() {
    console.log('[Cron] Starting scheduled queuing process...')

    try {
        // Generate "today" at 00:00 UTC based on current date in Brasilia (BRT)
        // This allows consistent comparison with Prisma Date objects
        const now = new Date()
        const brtNowStr = now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
        const brtNow = new Date(brtNowStr);
        const today = new Date(Date.UTC(brtNow.getFullYear(), brtNow.getMonth(), brtNow.getDate()));

        // HH:mm for schedule matching (BRT)
        const hours = String(brtNow.getHours()).padStart(2, '0');
        const minutes = String(brtNow.getMinutes()).padStart(2, '0');
        const currentTime = `${hours}:${minutes}`;

        console.log(`[Cron] Today (Normalized UTC): ${today.toISOString()}`)
        console.log(`[Cron] Current time (BRT): ${currentTime}`)

        // Step 1: Intelligent Auto-archive
        const candidates = await prisma.campaign.findMany({
            where: {
                isArchived: false,
                flightEnd: { lt: today }
            },
            include: {
                _count: {
                    select: { captures: true }
                }
            }
        })

        let archivedCount = 0
        let expiredOnlyCount = 0

        for (const campaign of candidates) {
            const hasCaptures = campaign._count.captures > 0
            if (hasCaptures) {
                await prisma.campaign.update({
                    where: { id: campaign.id },
                    data: { status: 'EXPIRED' }
                })
                expiredOnlyCount++
            } else {
                await prisma.campaign.update({
                    where: { id: campaign.id },
                    data: { isArchived: true, status: 'EXPIRED' }
                })
                archivedCount++
            }
        }

        // Step 2: Find active scheduled campaigns
        const scheduledCampaigns = await prisma.campaign.findMany({
            where: {
                isScheduled: true,
                isArchived: false,
                status: { notIn: ['EXPIRED', 'FINISHED', 'PROCESSING', 'QUEUED'] },
            }
        })

        // Step 3: Use the same Brasilia date and cadence rules as the worker.
        const campaignsToQueue = scheduledCampaigns.filter(campaign => shouldQueueScheduledCampaign(campaign, now))

        console.log(`[Cron] Enqueuing ${campaignsToQueue.length} campaigns.`)

        // Step 4: Mark as QUEUED
        if (campaignsToQueue.length > 0) {
            await prisma.campaign.updateMany({
                where: { id: { in: campaignsToQueue.map(campaign => campaign.id) } },
                data: { status: 'QUEUED' }
            })

            nexusLogStore.addLog(`Agendador: ${campaignsToQueue.length} campanha(s) enfileirada(s) para ${currentTime}`, 'SYSTEM')

            // Step 5: Trigger GitHub Worker
            await triggerNexusWorker()
        } else {
            console.log(`[Cron] No campaigns scheduled for ${currentTime}`)
            nexusLogStore.addLog(`Verificação agendada: ${currentTime} - Nenhuma campanha`, 'INFO')
        }

        return NextResponse.json({
            message: 'Queuing process completed',
            time: currentTime,
            archivedCount,
            expiredOnlyCount,
            enqueuedCount: campaignsToQueue.length
        })
    } catch (error) {
        console.error('[Cron] Critical error:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
