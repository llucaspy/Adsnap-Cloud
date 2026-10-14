import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const url = new URL(process.env.DATABASE_URL || '')
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/adsnap_worker_test') throw new Error('UI fixtures require the isolated local test database')
const prisma = new PrismaClient()
const prefix = 'ui-review-20261014'
try {
    await prisma.user.upsert({ where: { email: 'review@local.invalid' }, update: {}, create: { id: `${prefix}-user`, email: 'review@local.invalid', name: 'Revisão local', password: await bcrypt.hash('local-review-only', 10), role: 'admin' } })
    await prisma.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1, bannerFormats: JSON.stringify([{ id: 'fixture-300x250', label: 'Retângulo de teste', width: 300, height: 250, selector: '#fixture-slot' }]) } })
    const campaign = await prisma.campaign.upsert({ where: { id: `${prefix}-campaign` }, update: {}, create: { id: `${prefix}-campaign`, agency: 'Fixture local', client: 'Campanha de demonstração', campaignName: 'Diagnóstico do worker', pi: 'TESTE-LOCAL', format: 'fixture-300x250', url: 'https://example.invalid/fixture', status: 'FAILED', lastWorkerError: 'CREATIVE_NOT_CONFIRMED: o slot não contém criativo visível.' } })
    const longRun = 'gh-12345678-20261014-fixture-run-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    await prisma.workerJob.upsert({ where: { id: `${prefix}-job` }, update: { runId: longRun }, create: { id: `${prefix}-job`, campaignId: campaign.id, status: 'FAILED', runId: longRun, attempts: 2, maxAttempts: 2, startedAt: new Date(Date.now() - 120_000), finishedAt: new Date(), createdAt: new Date(Date.now() - 180_000), lastError: 'CREATIVE_NOT_CONFIRMED: o slot não contém criativo visível.' } })
    await prisma.nexusLog.createMany({ data: [
        { id: `${prefix}-error`, campaignId: campaign.id, level: 'ERROR', message: 'Captura interrompida: criativo não confirmado', details: JSON.stringify({ code: 'CREATIVE_NOT_CONFIRMED', stage: 'creative-validation', runId: 'fixture-run', access_token: 'FIXTURE_SECRET_ONLY' }), createdAt: new Date(Date.now() - 60_000) },
        { id: `${prefix}-run-start`, level: 'SYSTEM', message: 'Nexus Worker: Ciclo iniciado', details: JSON.stringify({ runId: 'fixture-run' }), createdAt: new Date(Date.now() - 120_000) },
        { id: `${prefix}-run-end`, level: 'ERROR', message: 'Nexus Worker: Ciclo finalizado (0 sucesso, 1 falha)', details: JSON.stringify({ runId: 'fixture-run', captureSummary: { claimed: 1, success: 0, failed: 1 } }) },
    ], skipDuplicates: true })
    console.log(JSON.stringify({ fixture: prefix, login: 'review@local.invalid', password: 'local-review-only', job: `${prefix}-job` }))
} finally { await prisma.$disconnect() }
