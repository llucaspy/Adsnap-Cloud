import { chromium, Page } from 'playwright'
import path from 'path'
import type { GamCreativePreview, GamLineItemImport, GamOrderImport } from './gamImportPlanner'

function unique<T>(items: T[], getKey: (item: T) => string) {
    const seen = new Set<string>()
    return items.filter(item => {
        const key = getKey(item)
        if (seen.has(key)) return false
        seen.add(key)
        return true
    })
}

function parseOrderId(orderUrl: string) {
    return orderUrl.match(/order_id=(\d+)/i)?.[1] || 'Unknown'
}

function parseNetworkCode(orderUrl: string) {
    return orderUrl.match(/admanager\.google\.com\/(\d+)/i)?.[1] || process.env.GAM_NETWORK_CODE || ''
}

function parseCreativeId(value: string) {
    return value.match(/creative_id=(\d+)/i)?.[1] || value.match(/creativeId=(\d+)/i)?.[1] || ''
}

function parseLineItemId(value: string) {
    return value.match(/line_item_id=(\d+)/i)?.[1] || value.match(/lineItemId=(\d+)/i)?.[1] || ''
}

function parseFirstSize(text: string) {
    const match = text.match(/([1-9]\d{1,3})\s*x\s*([1-9]\d{1,3})(?!\d)/i)
    if (!match) return null
    return { width: Number(match[1]), height: Number(match[2]) }
}

function extractDateRange(text: string) {
    const isoDates = [...text.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)].map(match => match[1])
    if (isoDates.length >= 2) return { flightStart: isoDates[0], flightEnd: isoDates[1] }

    const brDates = [...text.matchAll(/\b(\d{1,2}\/\d{1,2}\/20\d{2})\b/g)].map(match => match[1])
    if (brDates.length >= 2) return { flightStart: brDates[0], flightEnd: brDates[1] }

    const months: Record<string, string> = {
        jan: '01', fev: '02', mar: '03', abr: '04', mai: '05', jun: '06',
        jul: '07', ago: '08', set: '09', out: '10', nov: '11', dez: '12',
    }
    const ptDates = [...text.matchAll(/\b(\d{1,2})\s+de\s+(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\.?\s+de\s+(20\d{2})\b/gi)]
        .map(match => `${match[3]}-${months[match[2].toLowerCase()]}-${match[1].padStart(2, '0')}`)
    if (ptDates.length >= 2) return { flightStart: ptDates[0], flightEnd: ptDates[1] }

    return { flightStart: null, flightEnd: null }
}

async function firstText(page: Page, selectors: string[]) {
    for (const selector of selectors) {
        const value = await page.locator(selector).first().innerText({ timeout: 1500 }).catch(() => '')
        if (value.trim()) return value.trim()
    }
    return ''
}

export class GamCrawlerService {
    private userDataDir = process.env.GAM_USER_DATA_DIR || path.join(process.cwd(), '.gam-session')

    async startIngestion(orderUrl: string): Promise<GamOrderImport> {
        console.log(`[Nexus GAM] Iniciando ingestao para: ${orderUrl}`)

        const browser = await chromium.launchPersistentContext(this.userDataDir, {
            headless: process.env.GAM_HEADLESS !== 'false',
            viewport: { width: 1366, height: 768 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            timezoneId: 'America/Sao_Paulo',
            args: [
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--disable-setuid-sandbox',
            ],
        })

        const page = await browser.newPage()

        try {
            await this.ensureLogin(page, parseNetworkCode(orderUrl))
            await page.goto(orderUrl, { waitUntil: 'domcontentloaded', timeout: 90000 })
            await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => null)
            await page.waitForTimeout(5000)

            if (this.isGoogleLogin(page.url()) || page.url().includes('/home')) {
                throw new Error('GAM_LOGIN_NAO_CONCLUIDO: a Order nao abriu em uma sessao autenticada.')
            }

            const orderText = await page.locator('body').innerText({ timeout: 10000 }).catch(() => '')
            const orderName = await firstText(page, [
                '[data-testid="order-name"]',
                'h1',
                '[role="heading"]',
            ])

            const clientName =
                await firstText(page, [
                    'span[data-testid="order-advertiser-name"]',
                    '[data-testid*="advertiser"]',
                ]) || this.extractAdvertiserFromText(orderText)

            const agencyName =
                await firstText(page, [
                    'span[data-testid="order-agency-name"]',
                    '[data-testid*="agency"]',
                ]) || this.extractAgencyFromText(orderName || orderText)

            const discoveredItems = await this.discoverLineItems(page, parseNetworkCode(orderUrl))

            if (discoveredItems.length === 0) {
                throw new Error(`GAM_SEM_LINE_ITEMS: nenhum item de linha foi encontrado na Order ${parseOrderId(orderUrl)}.`)
            }

            const lineItemClient = discoveredItems[0]?.name.split('_')[0]?.trim()

            for (const item of discoveredItems) {
                await this.processLineItem(page, parseNetworkCode(orderUrl), item)
            }

            const range = extractDateRange(orderText)

            return {
                orderId: parseOrderId(orderUrl),
                orderName,
                orderUrl,
                clientName: clientName || lineItemClient || 'Cliente Desconhecido',
                agencyName,
                flightStart: range.flightStart,
                flightEnd: range.flightEnd,
                lineItems: discoveredItems,
            }
        } finally {
            await browser.close()
        }
    }

    private isGoogleLogin(url: string) {
        return url.includes('accounts.google.com') || url.includes('/signin/')
    }

    private async ensureLogin(page: Page, networkCode: string) {
        const loginTarget = `https://admanager.google.com/${networkCode}`
        await page.goto(loginTarget, { waitUntil: 'domcontentloaded', timeout: 90000 })
        await page.waitForTimeout(2500)

        if (!this.isGoogleLogin(page.url())) {
            console.log('[Nexus GAM] Sessao persistente ativa.')
            return
        }

        const user = process.env.GAM_USER
        const pass = process.env.GAM_PASS

        if (!user || !pass) {
            throw new Error('Sessao GAM nao autenticada. Abra uma sessao local ou informe GAM_USER/GAM_PASS apenas no ambiente de execucao.')
        }

        console.log('[Nexus GAM] Sessao nao encontrada. Realizando login supervisionado...')

        const emailInput = page.locator('#identifierId, input[name="identifier"], input[type="email"]').first()
        await emailInput.fill(user, { timeout: 15000 })
        await page.locator('#identifierNext, button:has-text("Next"), button:has-text("Pr\u00f3xima")').first().click({ timeout: 10000 })

        const passwordInput = page.locator('input[name="Passwd"], input[type="password"]:visible').first()
        await passwordInput.waitFor({ state: 'visible', timeout: 20000 })
        await passwordInput.fill(pass)
        await page.locator('#passwordNext, button:has-text("Next"), button:has-text("Pr\u00f3xima")').first().click({ timeout: 10000 })

        await page.waitForURL(url => url.hostname === 'admanager.google.com', { timeout: 45000 }).catch(() => null)
        await page.waitForTimeout(3000)

        if (this.isGoogleLogin(page.url())) {
            const loginText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '')
            if (/wrong password|senha incorreta|password was changed/i.test(loginText)) {
                throw new Error('GAM_CREDENCIAL_RECUSADA: atualize a credencial do worker.')
            }
            throw new Error('DESAFIO_LOGIN_DETECTADO: o Google solicitou uma verificacao adicional.')
        }
    }

    private extractAdvertiserFromText(text: string) {
        return text.match(/Anunciante\s+([^\n]+)/i)?.[1]?.trim()
            || text.match(/Advertiser\s+([^\n]+)/i)?.[1]?.trim()
            || ''
    }

    private extractAgencyFromText(text: string) {
        if (/estadual/i.test(text)) return 'ESTADUAL'
        if (/federal/i.test(text)) return 'FEDERAL'
        return text.match(/Ag[eê]ncia\s+([^\n]+)/i)?.[1]?.trim()
            || text.match(/Agency\s+([^\n]+)/i)?.[1]?.trim()
            || ''
    }

    private async discoverLineItems(page: Page, networkCode: string): Promise<GamLineItemImport[]> {
        const links = await page.locator('a[href*="line_item_id="], a[href*="lineItemId="]').evaluateAll(nodes => {
            return nodes.map(node => ({
                href: (node as HTMLAnchorElement).href || node.getAttribute('href') || '',
                text: (node.textContent || '').trim(),
            }))
        }).catch(() => [])

        const items = unique(links.map(link => {
            const id = parseLineItemId(link.href)
            return {
                id,
                name: link.text || `Line item ${id}`,
                sourceUrl: link.href,
                creatives: [],
            } satisfies GamLineItemImport
        }).filter(item => item.id), item => item.id)

        console.log(`[Nexus GAM] Encontrados ${items.length} itens de linha.`)

        if (items.length > 0) return items

        const currentId = parseLineItemId(page.url())
        if (currentId) {
            return [{
                id: currentId,
                name: `Line item ${currentId}`,
                creatives: [],
            }]
        }

        const fallbackUrl = `https://admanager.google.com/${networkCode}#delivery/order/order_overview/order_id=${parseOrderId(page.url())}`
        console.log(`[Nexus GAM] Nenhum item por link. Fallback: ${fallbackUrl}`)
        return []
    }

    private async processLineItem(page: Page, networkCode: string, item: GamLineItemImport) {
        const url = item.sourceUrl || `https://admanager.google.com/${networkCode}#delivery/line%20item/line_item_overview/line_item_id=${item.id}`
        console.log(`[Nexus GAM] Processando Line Item: ${item.name} (${item.id})`)

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 })
        await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => null)
        await page.waitForTimeout(4000)

        const lineItemText = await page.locator('body').innerText({ timeout: 10000 }).catch(() => '')
        const range = extractDateRange(lineItemText)
        item.flightStart = range.flightStart
        item.flightEnd = range.flightEnd

        const creativesUrl = url.includes('li_tab=')
            ? url.replace(/li_tab=[^&]+/i, 'li_tab=creatives')
            : `${url}${url.includes('#') ? '&' : '#'}li_tab=creatives`

        await page.goto(creativesUrl, { waitUntil: 'domcontentloaded', timeout: 90000 })
        await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => null)
        await page.waitForTimeout(3500)

        const creativeLinks = await page.locator('a[href*="creative_id="], a[href*="creativeId="]').evaluateAll(nodes => {
            return nodes.map(node => ({
                href: (node as HTMLAnchorElement).href || node.getAttribute('href') || '',
                text: (node.textContent || '').trim(),
                context: (node.closest('tr')?.textContent || node.parentElement?.textContent || '').trim(),
            }))
        }).catch(() => [])

        const creatives = unique(creativeLinks.map(link => ({
            creativeId: parseCreativeId(link.href),
            href: link.href,
            name: link.text,
            sizeHint: parseFirstSize(`${link.text} ${link.context}`),
        })).filter(creative => creative.creativeId), creative => creative.creativeId)

        console.log(`[Nexus GAM] Criativos encontrados no line item ${item.id}: ${creatives.length}`)

        for (const creative of creatives) {
            const preview = await this.processCreative(
                page,
                networkCode,
                item.id,
                creative.href,
                creative.creativeId,
                creative.name,
                creative.sizeHint
            )
            if (preview) item.creatives.push(preview)
        }
    }

    private async processCreative(
        page: Page,
        networkCode: string,
        lineItemId: string,
        href: string,
        creativeId: string,
        name?: string,
        sizeHint?: { width: number; height: number } | null
    ): Promise<GamCreativePreview | null> {
        const creativeUrl = href.startsWith('http')
            ? href
            : `https://admanager.google.com/${networkCode}${href.startsWith('#') ? href : `#${href}`}`

        console.log(`[Nexus GAM] Gerando preview do criativo ${creativeId}`)
        await page.goto(creativeUrl, { waitUntil: 'domcontentloaded', timeout: 90000 })
        await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => null)
        await page.waitForTimeout(3500)

        const creativeText = await page.locator('body').innerText({ timeout: 10000 }).catch(() => '')
        const size = parseFirstSize(`${name || ''} ${creativeText}`) || sizeHint

        if (!size) {
            console.log(`[Nexus GAM] Tamanho nao encontrado para criativo ${creativeId}`)
            return null
        }

        const previewPageUrl = creativeUrl.includes('tab=')
            ? creativeUrl.replace(/tab=[^&]+/i, 'tab=preview')
            : `${creativeUrl}&tab=preview`

        await page.goto(previewPageUrl, { waitUntil: 'domcontentloaded', timeout: 90000 })
        await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => null)
        await page.waitForTimeout(3000)

        const onSiteButton = page.locator('material-button').filter({ hasText: /No site|On site/i }).first()
        await onSiteButton.click({ timeout: 10000 })

        const previewBaseUrl = size.width === 320 && (size.height === 50 || size.height === 100)
            ? 'metropoles.com/saude'
            : 'metropoles.com'

        const siteUrlInput = page.getByLabel(/URL do site|Site URL/i).first()
        await siteUrlInput.waitFor({ state: 'visible', timeout: 10000 })
        await siteUrlInput.fill(previewBaseUrl)

        const showUrlButton = page.locator('material-button').filter({
            hasText: /Mostrar URL de visualiza[cç][aã]o|Show preview URL|Generate preview URL/i,
        }).first()
        await showUrlButton.click({ timeout: 10000 })
        await page.waitForTimeout(2500)

        const previewUrl = await page.locator('textarea[readonly], input[readonly], input[value*="google_preview"], textarea:has-text("google_preview")')
            .first()
            .inputValue({ timeout: 3000 })
            .catch(async () => {
                const text = await page.locator('body').innerText({ timeout: 3000 }).catch(() => '')
                return text.match(/https?:\/\/[^\s"']*google_preview[^\s"']*/i)?.[0] || ''
            })

        if (!previewUrl || !previewUrl.includes('google_preview')) {
            console.log(`[Nexus GAM] Preview nao encontrado para criativo ${creativeId}`)
            return null
        }

        const creativeAssetUrl = await this.findCreativeAssetUrl(page, size.width, size.height)
        if (creativeAssetUrl) {
            console.log(`[Nexus GAM] Asset autenticado encontrado para ${creativeId}: ${creativeAssetUrl}`)
        }

        return {
            creativeId,
            name,
            width: size.width,
            height: size.height,
            previewUrl,
            previewBaseUrl,
            creativeAssetUrl,
        }
    }

    private async findCreativeAssetUrl(page: Page, width: number, height: number) {
        const candidates: Array<{ url: string; preferred: boolean }> = []

        for (const frame of page.frames()) {
            const images = await frame.locator('img').evaluateAll((nodes, expected) => {
                return nodes.map(node => {
                    const image = node as HTMLImageElement
                    const rect = image.getBoundingClientRect()
                    return {
                        url: image.currentSrc || image.src || image.getAttribute('src') || '',
                        width: image.naturalWidth || image.width || rect.width,
                        height: image.naturalHeight || image.height || rect.height,
                    }
                }).filter(image =>
                    image.url &&
                    Math.round(image.width) === expected.width &&
                    Math.round(image.height) === expected.height
                )
            }, { width, height }).catch(() => [])

            for (const image of images) {
                try {
                    const url = new URL(image.url)
                    if (url.protocol !== 'https:' && url.protocol !== 'http:') continue
                    candidates.push({
                        url: url.toString(),
                        preferred: url.hostname === 'cdn.00px.net',
                    })
                } catch {
                    // Ignore non-network image sources such as data URLs.
                }
            }
        }

        return candidates.find(candidate => candidate.preferred)?.url || candidates[0]?.url
    }
}

export const gamCrawler = new GamCrawlerService()
