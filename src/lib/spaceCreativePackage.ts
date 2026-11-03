import type { Locator } from 'playwright'
import { fetchPublicCaptureBuffer } from './captureNetwork'

type Identity = { ca: number; cr: number; pl: number }
export type VerifiedSpacePackage = { provider: 'SPACE'; creativeId: string; googleCreativeId: string; documentUrl: string; source: 'SELECTED_SLOT_LOADER' | 'SELECTED_SLOT_CREATIVE_ID' }

function identity(token: string): Identity | undefined {
    if (token.length > 1024 || !/^[\w+/=-]+$/.test(token)) return
    try {
        const value = JSON.parse(Buffer.from(token, 'base64').toString('utf8'))
        if (['ca', 'cr', 'pl'].every(key => Number.isSafeInteger(value[key]) && value[key] > 0)) return value
    } catch { /* Unrecognized tokens never authorize a package. */ }
}

function loaderIdentity(raw: string) {
    try {
        const url = new URL(raw)
        if (url.protocol !== 'https:' || url.hostname !== '00px.net' || url.port || url.username || url.password) return
        const match = url.pathname.match(/^\/target\/([\w+=/-]+)\/planet\.js$/)
        // Encoded separators cannot change the target path.
        if (!match || match[1].includes('/')) return
        return identity(match[1])
    } catch { return }
}

/** Parse provider data, never execute it or infer a creative from a format size. */
export function parseSpacePackage(loaderUrl: string, script: string): string | undefined {
    const expected = loaderIdentity(loaderUrl)
    if (!expected || script.length > 128 * 1024) return
    const tokens = [...script.matchAll(/\.setToken\(['"]([^'"]+)['"]\)/g)]
    const urls = [...script.matchAll(/\.setUrl\(['"]([^'"]+)['"]\)/g)]
    if (tokens.length !== 1 || urls.length !== 1) return
    const returned = identity(tokens[0][1])
    if (!returned || returned.ca !== expected.ca || returned.cr !== expected.cr || returned.pl !== expected.pl) return
    try {
        const url = new URL(urls[0][1])
        if (url.protocol === 'https:' && url.hostname === 'cdn.00px.net' && !url.username && !url.password && !url.port
            && url.pathname === `/rocket/${expected.cr}/index.html`) return `${url.origin}${url.pathname}`
    } catch { return }
}

/** A public package lookup is accepted only if the document declares the same provider ID. */
export function spaceDocumentMatches(documentUrl: string, html: string): boolean {
    try {
        const url = new URL(documentUrl)
        if (url.protocol !== 'https:' || url.hostname !== 'cdn.00px.net' || url.username || url.password || url.port
            || !/^\/rocket\/\d+\/index\.html$/.test(url.pathname) || html.length > 512 * 1024) return false
        const bases = [...html.matchAll(/<base\b[^>]*\bhref\s*=\s*['"]([^'"]+)['"]/gi)]
        if (bases.length !== 1 || !/\bid\s*=\s*['"](?:banner|palco)['"]/i.test(html)) return false
        const base = new URL(bases[0][1], url)
        return base.href === `${url.origin}${url.pathname.replace(/index\.html$/, '')}`
    } catch { return false }
}

/** Resolve only scripts inside the selected slot and its child frames, for the current GAM preview. */
export async function discoverSpacePackage(locator: Locator, signal?: AbortSignal,
    download: typeof fetchPublicCaptureBuffer = fetchPublicCaptureBuffer): Promise<VerifiedSpacePackage | undefined> {
    let googleCreativeId: string
    try {
        const preview = new URL(locator.page().url())
        googleCreativeId = preview.searchParams.get('creativeId') || ''
        if (!preview.searchParams.get('google_preview') || !/^\d+$/.test(googleCreativeId)
            || !/^\d+$/.test(preview.searchParams.get('lineItemId') || '')) return
    } catch { return }
    const candidates = new Map<string, string>()
    let frames = 0
    const inspect = async (scope: Locator, depth: number) => {
        signal?.throwIfAborted()
        const sources = await scope.locator('script[src]').evaluateAll(nodes => nodes.slice(0, 32).map(node => (node as HTMLScriptElement).src))
        const sdk = sources.some(raw => {
            try { const u = new URL(raw); return u.protocol === 'https:' && u.hostname === 'cdn.00px.net'
                && !u.username && !u.password && !u.port && /^\/static\/space\.[\w.-]+\.js$/.test(u.pathname) } catch { return false }
        })
        if (sdk) for (const raw of sources) {
            const value = loaderIdentity(raw)
            if (value) candidates.set(`${value.ca}:${value.cr}:${value.pl}`, raw)
        }
        if (depth >= 3) return
        const handles = await scope.locator('iframe').elementHandles()
        for (const handle of handles.slice(0, 12)) {
            try {
                if (++frames > 12) break
                const frame = await handle.contentFrame()
                if (frame && !frame.isDetached()) await inspect(frame.locator('html'), depth + 1)
            } finally { await handle.dispose() }
        }
    }
    try {
        await inspect(locator, 0)
        if (candidates.size !== 1) return
        const loaderUrl = [...candidates.values()][0]
        const bounded = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(10_000)])
        const value = loaderIdentity(loaderUrl)!
        let documentUrl: string | undefined, source: VerifiedSpacePackage['source'] = 'SELECTED_SLOT_LOADER', unavailable = false
        try {
            const body = await download(loaderUrl, bounded)
            unavailable = body.length === 0
            if (!unavailable) documentUrl = parseSpacePackage(loaderUrl, body.toString('utf8'))
        } catch (error) {
            if (!(error instanceof Error) || error.message !== 'Capture download HTTP 403') throw error
            unavailable = true
        }
        if (unavailable) {
            // Space's public package is keyed by the creative ID in its own ad tag.
            // A denied loader cannot authorize a different package or an unverified document.
            const candidate = `https://cdn.00px.net/rocket/${value.cr}/index.html`
            const html = await download(candidate, bounded)
            if (spaceDocumentMatches(candidate, html.toString('utf8'))) {
                documentUrl = candidate; source = 'SELECTED_SLOT_CREATIVE_ID'
            }
        }
        if (documentUrl) return { provider: 'SPACE', creativeId: String(value.cr), googleCreativeId, documentUrl, source }
    } catch (error) { if (signal?.aborted) throw error }
}
