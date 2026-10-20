import type { Frame, Locator } from 'playwright'

export type CreativeEvidence = {
    state: 'CONFIRMED' | 'EMPTY' | 'INCONCLUSIVE'
    kind?: 'IMAGE' | 'BACKGROUND' | 'CANVAS' | 'VIDEO' | 'TEXT' | 'FRAME'
    reason: string
}

type VisibleBox = { x: number; y: number; width: number; height: number }

/** Visibility within the selected slot, independent of any registered format or expected size. */
function frameIsVisibleInSlot(box: VisibleBox, slot: VisibleBox) {
    const area = box.width * box.height
    if (area < Math.max(64, slot.width * slot.height * .02)) return false
    const width = Math.max(0, Math.min(box.x + box.width, slot.x + slot.width) - Math.max(box.x, slot.x))
    const height = Math.max(0, Math.min(box.y + box.height, slot.y + slot.height) - Math.max(box.y, slot.y))
    return width * height >= area * .9
}

/** Runs in the browser. Presence/decoded content is evidence; PNG size and OCR are not. */
export function inspectCreativeDom(element: Element): CreativeEvidence {
    // A plain browser function avoids tsx/esbuild name helpers in serialized callbacks.
    const visible = new Function('node', 'slot', String.raw`
        const box = node.getBoundingClientRect()
        const style = window.getComputedStyle(node)
        if (/opacity\(\s*0(?:\.0+)?%?\s*\)/.test(style.filter) || style.clipPath !== 'none' || style.maskImage !== 'none') return false
        let left = Math.max(0, box.left), top = Math.max(0, box.top)
        let right = Math.min(innerWidth, box.right), bottom = Math.min(innerHeight, box.bottom)
        if (slot.tagName !== 'BODY') {
            const slotBox = slot.getBoundingClientRect()
            left = Math.max(left, slotBox.left); top = Math.max(top, slotBox.top)
            right = Math.min(right, slotBox.right); bottom = Math.min(bottom, slotBox.bottom)
        }
        for (let parent = node.parentElement; parent; parent = parent.parentElement) {
            const parentStyle = window.getComputedStyle(parent)
            if (parentStyle.display === 'none' || parentStyle.visibility === 'hidden' || Number(parentStyle.opacity) === 0) return false
            if (/opacity\(\s*0(?:\.0+)?%?\s*\)/.test(parentStyle.filter) || parentStyle.clipPath !== 'none' || parentStyle.maskImage !== 'none') return false
            const parentBox = parent.getBoundingClientRect()
            if (/hidden|clip|auto|scroll/.test(parentStyle.overflowX)) { left = Math.max(left, parentBox.left); right = Math.min(right, parentBox.right) }
            if (/hidden|clip|auto|scroll/.test(parentStyle.overflowY)) { top = Math.max(top, parentBox.top); bottom = Math.min(bottom, parentBox.bottom) }
        }
        return box.width > 1 && box.height > 1 && style.display !== 'none'
            && style.visibility !== 'hidden' && Number(style.opacity) !== 0
            && !node.closest('[hidden], [aria-hidden="true"]')
            && right - left > 1 && bottom - top > 1
            && (right - left) * (bottom - top) >= box.width * box.height * 0.9
    `) as (node: Element, slot: Element) => boolean
    if (!visible(element, element) && element.tagName !== 'BODY') return { state: 'EMPTY', reason: 'SLOT_NOT_VISIBLE' }
    const nodes = [element, ...Array.from(element.querySelectorAll('img, canvas, video, iframe, *'))]
    const slotArea = element.getBoundingClientRect().width * element.getBoundingClientRect().height
    let uncertain = false
    let unreadableImage = false
    let backgroundImage = false
    for (const node of nodes) {
        if (!visible(node, element)) continue
        const rect = node.getBoundingClientRect()
        const substantialMedia = rect.width * rect.height >= Math.max(64, slotArea * 0.02)
        if (node instanceof HTMLImageElement) {
            // A decoded white or text-free creative is valid. Do not infer emptiness from pixels/OCR.
            if (substantialMedia && node.complete && node.naturalWidth > 1 && node.naturalHeight > 1) {
                try {
                    const probe = document.createElement('canvas')
                    probe.width = 64; probe.height = 64
                    const context = probe.getContext('2d')!
                    context.drawImage(node, 0, 0, 64, 64)
                    const pixels = context.getImageData(0, 0, 64, 64).data
                    for (let index = 3; index < pixels.length; index += 4) {
                        if (pixels[index] > 0) return { state: 'CONFIRMED', kind: 'IMAGE', reason: 'IMAGE_DECODED' }
                    }
                } catch { unreadableImage = true }
            }
            uncertain = true
        } else if (node instanceof HTMLCanvasElement && substantialMedia && node.width > 1 && node.height > 1) {
            try {
                const context = node.getContext('2d')
                if (!context) { uncertain = true; continue }
                // Sample a small grid, preserving white/solid-color painted canvases.
                let painted = false
                for (let y = 0; y < 5 && !painted; y++) {
                    for (let x = 0; x < 5; x++) {
                        const pixel = context.getImageData(Math.floor((node.width - 1) * x / 4), Math.floor((node.height - 1) * y / 4), 1, 1).data
                        if (pixel[3] > 0) { painted = true; break }
                    }
                }
                if (painted) return { state: 'CONFIRMED', kind: 'CANVAS', reason: 'CANVAS_PAINTED' }
                // Transparent canvas might be awaiting a later animation frame; never declare SUCCESS.
                uncertain = true
            } catch { uncertain = true }
        } else if (node instanceof HTMLVideoElement) {
            if (substantialMedia && node.readyState >= 2 && node.videoWidth > 1 && node.videoHeight > 1) {
                return { state: 'CONFIRMED', kind: 'VIDEO', reason: 'VIDEO_FRAME_READY' }
            }
            uncertain = true
        } else if (node instanceof HTMLIFrameElement) {
            uncertain = true // Inspected separately with Playwright, including cross-origin frames.
        }
        const background = window.getComputedStyle(node).backgroundImage
        if (background !== 'none') {
            uncertain = true
            if (substantialMedia && /^url\(/.test(background)) backgroundImage = true
        }
    }
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
        const text = walker.currentNode.textContent?.trim() || ''
        const parent = walker.currentNode.parentElement
        if (!parent || parent.closest('script, style, noscript, template') || !visible(parent, element)) continue
        if (text && !/^(publicidade|advertisement|advertising|an[uú]ncio|ad|loading\.*|carregando\.*)$/i.test(text)) {
            const range = document.createRange()
            range.selectNodeContents(walker.currentNode)
            const box = range.getBoundingClientRect()
            const slotBox = element.tagName === 'BODY' ? { left: 0, top: 0, right: innerWidth, bottom: innerHeight } : element.getBoundingClientRect()
            if (box.width > 1 && box.height > 1 && Math.min(box.right, slotBox.right, innerWidth) - Math.max(box.left, slotBox.left, 0) > 1
                && Math.min(box.bottom, slotBox.bottom, innerHeight) - Math.max(box.top, slotBox.top, 0) > 1) return { state: 'CONFIRMED', kind: 'TEXT', reason: 'VISIBLE_TEXT_CREATIVE' }
        }
    }
    return uncertain
        ? { state: 'INCONCLUSIVE', reason: unreadableImage ? 'IMAGE_UNREADABLE_PIXELS' : backgroundImage ? 'BACKGROUND_IMAGE_AWAITING_VALIDATION' : 'CREATIVE_NOT_CONFIRMED' }
        : { state: 'EMPTY', reason: 'SLOT_HAS_NO_CREATIVE' }
}

// Image screenshots are read back as same-origin data URLs, bypassing canvas taint
// without fetching the asset again. A transparent image produces only the two backgrounds.
const compareRenderedProbes = new Function('sources', `
    return Promise.all(sources.map(source => new Promise((resolve, reject) => {
        const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = source;
    }))).then(images => {
        const samples = images.map(image => {
            const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 32;
            const context = canvas.getContext('2d');
            context.drawImage(image, image.naturalWidth * .1, image.naturalHeight * .1, image.naturalWidth * .8, image.naturalHeight * .8, 0, 0, 32, 32);
            return context.getImageData(0, 0, 32, 32).data;
        });
        let painted = 0;
        for (let offset = 0; offset < samples[0].length; offset += 4) {
            const black = samples[0], white = samples[1];
            const blackPaint = black[offset] > 4 || black[offset + 1] > 4 || black[offset + 2] > 4;
            const whitePaint = white[offset] < 251 || white[offset + 1] < 251 || white[offset + 2] < 251;
            if (blackPaint || whitePaint) painted++;
        }
        return painted >= 21; // At least 2% of the sampled content, rather than a tracking pixel.
    });
`) as (sources: string[]) => Promise<boolean>

async function verifyTaintedImages(locator: Locator, slotBox: { width: number; height: number } | null): Promise<boolean> {
    const handles = await locator.locator('img').elementHandles()
    if (await locator.evaluate(element => element.tagName === 'IMG')) {
        const root = await locator.elementHandle()
        if (root) handles.unshift(root)
    }
    for (const handle of handles.slice(0, 8)) {
        if ((await handle.evaluate(inspectCreativeDom)).reason !== 'IMAGE_UNREADABLE_PIXELS') continue
        const box = await handle.boundingBox()
        if (!box || !slotBox || box.width * box.height < slotBox.width * slotBox.height * .02) continue
        const probeKey = `__adsnap_probe_${Date.now()}_${Math.random()}`
        try {
            await handle.evaluate((element, key) => {
                const records: { node: HTMLElement; style: string | null }[] = []
                for (let current: HTMLElement | null = element as HTMLElement; current; current = current.parentElement) {
                    records.push({ node: current, style: current.getAttribute('style') })
                    current.style.setProperty('opacity', '1', 'important')
                    current.style.setProperty('filter', 'none', 'important')
                    current.style.setProperty('mix-blend-mode', 'normal', 'important')
                }
                ;(element as unknown as Record<string, unknown>)[key] = records
                const image = element as HTMLElement
                image.style.setProperty('background-image', 'none', 'important')
                image.style.setProperty('background-color', 'rgb(0, 0, 0)', 'important')
                image.style.setProperty('border-color', 'rgb(0, 0, 0)', 'important')
                image.style.setProperty('box-shadow', 'none', 'important')
                image.style.setProperty('outline', 'none', 'important')
            }, probeKey)
            const black = await handle.screenshot({ type: 'png', omitBackground: true, timeout: 1_500 })
            await handle.evaluate(element => {
                const image = element as HTMLElement
                image.style.setProperty('background-color', 'rgb(255, 255, 255)', 'important')
                image.style.setProperty('border-color', 'rgb(255, 255, 255)', 'important')
            })
            const white = await handle.screenshot({ type: 'png', omitBackground: true, timeout: 1_500 })
            // The portal's CSP may correctly forbid data: images. Decode our screenshot
            // buffers in a neutral, disposable about:blank page without weakening that CSP.
            const browser = locator.page().context().browser()
            if (!browser) throw new Error('CREATIVE_PROBE_BROWSER_UNAVAILABLE')
            const probeContext = await browser.newContext({ serviceWorkers: 'block' })
            let confirmed = false
            try {
                const probePage = await probeContext.newPage()
                confirmed = await probePage.evaluate(compareRenderedProbes, [
                    `data:image/png;base64,${black.toString('base64')}`, `data:image/png;base64,${white.toString('base64')}`,
                ])
            } finally { await probeContext.close() }
            if (confirmed) return true
        } finally {
            await handle.evaluate((element, key) => {
                const data = element as unknown as Record<string, unknown>
                const records = data[key] as { node: HTMLElement; style: string | null }[] | undefined
                for (const record of records || []) {
                    if (record.style == null) record.node.removeAttribute('style')
                    else record.node.setAttribute('style', record.style)
                }
                delete data[key]
            }, probeKey)
        }
    }
    return false
}

/** HTML5 creatives often paint every layer with CSS background images, with no IMG tags.
 * Validate a visible layer's decoded pixels using a temporary image in the same document.
 * This keeps its CSP/cookies/network policy and always removes the probe before capture. */
async function verifyBackgroundImages(locator: Locator): Promise<boolean> {
    const candidates = await locator.evaluate(element => [element, ...Array.from(element.querySelectorAll('*'))]
        .flatMap((node, index) => {
            const value = getComputedStyle(node).backgroundImage
            const match = value.match(/^url\((?:"([^"]+)"|'([^']+)'|([^)]*))\)$/)
            return match ? [{ index, source: match[1] || match[2] || match[3] }] : []
        }).slice(0, 24))
    let probed = 0
    for (const candidate of candidates) {
        const target = candidate.index === 0 ? locator : locator.locator('*').nth(candidate.index - 1)
        if ((await target.evaluate(inspectCreativeDom)).reason !== 'BACKGROUND_IMAGE_AWAITING_VALIDATION') continue
        if (++probed > 4) break
        const key = `css-${Date.now()}-${Math.random().toString(16).slice(2)}`
        const probe = await target.evaluateHandle(async (element, input) => {
            const image = element.ownerDocument.createElement('img')
            image.dataset.adsnapCssProbe = input.key
            image.style.cssText = `position:fixed!important;left:0!important;top:0!important;width:${Math.min(64, innerWidth)}px!important;height:${Math.min(64, innerHeight)}px!important;max-width:none!important;max-height:none!important;display:block!important;visibility:visible!important;opacity:1!important;filter:none!important;transform:none!important;border:0!important;z-index:2147483647!important;pointer-events:none!important;`
            element.ownerDocument.body.appendChild(image)
            image.src = input.source
            await Promise.race([image.decode().catch(() => {}), new Promise(resolve => setTimeout(resolve, 1_200))])
            return image
        }, { key, source: candidate.source })
        try {
            const direct = await probe.evaluate(inspectCreativeDom)
            if (direct.state === 'CONFIRMED') return true
            if (direct.reason === 'IMAGE_UNREADABLE_PIXELS') {
                const probeLocator = locator.locator(`xpath=ancestor-or-self::body[1]//img[@data-adsnap-css-probe="${key}"]`)
                if (await verifyTaintedImages(probeLocator, await probeLocator.boundingBox())) return true
            }
        } finally {
            await probe.evaluate(element => element.remove()).catch(() => {})
            await probe.dispose()
        }
    }
    return false
}

export async function inspectCreativeContent(locator: Locator): Promise<CreativeEvidence> {
    const direct = await locator.evaluate(inspectCreativeDom)
    if (direct.state === 'CONFIRMED') return direct
    if (direct.reason === 'BACKGROUND_IMAGE_AWAITING_VALIDATION' && await verifyBackgroundImages(locator)) {
        return { state: 'CONFIRMED', kind: 'BACKGROUND', reason: 'BACKGROUND_IMAGE_PIXELS_CONFIRMED' }
    }
    if (direct.reason === 'SLOT_NOT_VISIBLE') return direct
    const slotBox = await locator.boundingBox()
    if (direct.reason === 'IMAGE_UNREADABLE_PIXELS' && await verifyTaintedImages(locator, slotBox)) {
        return { state: 'CONFIRMED', kind: 'IMAGE', reason: 'IMAGE_RENDERED_OPACITY_CONFIRMED' }
    }
    const handles = await locator.locator('iframe').elementHandles()
    if (await locator.evaluate(element => element.tagName === 'IFRAME')) {
        const root = await locator.elementHandle()
        if (root) handles.unshift(root)
    }
    let uncertain = direct.state === 'INCONCLUSIVE'
    let inspectedFrames = 0
    const inspectFrame = async (frame: Frame, depth: number): Promise<CreativeEvidence> => {
        if (frame.isDetached() || depth > 3 || ++inspectedFrames > 12) return { state: 'INCONCLUSIVE', reason: 'FRAME_LIMIT' }
        const result = await frame.locator('body').evaluate(inspectCreativeDom, undefined, { timeout: 1_000 })
        if (result.state === 'CONFIRMED') return { ...result, kind: 'FRAME', reason: `FRAME_${result.reason}` }
        if (result.reason === 'BACKGROUND_IMAGE_AWAITING_VALIDATION' && await verifyBackgroundImages(frame.locator('body'))) {
            return { state: 'CONFIRMED', kind: 'FRAME', reason: 'FRAME_BACKGROUND_IMAGE_PIXELS_CONFIRMED' }
        }
        if (result.reason === 'IMAGE_UNREADABLE_PIXELS' && await verifyTaintedImages(frame.locator('body'), slotBox)) {
            return { state: 'CONFIRMED', kind: 'FRAME', reason: 'FRAME_IMAGE_RENDERED_OPACITY_CONFIRMED' }
        }
        for (const child of frame.childFrames()) {
            const frameElement = await child.frameElement()
            try {
                if ((await frameElement.evaluate(inspectCreativeDom)).reason === 'SLOT_NOT_VISIBLE') continue
                const box = await frameElement.boundingBox()
                if (!slotBox || !box || !frameIsVisibleInSlot(box, slotBox)) continue
                const nested = await inspectFrame(child, depth + 1)
                if (nested.state === 'CONFIRMED') return nested
            } finally { await frameElement.dispose() }
        }
        return result
    }
    for (const handle of handles.slice(0, 12)) {
        try {
            if ((await handle.evaluate(inspectCreativeDom)).reason === 'SLOT_NOT_VISIBLE') continue
            const box = await handle.boundingBox()
            if (!box || box.width < 20 || box.height < 20) continue
            if (!slotBox || !frameIsVisibleInSlot(box, slotBox)) continue
            const frame = await handle.contentFrame()
            if (!frame || frame.isDetached()) { uncertain = true; continue }
            const result = await inspectFrame(frame, 0)
            if (result.state === 'CONFIRMED') return { ...result, kind: 'FRAME', reason: `FRAME_${result.reason}` }
            uncertain ||= result.state === 'INCONCLUSIVE'
        } catch { uncertain = true }
    }
    return uncertain ? { state: 'INCONCLUSIVE', reason: 'CREATIVE_NOT_CONFIRMED' } : direct
}
