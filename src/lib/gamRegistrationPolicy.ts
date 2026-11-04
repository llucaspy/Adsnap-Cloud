export type OrderCampaignType = 'PRIVADO' | 'GOV_FEDERAL'
export function orderRegistrationPolicy(segmentation: string = 'PRIVADO') {
    const trimmed = segmentation.trim()
    const normalized = trimmed.toUpperCase()
    const value = ['PRIVADO', 'GOV_FEDERAL', 'GOV_ESTADUAL'].includes(normalized) ? normalized : trimmed
    return { segmentation: value || 'PRIVADO', captureCadence: value === 'GOV_FEDERAL' ? 'BOUNDARY' as const : 'DAILY' as const }
}

/** Latest registration intent wins; a URL-only continuation inherits the request that asked for it. */
export function inferOrderCampaignType(messagesLatestFirst: string[]): OrderCampaignType {
    for (const message of messagesLatestFirst) {
        const text = message.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        const registration = /cadastr|registr|import/.test(text)
        const choice = /\bcomo\b|campanha|\btipo\b/.test(text) || /^(gov|governo(?: federal)?|federal|privad[ao])[\s.!]*$/.test(text.trim())
        if (registration || choice) {
            const words = [...text.matchAll(/\b(privad[ao]s?|gov|governo|federal)\b/g)]
                .filter(match => !/nao\s+(?:e\s+|como\s+)?$/.test(text.slice(Math.max(0, match.index! - 15), match.index)))
            if (words.length) return words.at(-1)![0].startsWith('privad') ? 'PRIVADO' : 'GOV_FEDERAL'
            if (registration) return 'PRIVADO'
        }
    }
    return 'PRIVADO'
}
