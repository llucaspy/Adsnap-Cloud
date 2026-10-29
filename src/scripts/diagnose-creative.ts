import '../lib/env'
import prisma from '../lib/prisma'
import { launchCaptureBrowser } from '../lib/captureBrowser'
import { fetchPublicCaptureBuffer } from '../lib/captureNetwork'
import { inspectCreativeContent } from '../lib/captureValidation'
import { nexusLogStore } from '../lib/nexusLogStore'

async function main() {
    const ids = (process.env.TARGET_CAMPAIGN_IDS || '').split(',').filter(Boolean)
    if (!ids.length || ids.length > 2) throw new Error('Diagnostico requer um ou dois registros explicitos')
    const campaigns = await prisma.campaign.findMany({ where: { id: { in: ids }, isArchived: false }, select: { id: true, url: true } })
    const asset = process.env.CREATIVE_DOCUMENT_URL || ''
    if (asset && !/^https:\/\/(?:[\w-]+\.)*00px\.net\/rocket\/[\w-]+\/index\.html$/.test(asset)) throw new Error('Pacote HTML5 invalido')
    const browser = await launchCaptureBrowser({ headless: true })
    try {
        const context = await browser.newContext({ viewport: { width: 1920, height: 928 }, serviceWorkers: 'block',
            userAgent: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browser.version()} Safari/537.36` })
        for (const campaign of campaigns) {
            const page = await context.newPage(), session = await context.newCDPSession(page)
            const requests = new Map<string, string>(), responses: { id: string; status: number; mime: string; length: string }[] = []
            await session.send('Network.enable')
            session.on('Network.requestWillBeSent', event => {
                try { const url = new URL(event.request.url)
                    if (/(^|\.)00px\.net$/.test(url.hostname)) requests.set(event.requestId, url.hostname)
                } catch { /* Non-URL browser internals are outside this diagnostic. */ }
            })
            session.on('Network.responseReceivedExtraInfo', event => responses.push({ id: event.requestId, status: event.statusCode,
                mime: String(event.headers['content-type'] || event.headers['Content-Type'] || ''), length: String(event.headers['content-length'] || event.headers['Content-Length'] || '') }))
            await page.goto(campaign.url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
            await page.locator('#div-gpt-ad-home-destaque-1').scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => null)
            await page.waitForTimeout(10_000)
            const network = responses.filter(r => requests.has(r.id)).map(r => ({ host: requests.get(r.id), status: r.status, mime: r.mime, length: r.length }))
            const evidence = await inspectCreativeContent(page.locator('#div-gpt-ad-home-destaque-1')).catch(() => null)
            let packageResult: object | undefined
            if (asset) {
                let download: object
                try { download = { bytes: (await fetchPublicCaptureBuffer(asset, AbortSignal.timeout(20_000))).length } }
                catch { download = { failed: true } }
                const assetPage = await context.newPage()
                try {
                    const response = await assetPage.goto(asset, { waitUntil: 'domcontentloaded', timeout: 30_000 })
                    await assetPage.waitForTimeout(3_000)
                    packageResult = { download, status: response?.status(), evidence: await inspectCreativeContent(assetPage.locator('body')) }
                } finally { await assetPage.close() }
            }
            const details = JSON.stringify({ campaignId: campaign.id, network, evidence, packageResult })
            await nexusLogStore.addLog('Nexus: diagnostico de rede do criativo', 'SYSTEM', details, campaign.id)
            console.log(details)
            await page.close()
        }
    } finally { await browser.close() }
}
main().catch(error => { console.error(String(error.message).replace(/https?:\/\/\S+/g, '[URL]').slice(0,400)); process.exitCode = 1 }).finally(() => prisma.$disconnect())
