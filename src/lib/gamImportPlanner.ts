import type { CaptureCadence } from './governmentReportScope'

export interface BannerFormatConfig {
    id: string
    label: string
    width: number
    height: number
    selector?: string
}

export interface GamCreativePreview {
    creativeId: string
    name?: string
    width: number
    height: number
    previewUrl: string
    previewBaseUrl?: string
    creativeAssetUrl?: string
}

export interface GamLineItemImport {
    id: string
    name: string
    sourceUrl?: string
    flightStart?: string | Date | null
    flightEnd?: string | Date | null
    creatives: GamCreativePreview[]
}

export interface GamOrderImport {
    orderId: string
    orderName?: string
    orderUrl?: string
    clientName: string
    agencyName?: string
    flightStart?: string | Date | null
    flightEnd?: string | Date | null
    lineItems: GamLineItemImport[]
}

export interface GamImportMediaEntry {
    sourceLineItemId: string
    sourceLineItemName: string
    creativeId: string
    sourceSize: string
    url: string
    device: 'desktop' | 'mobile'
    format: string
    formatLabel: string
    width: number
    height: number
    externalCampaignId: string
    creativeAssetUrl?: string
    confidence: 'high' | 'review' | 'blocked'
    warnings: string[]
}

export interface GamImportDraft {
    orderId: string
    orderUrl?: string
    agency: string
    client: string
    campaignName: string
    pi: string
    segmentation: string
    captureCadence: CaptureCadence
    flightStart: string | null
    flightEnd: string | null
    isScheduled: boolean
    scheduledTimes: string
    mediaEntries: GamImportMediaEntry[]
    blockedItems: Array<{
        lineItemId: string
        creativeId: string
        sourceSize: string
        reason: string
    }>
    warnings: string[]
}

interface ImportRule {
    width: number
    height: number
    device: 'desktop' | 'mobile'
    preferredLabels: string[]
    previewBasePath: 'home' | 'saude'
    duplicateAsMobile?: boolean
}

const DEFAULT_SCHEDULED_TIMES = JSON.stringify(['08:00', '18:00'])

const FORMAT_RULES: ImportRule[] = [
    {
        width: 970,
        height: 250,
        device: 'desktop',
        preferredLabels: ['billboard'],
        previewBasePath: 'home',
    },
    {
        width: 970,
        height: 90,
        device: 'desktop',
        preferredLabels: ['superleaderboard'],
        previewBasePath: 'home',
    },
    {
        width: 728,
        height: 90,
        device: 'desktop',
        preferredLabels: ['superbanner'],
        previewBasePath: 'home',
    },
    {
        width: 300,
        height: 600,
        device: 'desktop',
        preferredLabels: ['halfpage'],
        previewBasePath: 'home',
    },
    {
        width: 300,
        height: 250,
        device: 'desktop',
        preferredLabels: ['retangulo'],
        previewBasePath: 'home',
        duplicateAsMobile: true,
    },
    {
        width: 320,
        height: 50,
        device: 'mobile',
        preferredLabels: ['banner horizontal mobile'],
        previewBasePath: 'saude',
    },
    {
        width: 320,
        height: 100,
        device: 'mobile',
        preferredLabels: ['banner horizontal grande mobile'],
        previewBasePath: 'saude',
    },
]

function normalizeText(value: string) {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
}

function compactSpaces(value: string) {
    return value.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function extractPi(value: string | undefined | null) {
    if (!value) return null
    return value.match(/(?:^|[^a-z0-9])PI\s*([0-9]{3,8})\b/i)?.[1] || null
}

function pickPi(order: GamOrderImport) {
    const candidates = [
        ...order.lineItems.map(item => extractPi(item.name)),
        extractPi(order.orderName),
    ].filter(Boolean) as string[]

    return candidates[0] || order.orderId.slice(-6)
}

function inferAgency(order: GamOrderImport) {
    const source = normalizeText(`${order.orderName || ''} ${order.agencyName || ''} ${order.lineItems.map(item => item.name).join(' ')}`)

    if (source.includes('estadual')) return 'ESTADUAL'
    if (source.includes('federal') || /\bministerio (?:da|das|de|do|dos)\b/.test(source)) return 'FEDERAL'
    if (source.includes('interno')) return 'INTERNO'
    return order.agencyName && !/desconhecid/i.test(order.agencyName) ? order.agencyName : 'PRIVADO'
}

function inferSegmentation(agency: string) {
    const normalized = normalizeText(agency)
    if (normalized.includes('estadual')) return 'GOV_ESTADUAL'
    if (normalized.includes('federal')) return 'GOV_FEDERAL'
    if (normalized.includes('interno')) return 'INTERNO'
    return 'PRIVADO'
}

function advertiserTokens(clientName: string) {
    return normalizeText(clientName)
        .split(/[^a-z0-9]+/)
        .filter(Boolean)
        .filter(token => token.length >= 2 && !['da', 'de', 'do'].includes(token))
}

function cleanCampaignName(order: GamOrderImport) {
    const source = order.lineItems[0]?.name || order.orderName || order.clientName
    const clientTokens = advertiserTokens(order.clientName)

    let cleaned = compactSpaces(source)
        .replace(/\bPI\s*[0-9]{3,8}\b/ig, '')
        .replace(/\b(?:ESTADUAL|FEDERAL|INTERNO|PRIVADO)\b/ig, '')
        .replace(/\s{2,}/g, ' ')
        .trim()

    if (clientTokens.length > 0) {
        const parts = cleaned.split(/\s+/)
        while (parts.length > 0) {
            const first = normalizeText(parts[0] || '')
            if (!clientTokens.some(token => first.includes(token) || token.includes(first))) break
            parts.shift()
        }
        cleaned = parts.join(' ').trim()
    }

    return cleaned || order.orderName || order.clientName
}

function normalizeDate(value?: string | Date | null) {
    if (!value) return null
    if (value instanceof Date) return value.toISOString().slice(0, 10)

    const trimmed = value.trim()
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10)

    const br = trimmed.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
    if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`

    const parsed = new Date(trimmed)
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10)

    return null
}

function chooseFormat(formats: BannerFormatConfig[], rule: ImportRule) {
    const sameSize = formats.filter(format => Number(format.width) === rule.width && Number(format.height) === rule.height)
    if (sameSize.length === 0) return null

    for (const preferred of rule.preferredLabels) {
        const match = sameSize.find(format => normalizeText(format.label).includes(preferred))
        if (match) return match
    }

    return sameSize[0]
}

function desiredPreviewBase(rule: ImportRule) {
    return rule.previewBasePath === 'saude' ? 'metropoles.com/saude' : 'metropoles.com'
}

export function forcePreviewBase(previewUrl: string, base: 'home' | 'saude') {
    const desired = base === 'saude' ? 'http://metropoles.com/saude' : 'http://metropoles.com'
    const url = previewUrl.trim()
    const queryIndex = url.indexOf('?')
    const hashIndex = url.indexOf('#')
    const splitIndex = queryIndex >= 0 ? queryIndex : hashIndex

    if (splitIndex < 0) return desired
    return `${desired}${url.slice(splitIndex)}`
}

function makeMediaEntry(params: {
    order: GamOrderImport
    lineItem: GamLineItemImport
    creative: GamCreativePreview
    rule: ImportRule
    format: BannerFormatConfig
    device: 'desktop' | 'mobile'
}) {
    const { order, lineItem, creative, rule, format, device } = params
    const warnings: string[] = []
    const expectedBase = desiredPreviewBase(rule)
    const previewUrl = forcePreviewBase(creative.previewUrl, rule.previewBasePath)

    if (!previewUrl.includes(expectedBase)) {
        warnings.push(`Preview ajustado para ${expectedBase}`)
    }

    return {
        sourceLineItemId: lineItem.id,
        sourceLineItemName: lineItem.name,
        creativeId: creative.creativeId,
        sourceSize: `${creative.width}x${creative.height}`,
        url: previewUrl,
        device,
        format: format.id,
        formatLabel: format.label,
        width: Number(format.width),
        height: Number(format.height),
        externalCampaignId: `GAM_ORDER_${order.orderId}_LINE_ITEM_${lineItem.id}`,
        creativeAssetUrl: creative.creativeAssetUrl,
        confidence: warnings.length > 0 ? 'review' : 'high',
        warnings,
    } satisfies GamImportMediaEntry
}

export function buildGamImportDraft(order: GamOrderImport, bannerFormats: BannerFormatConfig[]): GamImportDraft {
    const warnings: string[] = []
    const blockedItems: GamImportDraft['blockedItems'] = []
    const mediaEntries: GamImportMediaEntry[] = []

    const agency = inferAgency(order)
    const segmentation = inferSegmentation(agency)
    const pi = pickPi(order)

    const lineItemDates = order.lineItems.find(item => item.flightStart || item.flightEnd)
    const flightStart = normalizeDate(lineItemDates?.flightStart || order.flightStart)
    const flightEnd = normalizeDate(lineItemDates?.flightEnd || order.flightEnd)

    if (!flightStart || !flightEnd) {
        warnings.push('Periodo de veiculacao nao foi encontrado automaticamente.')
    }

    for (const lineItem of order.lineItems) {
        for (const creative of lineItem.creatives) {
            const rule = FORMAT_RULES.find(candidate => candidate.width === creative.width && candidate.height === creative.height)

            if (!rule) {
                blockedItems.push({
                    lineItemId: lineItem.id,
                    creativeId: creative.creativeId,
                    sourceSize: `${creative.width}x${creative.height}`,
                    reason: 'Formato sem regra Adsnap conhecida',
                })
                continue
            }

            const format = chooseFormat(bannerFormats, rule)
            if (!format) {
                blockedItems.push({
                    lineItemId: lineItem.id,
                    creativeId: creative.creativeId,
                    sourceSize: `${creative.width}x${creative.height}`,
                    reason: 'Formato nao existe em Settings.bannerFormats',
                })
                continue
            }

            const desktopOrMobile = makeMediaEntry({ order, lineItem, creative, rule, format, device: rule.device })
            mediaEntries.push(desktopOrMobile)

            if (rule.duplicateAsMobile) {
                mediaEntries.push({
                    ...desktopOrMobile,
                    device: 'mobile',
                    confidence: 'review',
                    warnings: [...desktopOrMobile.warnings, '300x250 duplicado como mobile por regra operacional'],
                })
            }
        }
    }

    const dedupedEntries = mediaEntries.filter((entry, index, all) => {
        return all.findIndex(candidate =>
            candidate.sourceLineItemId === entry.sourceLineItemId &&
            candidate.creativeId === entry.creativeId &&
            candidate.device === entry.device &&
            candidate.format === entry.format
        ) === index
    })

    return {
        orderId: order.orderId,
        orderUrl: order.orderUrl,
        agency,
        client: order.clientName,
        campaignName: cleanCampaignName(order),
        pi,
        segmentation,
        captureCadence: segmentation === 'GOV_FEDERAL' ? 'BOUNDARY' : 'DAILY',
        flightStart,
        flightEnd,
        isScheduled: true,
        scheduledTimes: DEFAULT_SCHEDULED_TIMES,
        mediaEntries: dedupedEntries,
        blockedItems,
        warnings,
    }
}
