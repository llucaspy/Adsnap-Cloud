import 'dotenv/config'
import prisma from '../lib/prisma'
import { processCampaign } from '../lib/captureService'
import { nexusLogStore } from '../lib/nexusLogStore'

async function worker() {
    console.log('[Nexus Worker] Iniciando processamento de fila...')
    await nexusLogStore.addLog('Nexus Worker: Iniciando ciclo de capturas', 'SYSTEM')

    try {
        // 1. Auto-enquadramento (Scheduling Check)
        // Busca campanhas agendadas que precisam ser movidas para a fila
        const brtNowStr = new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
        const brtNow = new Date(brtNowStr);
        const today = new Date(Date.UTC(brtNow.getFullYear(), brtNow.getMonth(), brtNow.getDate()));
        const currentTime = `${String(brtNow.getHours()).padStart(2, '0')}:${String(brtNow.getMinutes()).padStart(2, '0')}`;

        console.log(`[Nexus Worker] Verificando agendamentos (Data: ${today.toISOString()}, Hora: ${currentTime})`)

        const scheduledCampaigns = await prisma.campaign.findMany({
            where: {
                isScheduled: true,
                isArchived: false,
                status: { notIn: ['EXPIRED', 'FINISHED', 'PROCESSING', 'QUEUED'] },
                OR: [
                    { flightStart: { lte: today }, flightEnd: { gte: today } },
                    { flightStart: null, flightEnd: null }
                ]
            }
        });

        const toQueueIds = scheduledCampaigns.filter(c => {
            try {
                const times = JSON.parse(c.scheduledTimes || '[]') as string[];
                const lastCapture = c.lastCaptureAt ? new Date(c.lastCaptureAt) : null;

                return times.some((t: string) => {
                    const [h, m] = t.split(':').map(Number);
                    const scheduledDate = new Date(today);
                    scheduledDate.setUTCHours(h + 3, m, 0, 0); // Convert BRT to UTC (assuming BRT is UTC-3)

                    // Se o horário agendado já passou e não houve captura hoje depois desse horário
                    const hasPassed = brtNow.getTime() >= (new Date(brtNow.getFullYear(), brtNow.getMonth(), brtNow.getDate(), h, m)).getTime();
                    const notCapturedYet = !lastCapture || lastCapture.getTime() < (new Date(brtNow.getFullYear(), brtNow.getMonth(), brtNow.getDate(), h, m)).getTime();

                    return hasPassed && notCapturedYet;
                });
            } catch { return false; }
        }).map(c => c.id);

        if (toQueueIds.length > 0) {
            console.log(`[Nexus Worker] Enfileirando ${toQueueIds.length} campanhas agendadas pendentes.`)
            await prisma.campaign.updateMany({
                where: { id: { in: toQueueIds } },
                data: { status: 'QUEUED' }
            });
            await nexusLogStore.addLog(`Nexus Worker: ${toQueueIds.length} campanhas agendadas enfileiradas automaticamente`, 'SYSTEM');
        }

        // 2. Buscar campanhas que precisam de captura
        // - Status PENDING ou QUEUED
        // - Que não foram arquivadas
        const campaigns = await prisma.campaign.findMany({
            where: {
                status: { in: ['PENDING', 'QUEUED'] },
                isArchived: false
            },
        })

        if (campaigns.length === 0) {
            console.log('[Nexus Worker] Campanha não encontrada para debug.')
            return
        }

        console.log(`[Nexus Worker] Encontradas ${campaigns.length} campanhas para processar.`)
        await nexusLogStore.addLog(`Nexus Worker: Processando ${campaigns.length} itens`, 'SYSTEM')

        for (const campaign of campaigns) {
            console.log(`[Nexus Worker] Processando: ${campaign.client} - ${campaign.format}`)

            try {
                // Atualiza para PROCESSING para evitar duplicidade (embora o GHA rode serial)
                await prisma.campaign.update({
                    where: { id: campaign.id },
                    data: { status: 'PROCESSING' }
                })

                const result = await processCampaign(campaign.id)

                if (result.success) {
                    console.log(`[Nexus Worker] Sucesso: ${campaign.id}`)
                } else {
                    console.error(`[Nexus Worker] Falha: ${campaign.id} - ${result.error}`)
                }
            } catch (err) {
                console.error(`[Nexus Worker] Erro crítico na campanha ${campaign.id}:`, err)
            }
        }

    } catch (error) {
        console.error('[Nexus Worker] Erro fatal no worker:', error)
        await nexusLogStore.addLog('Nexus Worker: Erro fatal durante a execução', 'ERROR')
    } finally {
        console.log('[Nexus Worker] Ciclo finalizado.')
        await nexusLogStore.addLog('Nexus Worker: Ciclo finalizado', 'SYSTEM')
        await prisma.$disconnect()
    }
}

// Executar
worker()
