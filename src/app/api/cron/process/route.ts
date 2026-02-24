import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { processCampaign } from '@/lib/captureService'
import { nexusLogStore } from '@/lib/nexusLogStore'

// This route can be triggered by a Cron service (like Vercel Cron or GitHub Actions)
// or manually by hitting /api/cron/process
export async function GET(request: Request) {
    console.log('[Cron] Starting scheduled capture process...')

    try {
        // Generate "today" at 00:00 UTC based on current date in Brasilia (BRT)
        // This allows consistent comparison with Prisma Date objects (which are stored at 00:00 UTC)
        const brtNowStr = new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
        const brtNow = new Date(brtNowStr);

        const today = new Date(Date.UTC(brtNow.getFullYear(), brtNow.getMonth(), brtNow.getDate()));
        const now = new Date(); // Raw system time for relative checks if needed

        // HH:mm for schedule matching (BRT)
        const hours = String(brtNow.getHours()).padStart(2, '0');
        const minutes = String(brtNow.getMinutes()).padStart(2, '0');
        const currentTime = `${hours}:${minutes}`;

        console.log(`[Cron] Today (Normalized UTC): ${today.toISOString()}`)
        console.log(`[Cron] Current time (BRT): ${currentTime}`)

        // Step 1: Intelligent Auto-archive
        // Find campaigns that have ended (flightEnd < today)
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
            const hasCaptures = (campaign as any)._count.captures > 0

            if (hasCaptures) {
                // If has evidence, keep it visible but marked as EXPIRED
                await prisma.campaign.update({
                    where: { id: campaign.id },
                    data: { status: 'EXPIRED' }
                })
                expiredOnlyCount++
            } else {
                // No evidence? Archive and cleanup.
                await prisma.campaign.update({
                    where: { id: campaign.id },
                    data: {
                        isArchived: true,
                        status: 'EXPIRED'
                    }
                })
                archivedCount++
            }
        }

        if (candidates.length > 0) {
            console.log(`[Cron] Auto-archive check: ${archivedCount} archived, ${expiredOnlyCount} kept visible (with evidence).`)
        }

        // Step 2: Find all scheduled campaigns that are in flight
        const scheduledCampaigns = await prisma.campaign.findMany({
            where: {
                isScheduled: true,
                isArchived: false,
                status: { notIn: ['EXPIRED', 'FINISHED'] },
                OR: [
                    // Has flight dates and is currently in flight
                    // flightEnd must be today (meaning it ends at 23:59:59 of today) or in the future
                    {
                        flightStart: { lte: today },
                        flightEnd: { gte: today }
                    },
                    // No flight dates defined (legacy campaigns)
                    {
                        flightStart: null,
                        flightEnd: null
                    }
                ]
            } as any
        })

        console.log(`[Cron] Step 2: Found ${scheduledCampaigns.length} total active scheduled campaigns.`)

        // Step 3: Filter campaigns that have the current time in their schedule
        const campaignsToProcess = scheduledCampaigns.filter(campaign => {
            try {
                const times = JSON.parse((campaign as any).scheduledTimes || '[]') as string[]
                const match = times.some(t => t.trim() === currentTime)

                if (!match) {
                    // console.log(`[Cron] Skip ${campaign.client}: ${currentTime} not in ${JSON.stringify(times)}`)
                }
                return match
            } catch (e) {
                console.error(`[Cron] Error parsing scheduledTimes for ${campaign.id}:`, e)
                return false
            }
        })

        console.log(`[Cron] Found ${campaignsToProcess.length} campaigns scheduled for ${currentTime}`)

        // Log to Nexus Activity Feed
        if (campaignsToProcess.length > 0) {
            nexusLogStore.addLog(`Agendador: ${campaignsToProcess.length} campanha(s) para ${currentTime}`, 'SYSTEM')
        } else {
            nexusLogStore.addLog(`Verificação agendada: ${currentTime} - Nenhuma campanha`, 'INFO')
        }

        // Step 4: Mark all as QUEUED initially
        if (campaignsToProcess.length > 0) {
            await prisma.campaign.updateMany({
                where: { id: { in: campaignsToProcess.map(c => c.id) } },
                data: { status: 'QUEUED' }
            })
        }

        // Step 5: Process campaigns sequentially (queue system)
        const results = []
        const queueSize = campaignsToProcess.length

        for (let i = 0; i < campaignsToProcess.length; i++) {
            const campaign = campaignsToProcess[i]
            const position = i + 1

            console.log(`[Cron] Queue: Processing ${position}/${queueSize} - ${campaign.client} (PI: ${campaign.pi})`)

            // Mark current as PROCESSING
            await prisma.campaign.update({
                where: { id: campaign.id },
                data: { status: 'PROCESSING' }
            })

            const result = await processCampaign(campaign.id)

            results.push({
                id: campaign.id,
                client: campaign.client,
                queuePosition: position,
                success: result.success
            })

            // Small delay between captures to avoid overwhelming the system
            if (i < campaignsToProcess.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 3000)) // 3 second delay
            }
        }

        // Log completion to Nexus
        if (results.length > 0) {
            const successCount = results.filter(r => r.success).length
            nexusLogStore.addLog(`Lote agendado finalizado: ${successCount}/${results.length} sucesso`, successCount === results.length ? 'SUCCESS' : 'ERROR')
        }

        return NextResponse.json({
            message: 'Scheduled process completed',
            time: currentTime,
            archivedCount,
            keptVisibleWithEvidence: expiredOnlyCount,
            queueSize,
            processedCount: results.length,
            details: results
        })
    } catch (error) {
        console.error('[Cron] Critical error:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
