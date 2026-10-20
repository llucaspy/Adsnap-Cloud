import type { Page } from 'playwright'

type RegisteredSlot = { id: string; path: string }

function configuredSlotId(selector: string) {
    return selector.match(/^\/\/\*\[@id=["']([^"']+)["']\]$/)?.[1]
        || selector.match(/^#([\w-]+)$/)?.[1]
        || selector.match(/^\[id=["']([^"']+)["']\]$/)?.[1]
}

function sectionIdentity(selector: string, pageUrl: string) {
    const configuredId = configuredSlotId(selector)
    const identity = configuredId?.match(/^div-gpt-ad-(.+?)-((?:horizontal|quadrado|destaque)(?:-[a-z]+)*-\d+)$/)
    if (!identity) return null
    let section: string
    try { section = new URL(pageUrl).pathname.split('/').filter(Boolean)[0] || 'home' } catch { return null }
    if (!/^[a-z][a-z-]*$/.test(section) || identity[1] === section) return null
    const unit = `${section}-${identity[2]}`
    const id = `div-gpt-ad-${unit}`
    return { id, unit }
}

/** Resolve a publisher's section-relative GPT placement, never an ad by its dimensions. */
export function sectionSlotCandidate(selector: string, pageUrl: string, slots: RegisteredSlot[]) {
    const candidate = sectionIdentity(selector, pageUrl)
    if (!candidate) return null
    const { id, unit } = candidate
    const matches = slots.filter(slot => slot.id === id && /^\/\d+\//.test(slot.path) && slot.path.split('/').at(-1) === unit)
    return matches.length === 1 ? `[id="${id}"]` : null
}

export async function resolveConfiguredCaptureSlot(page: Page, selector: string, mobile: boolean) {
    const configured = page.locator(selector).first()
    const attached = await configured.count() > 0
    if (attached && await configured.isVisible()) return { selector, reason: 'CONFIGURED_SLOT' }
    const section = !attached ? sectionIdentity(selector, page.url()) : null
    const desktop = !mobile && configuredSlotId(selector) === 'div-gpt-ad-home-quadrado-0'
    const identities = [section?.id, desktop ? 'div-gpt-ad-home-quadrado-1' : null].filter((id): id is string => Boolean(id))
    if (identities.length === 0) return { selector, reason: 'CONFIGURED_SLOT' }
    // GPT is initialized asynchronously after DOMContentLoaded. Do not resolve from
    // an empty initial registry or confuse the navigation timeout with ad readiness.
    await page.waitForFunction(ids => {
        const tag = (window as unknown as { googletag?: { pubads?: () => { getSlots(): { getSlotElementId(): string }[] } } }).googletag
        try {
            return tag?.pubads?.().getSlots().some(slot => {
                const id = slot.getSlotElementId()
                const element = document.getElementById(id)
                return ids.includes(id) && element && element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0
            }) || false
        } catch { return false }
    }, identities, { timeout: 5_000, polling: 100 }).catch(error => { if (!String(error).includes('Timeout')) throw error })
    const slots = await page.evaluate(() => {
        const tag = (window as unknown as { googletag?: { pubads?: () => { getSlots(): { getSlotElementId(): string; getAdUnitPath(): string }[] } } }).googletag
        try { return tag?.pubads?.().getSlots().map(slot => ({ id: slot.getSlotElementId(), path: slot.getAdUnitPath() })) || [] }
        catch { return [] }
    })
    if (await configured.count() === 0) {
        const candidate = sectionSlotCandidate(selector, page.url(), slots)
        if (candidate && await page.locator(candidate).count() === 1) return { selector: candidate, reason: 'PAGE_SECTION_GPT_SLOT' }
    }
    // This publisher uses square-0 for mobile and square-1 for the desktop placement.
    // Restore the responsive placement fallback using device/registered identity only.
    if (desktop && !await configured.isVisible()) {
        const alternative = selector.replace('div-gpt-ad-home-quadrado-0', 'div-gpt-ad-home-quadrado-1')
        const registered = slots.filter(slot => slot.id === 'div-gpt-ad-home-quadrado-1' && /^\/\d+\/home-quadrado-1$/.test(slot.path))
        if (registered.length === 1 && await page.locator(alternative).first().isVisible()) {
            return { selector: alternative, reason: 'REGISTERED_DESKTOP_PLACEMENT' }
        }
    }
    return { selector, reason: 'CONFIGURED_SLOT' }
}
