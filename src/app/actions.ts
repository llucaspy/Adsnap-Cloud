'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { nexusLogStore } from '@/lib/nexusLogStore'

export async function getNexusActivity() {
    try {
        const logs = await prisma.nexusLog.findMany({
            take: 50,
            orderBy: { createdAt: 'desc' }
        });

        return logs.map(log => ({
            message: log.message,
            type: log.level,
            timestamp: log.createdAt.getTime()
        })).reverse(); // Reverse to show chronological order in the feed
    } catch (error) {
        console.error('[Actions] Failed to fetch nexus activity:', error);
        return [];
    }
}


export async function runCapture(campaignId: string) {
    // On Vercel, we only queue. The GitHub worker will do the actual capture.
    await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: 'QUEUED' }
    })

    nexusLogStore.addLog(`Nexus: Campanha individual enfileirada.`, 'SYSTEM')

    // Attempt to trigger worker immediately
    const triggered = await triggerNexusWorker()
    if (!triggered) {
        nexusLogStore.addLog('Nexus: Worker não disparado (verifique GITHUB_TOKEN e GITHUB_REPO)', 'ERROR')
    }

    revalidatePath('/')
    return { success: true, message: 'Capture queued for GitHub Worker' }
}

export async function getCampaignDetailsByPi(pi: string) {
    const campaign = await prisma.campaign.findFirst({
        where: { pi },
        orderBy: { createdAt: 'desc' },
        select: {
            agency: true,
            client: true,
            campaignName: true,
            format: true,
            url: true,
            device: true,
            segmentation: true,
            flightStart: true,
            flightEnd: true
        }
    })
    return campaign
}

export async function createCampaign(formData: FormData) {
    const agency = formData.get('agency') as string
    const client = formData.get('client') as string
    const campaignName = formData.get('campaignName') as string
    const pi = formData.get('pi') as string
    const format = formData.get('format') as string
    const url = formData.get('url') as string
    const device = (formData.get('device') as string) || 'desktop'
    const segmentation = (formData.get('segmentation') as string) || 'PRIVADO'

    // Flight dates
    const flightStartStr = formData.get('flightStart') as string
    const flightEndStr = formData.get('flightEnd') as string
    const flightStart = flightStartStr ? new Date(flightStartStr) : null
    const flightEnd = flightEndStr ? new Date(flightEndStr) : null

    // Scheduling fields - now supports multiple times
    const isScheduled = formData.get('isScheduled') === 'true'
    const scheduledTimesStr = formData.get('scheduledTimes') as string
    const scheduledTimes = scheduledTimesStr || '[]'

    if (!agency || !client || !pi || !format || !url) {
        throw new Error('Todos os campos são obrigatórios')
    }

    const campaign = await prisma.campaign.create({
        data: {
            agency,
            client,
            campaignName,
            pi,
            format,
            url,
            device,
            segmentation,
            flightStart,
            flightEnd,
            status: 'PENDING',
            isScheduled,
            scheduledTimes,
        },
    })

    revalidatePath('/')
    return campaign
}

export async function createMultipleCampaigns(payload: {
    agency: string
    client: string
    campaignName: string
    pi: string
    segmentation: string
    flightStart: string | null
    flightEnd: string | null
    isScheduled: boolean
    scheduledTimes: string
    mediaEntries: { url: string; device: string; format: string }[]
}) {
    const {
        agency, client, campaignName, pi, segmentation,
        flightStart: flightStartStr, flightEnd: flightEndStr,
        isScheduled, scheduledTimes, mediaEntries
    } = payload

    if (!agency || !client || !pi || mediaEntries.length === 0) {
        throw new Error('Dados da campanha e pelo menos um formato são obrigatórios')
    }

    const flightStart = flightStartStr ? new Date(flightStartStr) : null
    const flightEnd = flightEndStr ? new Date(flightEndStr) : null

    const results = []

    for (const entry of mediaEntries) {
        if (!entry.url || !entry.format) continue

        const campaign = await prisma.campaign.create({
            data: {
                agency,
                client,
                campaignName,
                pi,
                format: entry.format,
                url: entry.url,
                device: entry.device || 'desktop',
                segmentation,
                flightStart,
                flightEnd,
                status: 'PENDING',
                isScheduled,
                scheduledTimes,
            },
        })
        results.push(campaign)
    }

    revalidatePath('/')
    revalidatePath('/monitoring')
    return { success: true, count: results.length }
}

export async function archiveCampaign(id: string, isArchived: boolean = true) {
    await prisma.campaign.update({
        where: { id },
        data: { isArchived }
    })
    revalidatePath('/')
}

export async function deleteCampaign(id: string) {
    await prisma.campaign.delete({
        where: { id }
    })
    revalidatePath('/')
}

export async function updateCampaign(id: string, formData: FormData) {
    const agency = formData.get('agency') as string
    const client = formData.get('client') as string
    const campaignName = formData.get('campaignName') as string
    const pi = formData.get('pi') as string
    const format = formData.get('format') as string
    const url = formData.get('url') as string
    const device = (formData.get('device') as string) || 'desktop'
    const segmentation = (formData.get('segmentation') as string) || 'PRIVADO'

    // Flight dates
    const flightStartStr = formData.get('flightStart') as string
    const flightEndStr = formData.get('flightEnd') as string
    const flightStart = flightStartStr ? new Date(flightStartStr) : null
    const flightEnd = flightEndStr ? new Date(flightEndStr) : null

    // Scheduling fields - now supports multiple times
    const isScheduled = formData.get('isScheduled') === 'true'
    const scheduledTimesStr = formData.get('scheduledTimes') as string
    const scheduledTimes = scheduledTimesStr || '[]'

    if (!agency || !client || !pi || !format || !url) {
        throw new Error('Todos os campos são obrigatórios')
    }

    const campaign = await prisma.campaign.update({
        where: { id },
        data: {
            agency,
            client,
            campaignName,
            pi,
            format,
            url,
            device,
            segmentation,
            flightStart,
            flightEnd,
            isScheduled,
            scheduledTimes,
        },
    })

    revalidatePath('/')
    revalidatePath('/monitoring')
    return campaign
}

export async function addFormatToCampaign(data: {
    agency: string
    client: string
    campaignName: string
    pi: string
    segmentation: string
    url: string
    device: string
    format: string
    flightStart: string | null
    flightEnd: string | null
    isScheduled: boolean
    scheduledTimes: string
}) {
    if (!data.agency || !data.client || !data.pi || !data.format || !data.url) {
        throw new Error('Todos os campos são obrigatórios')
    }

    const campaign = await prisma.campaign.create({
        data: {
            agency: data.agency,
            client: data.client,
            campaignName: data.campaignName,
            pi: data.pi,
            format: data.format,
            url: data.url,
            device: data.device || 'desktop',
            segmentation: data.segmentation || 'PRIVADO',
            flightStart: data.flightStart ? new Date(data.flightStart) : null,
            flightEnd: data.flightEnd ? new Date(data.flightEnd) : null,
            status: 'PENDING',
            isScheduled: data.isScheduled || false,
            scheduledTimes: data.scheduledTimes || '[]',
        },
    })

    revalidatePath('/')
    revalidatePath('/monitoring')
    return campaign
}

// Get schedule usage stats for UI display
export async function getScheduleUsage(): Promise<Record<string, number>> {
    const campaigns = await prisma.campaign.findMany({
        where: {
            isScheduled: true,
            isArchived: false
        },
        select: { scheduledTimes: true as any }
    })

    const usage: Record<string, number> = {}

    for (const campaign of campaigns) {
        try {
            const times = JSON.parse((campaign as any).scheduledTimes) as string[]
            for (const time of times) {
                usage[time] = (usage[time] || 0) + 1
            }
        } catch {
            // Ignore invalid JSON
        }
    }

    return usage
}

export async function getQueueStatus() {
    const campaigns = await prisma.campaign.findMany({
        where: {
            status: { in: ['QUEUED', 'PROCESSING'] },
            isArchived: false
        },
        select: {
            id: true,
            client: true,
            status: true,
            campaignName: true as any
        }
    }) as any
    return campaigns
}

export async function runAllCaptures() {
    console.log('[Nexus] Starting manual global capture process...')

    // Generate BRT-normalized "today" at 00:00 UTC for consistent date comparison
    const brtNowStr = new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
    const brtNow = new Date(brtNowStr);
    const today = new Date(Date.UTC(brtNow.getFullYear(), brtNow.getMonth(), brtNow.getDate()));

    // Find only campaigns currently in their airing period
    const campaigns = await prisma.campaign.findMany({
        where: {
            isArchived: false,
            status: { notIn: ['EXPIRED', 'FINISHED'] },
            OR: [
                // Currently in flight (flightEnd includes the full last day until 23:59)
                {
                    flightStart: { lte: today },
                    flightEnd: { gte: today }
                },
                // Legacy campaigns without flight dates
                {
                    flightStart: null,
                    flightEnd: null
                }
            ]
        } as any
    })

    if (campaigns.length === 0) return { success: true, count: 0 }

    // Mark as QUEUED
    nexusLogStore.addLog(`Nexus: Lote de ${campaigns.length} capturas enfileirado manualmente.`, 'SYSTEM')

    // Batch update to QUEUED
    await prisma.campaign.updateMany({
        where: { id: { in: campaigns.map((c: any) => c.id) } },
        data: { status: 'QUEUED' }
    })

    // Trigger GitHub Worker
    const triggered = await triggerNexusWorker()
    if (!triggered) {
        nexusLogStore.addLog('Nexus: Worker não disparado (verifique GITHUB_TOKEN e GITHUB_REPO)', 'ERROR')
    }

    revalidatePath('/')
    return { success: true, count: campaigns.length }
}

/**
 * Triggers the GitHub Actions worker immediately via workflow_dispatch.
 * Requires GITHUB_TOKEN and GITHUB_REPO to be set in Vercel.
 */
export async function triggerNexusWorker() {
    const token = process.env.GITHUB_TOKEN
    let repo = process.env.GITHUB_REPO // Expected: "owner/repo"

    if (!token || !repo) {
        const missing = [];
        if (!token) missing.push('GITHUB_TOKEN');
        if (!repo) missing.push('GITHUB_REPO');

        console.warn(`[Nexus] Missing environment variables: ${missing.join(', ')}. Skipping manual trigger.`);
        nexusLogStore.addLog(`Nexus: Gatilho manual ignorado (Faltam chaves: ${missing.join(', ')})`, 'INFO');
        return false
    }

    // Sanitize repo if it's a full URL
    if (repo.includes('github.com/')) {
        repo = repo.split('github.com/')[1].replace(/\/$/, '').replace(/\.git$/, '')
    }

    try {
        console.log(`[Nexus] Triggering GitHub worker for ${repo}...`)
        const response = await fetch(
            `https://api.github.com/repos/${repo}/actions/workflows/nexus-worker.yml/dispatches`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28',
                    'User-Agent': 'Adsnap-Nexus-Agent'
                },
                body: JSON.stringify({
                    ref: 'main' // Trigger the main branch
                })
            }
        )

        if (response.ok) {
            console.log('[Nexus] GitHub worker triggered successfully.')
            nexusLogStore.addLog('Nexus: Worker disparado com sucesso no GitHub', 'SUCCESS')
            return true
        } else {
            const error = await response.text()
            console.error('[Nexus] GitHub trigger failed:', error)
            nexusLogStore.addLog(`Nexus: Falha ao disparar GitHub Worker: ${response.status}`, 'ERROR')
            return false
        }
    } catch (err) {
        console.error('[Nexus] Error triggering GitHub worker:', err)
        return false
    }
}

export async function bulkCreateCampaigns(campaigns: any[]) {
    console.log(`[Nexus] Bulk creating ${campaigns.length} campaigns...`)

    const results = []

    for (const data of campaigns) {
        try {
            const campaign = await prisma.campaign.create({
                data: {
                    agency: data.agency || 'Adsnap',
                    client: data.client || 'Sem Cliente',
                    campaignName: data.campaignName || data.client || 'Nova Campanha',
                    pi: data.pi || '000',
                    format: data.format || 'Display',
                    url: data.url,
                    device: data.device || 'desktop',
                    segmentation: data.segmentation || 'PRIVADO',
                    flightStart: data.flightStart ? new Date(data.flightStart) : null,
                    flightEnd: data.flightEnd ? new Date(data.flightEnd) : null,
                    status: 'PENDING',
                    isScheduled: false,
                    scheduledTimes: '[]'
                }
            })
            results.push({ success: true, id: campaign.id })
        } catch (err) {
            console.error('Bulk item error:', err)
            results.push({ success: false, error: (err as Error).message })
        }
    }

    revalidatePath('/')
    revalidatePath('/monitoring')

    return {
        success: true,
        createdCount: results.filter(r => r.success).length,
        failedCount: results.filter(r => !r.success).length
    }
}

// --- NEXUS CONTROL ACTIONS ---

export async function stopAllCaptures() {
    // Reset all QUEUED and PROCESSING campaigns to PENDING
    const result = await prisma.campaign.updateMany({
        where: {
            status: { in: ['QUEUED', 'PROCESSING'] },
            isArchived: false
        },
        data: { status: 'PENDING' }
    })

    nexusLogStore.addLog(`Nexus: Interrupção forçada. ${result.count} campanha(s) resetada(s).`, 'SYSTEM')
    revalidatePath('/')

    return { success: true, stoppedCount: result.count }
}

export async function scheduleAllCampaigns(time: string) {
    // Validate time format (HH:mm)
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/
    if (!timeRegex.test(time)) {
        return { success: false, error: 'Formato de horário inválido. Use HH:mm (ex: 14:30)' }
    }

    // Get all active (non-archived) campaigns
    const campaigns = await prisma.campaign.findMany({
        where: { isArchived: false }
    })

    let updatedCount = 0

    for (const campaign of campaigns) {
        let currentTimes: string[] = []
        try {
            currentTimes = JSON.parse(campaign.scheduledTimes || '[]')
        } catch {
            currentTimes = []
        }

        // Add time if not already present
        if (!currentTimes.includes(time)) {
            currentTimes.push(time)
            currentTimes.sort() // Keep times sorted
        }

        await prisma.campaign.update({
            where: { id: campaign.id },
            data: {
                isScheduled: true,
                scheduledTimes: JSON.stringify(currentTimes)
            }
        })
        updatedCount++
    }

    nexusLogStore.addLog(`Nexus: ${updatedCount} campanha(s) agendada(s) para ${time}.`, 'SUCCESS')
    revalidatePath('/')

    return { success: true, updatedCount, time }
}

// --- SETTINGS ACTIONS ---

export async function getSettings() {
    let settings = await prisma.settings.findUnique({
        where: { id: 1 }
    })

    if (!settings) {
        // Create initial default settings
        settings = await prisma.settings.create({
            data: { id: 1 }
        })
    }

    return settings
}

export async function updateSettings(data: any) {
    const settings = await prisma.settings.update({
        where: { id: 1 },
        data: {
            nexusMaxRetries: Number(data.nexusMaxRetries),
            nexusTimeout: Number(data.nexusTimeout),
            nexusDelay: Number(data.nexusDelay),
            autoCleanupDays: Number(data.autoCleanupDays),
            webhookUrl: data.webhookUrl,
            performanceMode: Boolean(data.performanceMode),
            feedPollingRate: Number(data.feedPollingRate),
            maintenanceMode: Boolean(data.maintenanceMode),
            bannerFormats: data.bannerFormats,
            telegramChatId: data.telegramChatId || null,
        } as any
    })

    nexusLogStore.addLog('Nexus: Configurações globais atualizadas.', 'SYSTEM')
    revalidatePath('/')
    return settings
}

export async function testTelegramNotification() {
    const { sendTelegramAlert } = await import('@/lib/telegram')
    const success = await sendTelegramAlert(
        'Teste de Notificação',
        'Se você está recebendo esta mensagem, a integração Telegram está funcionando corretamente!',
        'Adsnap Cloud — Nexus Engine'
    )
    return { success }
}

export async function deleteCapture(id: string) {
    console.log(`[Nexus] Requesting deletion of capture ${id}...`);
    try {
        const capture = await prisma.capture.findUnique({
            where: { id },
            select: { screenshotPath: true }
        });

        if (capture && capture.screenshotPath) {
            // 1. If it's a Supabase URL, remove from Storage
            if (capture.screenshotPath.startsWith('http')) {
                const { supabase } = await import('@/lib/supabase')
                // Extract part after 'screenshots/'
                const path = capture.screenshotPath.split('screenshots/')[1]
                if (path) {
                    const { error } = await supabase.storage.from('screenshots').remove([path])
                    if (error) console.error('[Nexus Storage] Delete error:', error)
                    else console.log(`[Nexus Storage] File removed: ${path}`)
                }
            }
            // 2. Legacy fallback for local files
            else {
                const fs = require('fs');
                try {
                    if (fs.existsSync(capture.screenshotPath)) {
                        fs.unlinkSync(capture.screenshotPath);
                        console.log(`[Nexus] Local file deleted: ${capture.screenshotPath}`);
                    }
                } catch (e) {
                    console.error('[Nexus] Local file delete fail:', e);
                }
            }
        }


        await prisma.capture.delete({
            where: { id }
        });

        revalidatePath('/');
        revalidatePath('/books');

        nexusLogStore.addLog(`Nexus: Evidência ${id} removida permanentemente.`, 'SYSTEM');
        return { success: true };
    } catch (error) {
        console.error('[Delete Capture Error]', error);
        return { success: false, error: (error as Error).message };
    }
}

export async function getStorageUsage() {
    try {
        const result = await (prisma as any).$queryRawUnsafe(
            `SELECT SUM((metadata->>'size')::bigint) as total_size 
             FROM storage.objects 
             WHERE bucket_id = 'screenshots'`
        ) as any[]
        const bytesUsed = Number(result[0]?.total_size || 0)
        const totalLimit = 1024 * 1024 * 1024 // 1GB
        const percentage = (bytesUsed / totalLimit) * 100
        return {
            used: bytesUsed,
            limit: totalLimit,
            percentage: Math.min(percentage, 100),
            formattedUsed: (bytesUsed / (1024 * 1024)).toFixed(2) + ' MB'
        }
    } catch (error) {
        console.error('[Actions] Error fetching storage usage:', error)
        return { used: 0, limit: 1024 * 1024 * 1024, percentage: 0, formattedUsed: '0 MB' }
    }
}

export async function getAdminMetrics() {
    try {
        // 1. Supabase Storage (already implemented logic)
        const storageResult = await (prisma as any).$queryRawUnsafe(
            `SELECT SUM((metadata->>'size')::bigint) as total_size 
             FROM storage.objects 
             WHERE bucket_id = 'screenshots'`
        ) as any[]
        const storageBytes = Number(storageResult[0]?.total_size || 0)

        // 2. Supabase Database Size
        const dbResult = await (prisma as any).$queryRawUnsafe(
            `SELECT pg_database_size(current_database()) as total_size`
        ) as any[]
        const dbBytes = Number(dbResult[0]?.total_size || 0)

        // 3. Resend Email Usage (Tracked via NexusLogs)
        const today = new Date()
        today.setHours(0, 0, 0, 0)

        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)

        const [dailyEmails, monthlyEmails] = await Promise.all([
            prisma.nexusLog.count({
                where: {
                    level: 'SYSTEM',
                    message: { contains: '[ALERTA STORAGE]' }, // For now, alerts are the only emails
                    createdAt: { gte: today }
                }
            }),
            prisma.nexusLog.count({
                where: {
                    level: 'SYSTEM',
                    message: { contains: '[ALERTA STORAGE]' },
                    createdAt: { gte: firstDayOfMonth }
                }
            })
        ])

        // 4. Nexus Health
        const settings = await prisma.settings.findFirst()
        const lastRun = settings?.storageCheckLastRun

        return {
            storage: {
                used: storageBytes,
                limit: 1024 * 1024 * 1024, // 1GB
                percentage: (storageBytes / (1024 * 1024 * 1024)) * 100,
                formatted: (storageBytes / (1024 * 1024)).toFixed(2) + ' MB'
            },
            database: {
                used: dbBytes,
                limit: 500 * 1024 * 1024, // 500MB free tier
                percentage: (dbBytes / (500 * 1024 * 1024)) * 100,
                formatted: (dbBytes / (1024 * 1024)).toFixed(2) + ' MB'
            },
            resend: {
                dailyUsed: dailyEmails,
                dailyLimit: 100,
                monthlyUsed: monthlyEmails,
                monthlyLimit: 3000,
                percentage: (dailyEmails / 100) * 100
            },
            health: {
                lastRun: lastRun,
                isHealthy: lastRun ? (new Date().getTime() - lastRun.getTime() < 24 * 60 * 60 * 1000) : false
            }
        }
    } catch (error) {
        console.error('[Actions] Error fetching dashboard metrics:', error)
        throw error
    }
}

// --- EMAIL DISPATCH ACTIONS ---

export async function getEmailDispatches() {
    const dispatches = await (prisma as any).emailDispatch.findMany({
        orderBy: { createdAt: 'desc' },
    })

    // For each dispatch, fetch all campaigns with the same PI
    const results = []
    for (const d of dispatches) {
        const pi = d.pi || ''
        let campaigns: any[] = []

        if (pi) {
            campaigns = await prisma.campaign.findMany({
                where: { pi, isArchived: false },
                select: {
                    id: true, client: true, agency: true, campaignName: true,
                    format: true, pi: true, device: true,
                    flightStart: true, flightEnd: true, status: true,
                },
                orderBy: { createdAt: 'asc' }
            })
        } else if (d.campaignId) {
            // Legacy fallback
            const campaign = await prisma.campaign.findUnique({
                where: { id: d.campaignId },
                select: {
                    id: true, client: true, agency: true, campaignName: true,
                    format: true, pi: true, device: true,
                    flightStart: true, flightEnd: true, status: true,
                }
            })
            if (campaign) campaigns = [campaign]
        }

        // Resolve format labels
        let settings: any = null
        try { settings = await prisma.settings.findUnique({ where: { id: 1 } }) } catch { }
        const bannerFormats = settings ? JSON.parse((settings as any).bannerFormats || '[]') : []

        const formatsResolved = campaigns.map((c: any) => {
            const match = bannerFormats.find((f: any) => f.id === c.format)
            return {
                ...c,
                formatLabel: match ? (match.label || `${match.width}x${match.height}`) : c.format,
                flightStart: c.flightStart?.toISOString() || null,
                flightEnd: c.flightEnd?.toISOString() || null,
            }
        })

        const firstCampaign = formatsResolved[0] || null

        results.push({
            ...d,
            createdAt: d.createdAt.toISOString(),
            updatedAt: d.updatedAt.toISOString(),
            lastSentAt: d.lastSentAt?.toISOString() || null,
            pi: d.pi || firstCampaign?.pi || '',
            campaign: firstCampaign,
            campaigns: formatsResolved,
            formatCount: formatsResolved.length,
        })
    }

    return results
}

export async function getCampaignsForDispatch() {
    const campaigns = await prisma.campaign.findMany({
        where: {
            isArchived: false,
            flightEnd: { not: null },
        },
        orderBy: { createdAt: 'desc' },
        select: {
            id: true, client: true, agency: true, campaignName: true,
            format: true, pi: true, device: true,
            flightStart: true, flightEnd: true, status: true,
            emailDispatches: { select: { id: true } } as any
        }
    })

    // Resolve format labels
    let settings: any = null
    try { settings = await prisma.settings.findUnique({ where: { id: 1 } }) } catch { }
    const bannerFormats = settings ? JSON.parse((settings as any).bannerFormats || '[]') : []

    // Group campaigns by PI
    const grouped: Record<string, any[]> = {}
    for (const c of campaigns) {
        const key = c.pi || c.id
        if (!grouped[key]) grouped[key] = []
        grouped[key].push(c)
    }

    // Check which PIs already have dispatches
    const existingDispatches = await (prisma as any).emailDispatch.findMany({
        select: { pi: true }
    })
    const dispatchedPis = new Set(existingDispatches.map((d: any) => d.pi).filter(Boolean))

    // Return grouped campaigns
    return Object.entries(grouped).map(([pi, cams]) => {
        const first = cams[0]
        const formats = cams.map((c: any) => {
            const match = bannerFormats.find((f: any) => f.id === c.format)
            return {
                id: c.id,
                format: c.format,
                formatLabel: match ? (match.label || `${match.width}x${match.height}`) : c.format,
                device: c.device,
            }
        })

        return {
            pi,
            client: first.client,
            agency: first.agency,
            campaignName: first.campaignName,
            flightStart: first.flightStart?.toISOString() || null,
            flightEnd: first.flightEnd?.toISOString() || null,
            status: first.status,
            formats,
            formatCount: formats.length,
            hasDispatch: dispatchedPis.has(pi),
        }
    })
}

export async function createEmailDispatch(data: {
    pi: string
    recipients: string[]
    dispatchTime: string
}) {
    if (!data.pi || data.recipients.length === 0) {
        throw new Error('Campanha e pelo menos um destinatário são obrigatórios')
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    for (const email of data.recipients) {
        if (!emailRegex.test(email.trim())) {
            throw new Error(`E-mail inválido: ${email}`)
        }
    }

    const dispatch = await (prisma as any).emailDispatch.create({
        data: {
            pi: data.pi,
            recipients: JSON.stringify(data.recipients.map(e => e.trim())),
            dispatchTime: data.dispatchTime || '09:00',
            isActive: true,
            status: 'PENDING',
        }
    })

    nexusLogStore.addLog(`Email Dispatch: Configuração criada para PI ${data.pi}`, 'SYSTEM')
    revalidatePath('/email-dispatch')
    return dispatch
}

export async function updateEmailDispatch(id: string, data: {
    recipients?: string[]
    dispatchTime?: string
    isActive?: boolean
}) {
    const updateData: any = {}

    if (data.recipients !== undefined) {
        updateData.recipients = JSON.stringify(data.recipients.map(e => e.trim()))
    }
    if (data.dispatchTime !== undefined) {
        updateData.dispatchTime = data.dispatchTime
    }
    if (data.isActive !== undefined) {
        updateData.isActive = data.isActive
    }

    const dispatch = await (prisma as any).emailDispatch.update({
        where: { id },
        data: updateData
    })

    revalidatePath('/email-dispatch')
    return dispatch
}

export async function deleteEmailDispatch(id: string) {
    await (prisma as any).emailDispatch.delete({ where: { id } })
    nexusLogStore.addLog(`Email Dispatch: Configuração removida`, 'SYSTEM')
    revalidatePath('/email-dispatch')
    return { success: true }
}

export async function sendTestEmail(dispatchId: string) {
    const dispatch = await (prisma as any).emailDispatch.findUnique({
        where: { id: dispatchId },
    })

    if (!dispatch) {
        return { success: false, error: 'Disparo não encontrado' }
    }

    const recipients = JSON.parse(dispatch.recipients) as string[]
    if (recipients.length === 0) {
        return { success: false, error: 'Nenhum destinatário configurado' }
    }

    // Send only to the first recipient as a test
    const { sendCampaignReport } = await import('@/lib/emailService')
    const result = await sendCampaignReport({
        pi: dispatch.pi,
        recipients: [recipients[0]],
        dispatchId: dispatch.id,
    })

    // Reset status back to PENDING after test
    if (result.success) {
        await (prisma as any).emailDispatch.update({
            where: { id: dispatchId },
            data: { status: 'PENDING' }
        })
    }

    revalidatePath('/email-dispatch')
    return result
}
