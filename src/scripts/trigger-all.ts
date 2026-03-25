import '../lib/env'
import prisma from '../lib/prisma'
import { nexusLogStore } from '../lib/nexusLogStore'

async function main() {
    const brtNowStr = new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })
    const brtNow = new Date(brtNowStr)
    const today = new Date(Date.UTC(brtNow.getFullYear(), brtNow.getMonth(), brtNow.getDate()))

    const campaigns = await prisma.campaign.findMany({
        where: {
            isArchived: false,
            status: { notIn: ['EXPIRED', 'FINISHED'] },
            OR: [
                { flightStart: { lte: today }, flightEnd: { gte: today } },
                { flightStart: null, flightEnd: null }
            ]
        }
    })

    console.log(`Encontradas ${campaigns.length} campanhas ativas.`)

    if (campaigns.length > 0) {
        await prisma.campaign.updateMany({
            where: { id: { in: campaigns.map(c => c.id) } },
            data: { status: 'QUEUED' }
        })
        await nexusLogStore.addLog(`Nexus: Lote de ${campaigns.length} capturas enfileirado manualmente.`, 'SYSTEM')
        console.log(`✅ ${campaigns.length} campanhas enfileiradas.`)

        // Trigger GitHub Worker
        const token = process.env.GITHUB_TOKEN
        let repo = process.env.GITHUB_REPO || ''
        if (repo.includes('github.com/')) {
            repo = repo.split('github.com/')[1].replace(/\/$/, '').replace(/\.git$/, '')
        }

        if (token && repo) {
            const res = await fetch(
                `https://api.github.com/repos/${repo}/actions/workflows/nexus-worker.yml/dispatches`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/vnd.github+json',
                        'User-Agent': 'Adsnap-Nexus'
                    },
                    body: JSON.stringify({ ref: 'main' })
                }
            )
            console.log(`GitHub trigger: ${res.status === 204 ? '✅ Sucesso' : '❌ Falhou (' + res.status + ')'}`)
            await nexusLogStore.addLog('Nexus: Worker disparado com sucesso no GitHub', 'SUCCESS')
        }
    }

    await prisma.$disconnect()
}

main().catch(console.error)
