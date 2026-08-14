import { chromium, devices, Locator } from 'playwright';
import { compositeWithSharp } from './rasterService';
import prisma from './prisma';
import { nexusLogStore } from './nexusLogStore';
import { alertStore } from './alertStore';
import { sendTelegramAlert } from './telegram';
import { normalizeCaptureDelaySeconds } from './captureTiming';
import { getCaptureStorageProviderLabel, uploadCaptureImage } from './captureStorage';
import { getFormatLabelMap, resolveFormatLabel } from './formatLabels';

export interface CaptureResult {
    success: boolean
    filePath?: string
    error?: string
    quarantined?: boolean
    aborted?: boolean
    nonRetryable?: boolean
}

export interface CaptureOptions {
    signal?: AbortSignal
}

class CaptureAbortedError extends Error {
    constructor(message = 'CAPTURE_ABORTED') {
        super(message)
        this.name = 'CaptureAbortedError'
    }
}

function getAbortMessage(signal?: AbortSignal) {
    if (!signal?.aborted) return 'CAPTURE_ABORTED'
    const reason = signal.reason
    if (reason instanceof Error) return reason.message
    return reason ? String(reason) : 'CAPTURE_ABORTED'
}

function throwIfCaptureAborted(signal?: AbortSignal) {
    if (signal?.aborted) throw new CaptureAbortedError(getAbortMessage(signal))
}

function isCaptureAborted(error: unknown, signal?: AbortSignal) {
    return error instanceof CaptureAbortedError || signal?.aborted
}

function abortableDelay(ms: number, signal?: AbortSignal) {
    throwIfCaptureAborted(signal)
    return new Promise<void>((resolve, reject) => {
        const cleanup = () => signal?.removeEventListener('abort', onAbort)
        const timeout = setTimeout(() => {
            cleanup()
            resolve()
        }, ms)
        const onAbort = () => {
            clearTimeout(timeout)
            cleanup()
            reject(new CaptureAbortedError(getAbortMessage(signal)))
        }
        signal?.addEventListener('abort', onAbort, { once: true })
    })
}

function readPositiveMsEnv(name: string, fallback: number, max = 30_000) {
    const parsed = Number(process.env[name])
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback
    return Math.min(Math.floor(parsed), max)
}

const FAST_CAPTURE_NAVIGATION_TIMEOUT_MS = readPositiveMsEnv('NEXUS_FAST_NAVIGATION_TIMEOUT_MS', 2_500, 10_000)
const FAST_SELECTOR_ATTACHED_TIMEOUT_MS = readPositiveMsEnv('NEXUS_FAST_SELECTOR_ATTACHED_TIMEOUT_MS', 2_000, 10_000)
const FAST_SELECTOR_VISIBLE_TIMEOUT_MS = readPositiveMsEnv('NEXUS_FAST_SELECTOR_VISIBLE_TIMEOUT_MS', 1_500, 8_000)
const FAST_SCROLL_SETTLE_MS = readPositiveMsEnv('NEXUS_FAST_SCROLL_SETTLE_MS', 350, 2_000)
const FAST_SCREENSHOT_TIMEOUT_MS = readPositiveMsEnv('NEXUS_FAST_SCREENSHOT_TIMEOUT_MS', 2_500, 10_000)
const FAST_FRAME_SETTLE_MS = readPositiveMsEnv('NEXUS_FAST_FRAME_SETTLE_MS', 100, 1_000)
const FAST_FRAME_TIMEOUT_MS = readPositiveMsEnv('NEXUS_FAST_FRAME_TIMEOUT_MS', 3_000, 10_000)
const MULTI_SIZE_SLOT_TIMEOUT_MS = readPositiveMsEnv('NEXUS_MULTI_SIZE_SLOT_TIMEOUT_MS', 8_000, 15_000)
const MOBILE_CAPTURE_VIEWPORT = { width: 375, height: 667 }
const DESKTOP_CAPTURE_VIEWPORT = { width: 1920, height: 928 }

type ChromiumBrowser = Awaited<ReturnType<typeof chromium.launch>>

async function prepareFinalCaptureImage(
    screenshot: Buffer,
    url: string,
    isMobile: boolean,
    browser: ChromiumBrowser,
    signal?: AbortSignal,
) {
    return compositeStudioImage(screenshot, url, isMobile, signal, browser)
}

// ============================================================================
// NEXUS V48 - RASTER COMPOSITION ENGINE (SHARP)
// ============================================================================

export async function processComposition(campaignId: string) {
    console.log('[Nexus Composition] Iniciando montagem para:', campaignId)
    
    // 1. Get Target Campaign (source of the creative)
    const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        include: { captures: { where: { status: 'SUCCESS' }, orderBy: { createdAt: 'desc' }, take: 1 } }
    })
    
    if (!campaign) throw new Error('Campanha não encontrada')
    
    // 2. Find Template (PI 000) for same format/device
    const template = await prisma.campaign.findFirst({
        where: { 
            pi: '000', 
            format: campaign.format, 
            device: campaign.device,
            isArchived: false 
        },
        include: { captures: { where: { status: 'SUCCESS' }, orderBy: { createdAt: 'desc' }, take: 1 } }
    })

    if (!template || !template.captures[0]) throw new Error(`Template PI 000 não encontrado para Formato ${campaign.format} / Device ${campaign.device}`)
    
    const box = (template as any).compositionBox;
    if (!box || !box.width) throw new Error('Coordenadas de montagem não definidas no template.')

    // 3. URLs
    const creativeUrl = campaign.captures[0]?.screenshotPath || campaign.url;
    const templateUrl = template.captures[0].screenshotPath;

    console.log(`[Nexus Composition] Renderizando via Sharp: ${templateUrl} + Creative @ [${box.x},${box.y}]`)
    
    // 4. Render with Sharp
    const finalImage = await compositeWithSharp(templateUrl, creativeUrl, box);
    
    // 5. Save
    const formatLabelMap = await getFormatLabelMap();
    return await saveCapture({
        ...campaign,
        formatLabel: resolveFormatLabel(formatLabelMap, campaign.format),
    }, finalImage, campaignId);
}


export async function processCampaign(campaignId: string, options: CaptureOptions = {}): Promise<CaptureResult> {
    console.log('[Nexus] ========= INICIANDO CAPTURA =========')
    console.log('[Nexus] Campaign ID:', campaignId)
    await nexusLogStore.addLog(`Nexus: Iniciando processamento da campanha ${campaignId}`, 'SYSTEM', undefined, campaignId);

    try {
        throwIfCaptureAborted(options.signal)
        const settings = await prisma.settings.findUnique({ where: { id: 1 } }) || {
            nexusMaxRetries: 3,
            nexusTimeout: 60000,
            nexusDelay: 3000
        };

        let retryCount = 0;
        const MAX_RETRIES = settings.nexusMaxRetries;
        let lastError = '';
        let stoppedForNonRetryable = false;

        while (retryCount < MAX_RETRIES) {
            throwIfCaptureAborted(options.signal)
            if (retryCount > 0) {
                await nexusLogStore.addLog(`Nexus: Tentativa ${retryCount + 1}/${MAX_RETRIES}...`, 'INFO', undefined, campaignId);
                await abortableDelay(settings.nexusDelay, options.signal);
            }

            console.log('[Nexus] Executando _executeCapture...')
            const attemptStartedAt = Date.now()
            const result = await _executeCapture(campaignId, settings, options);
            console.log('[Nexus] Resultado:', JSON.stringify(result, null, 2))

            if (result.aborted) return result

            if (result.success) {
                await prisma.campaign.update({
                    where: { id: campaignId },
                    data: {
                        retryCount: 0,
                        processingStartedAt: null,
                        processingHeartbeatAt: null,
                        processingRunId: null,
                        lockedUntil: null,
                        lastWorkerError: null,
                    }
                });
                await nexusLogStore.addLog(
                    `Nexus: Sucesso total na campanha ${campaignId}`,
                    'SUCCESS',
                    `Duracao: ${((Date.now() - attemptStartedAt) / 1000).toFixed(1)}s`,
                    campaignId
                );
                return result;
            }

            lastError = result.error || 'Erro desconhecido';
            retryCount++;

            if (result.nonRetryable) {
                stoppedForNonRetryable = true;
                await nexusLogStore.addLog(`Nexus: Falha nao recuperavel. Sem novas tentativas. Erro: ${lastError}`, 'ERROR', undefined, campaignId);
                break;
            }

            await nexusLogStore.addLog(`Nexus: Falha na tentativa ${retryCount}. Erro: ${lastError}`, 'INFO', undefined, campaignId);
        }

        console.log(`[Nexus] Quarentena aplicada para ${campaignId}. Motivo: ${lastError}`);
        if (stoppedForNonRetryable) {
            await nexusLogStore.addLog('Nexus: Quarentena aplicada. Falha nao recuperavel. Tentativas interrompidas.', 'ERROR', `Ultimo erro: ${lastError}`, campaignId);
        } else {
        await nexusLogStore.addLog(`Nexus: Quarentena aplicada. Todas as tentativas falharam.`, 'ERROR', `Último erro: ${lastError}`, campaignId);

        }

        // Visual alert + Telegram
        const attemptMessage = stoppedForNonRetryable
            ? `Falha nao recuperavel apos ${retryCount} tentativa(s).`
            : `Todas as ${MAX_RETRIES} tentativas falharam.`;
        alertStore.addAlert('error', 'Campanha em Quarentena', `${attemptMessage} Erro: ${lastError}`, campaignId);
        sendTelegramAlert('Campanha em Quarentena', `${attemptMessage} Campanha enviada para quarentena.`, `Erro: ${lastError}`, campaignId).catch(() => {});

        // Save failure to database as a record even in quarantine
        await prisma.capture.create({
            data: {
                campaignId,
                status: 'QUARANTINE',
                screenshotPath: '', // No image
                auditNotes: `Nexus Quarentena: ${lastError}`
            }
        });

        await prisma.campaign.update({
            where: { id: campaignId },
            data: {
                status: 'QUARANTINE',
                processingStartedAt: null,
                processingHeartbeatAt: null,
                processingRunId: null,
                lockedUntil: null,
                lastWorkerError: lastError,
            }
        });

        return { success: false, error: lastError, quarantined: true, nonRetryable: stoppedForNonRetryable };
    } catch (e) {
        if (isCaptureAborted(e, options.signal)) {
            const errorMsg = getAbortMessage(options.signal)
            console.warn('[Nexus Capture Aborted]', errorMsg)
            await nexusLogStore.addLog('Nexus: Captura abortada pelo worker', 'INFO', errorMsg, campaignId)
            return { success: false, error: errorMsg, aborted: true }
        }

        const errorMsg = e instanceof Error ? e.message : String(e);
        const stack = e instanceof Error ? e.stack : undefined;
        console.error('[Nexus Critical Error]', e);
        await nexusLogStore.addLog(`Nexus: Erro crítico no processCampaign`, 'ERROR', `${errorMsg}\n\nStack: ${stack}`, campaignId);

        // Visual alert + Telegram
        alertStore.addAlert('error', 'Erro Crítico no Nexus', errorMsg, campaignId);
        sendTelegramAlert('Erro Crítico no Nexus', 'Erro fatal durante processamento da campanha.', errorMsg, campaignId).catch(() => {});

        return { success: false, error: errorMsg };
    }
}

// ... existing code ...

// ============================================================================
// BANNER DETECTION - CLIENT-SIDE SCRIPT INJECTION (NEXUS V6)
// ============================================================================

interface BannerCandidate {
    found: boolean;
    x: number;
    y: number;
    width: number;
    height: number;
    selector?: string;
    html?: string;
}

// Script run INSIDE the browser to find the best candidate
const FIND_BANNER_SCRIPT = `
    ([targetW, targetH]) => {
        const MAX_SIZE_DIFF = 0.10; // 10% strict tolerance
        const candidates = [];
        
        // Helper to check visibility
        function isVisible(el) {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        }

        // 1. Scan common elements
        const elements = document.querySelectorAll('iframe, img, div[id*="google"], ins, div[class*="ad"], div[id*="banner"]');
        
        elements.forEach(el => {
            if (!isVisible(el)) return;
            
            const rect = el.getBoundingClientRect();
            const width = rect.width;
            const height = rect.height;
            
            if (width < 20 || height < 20) return;

            const wDiff = Math.abs(width - targetW) / targetW;
            const hDiff = Math.abs(height - targetH) / targetH;
            
            // Relaxed tolerance for small banners (e.g. 56px vs 50px is ~12%)
            const finalMaxDiff = targetH <= 100 ? 0.20 : MAX_SIZE_DIFF;
            
            if (wDiff <= finalMaxDiff && hDiff <= finalMaxDiff) {
                // Calculate distance from center (prefer more central ads)
                const centerX = rect.x + width / 2;
                const centerY = rect.y + height / 2;
                const distanceC = Math.abs(centerX - window.innerWidth / 2);
                
                candidates.push({
                    element: el,
                    rect: {
                        x: rect.x + window.scrollX,
                        y: rect.y + window.scrollY,
                        width: width,
                        height: height
                    },
                    score: wDiff + hDiff + (distanceC / window.innerWidth) * 0.1 // Size match + centrality
                });
            }
        });

        // 2. Sort by best score (lowest is better)
        candidates.sort((a, b) => a.score - b.score);

        // Return top 5 candidates
        return candidates.slice(0, 5).map(c => ({
            found: true,
            x: c.rect.x,
            y: c.rect.y,
            width: c.rect.width,
            height: c.rect.height,
            selector: c.element.tagName
        }));
    }
`;

interface MeasuredAdBox {
    source: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

const measureAdBoxesInPage = new Function('el', `
    const boxes = [];
    const nodes = Array.from(el.querySelectorAll('iframe, img, ins'));
    nodes.push(el);

    for (let index = 0; index < nodes.length; index++) {
        const target = nodes[index];
        const rect = target.getBoundingClientRect();
        const style = window.getComputedStyle(target);
        const isVisible = rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';

        if (!isVisible) continue;

        boxes.push({
            source: target === el ? 'selector' : target.tagName.toLowerCase() + '#' + (index + 1),
            x: rect.x + window.scrollX,
            y: rect.y + window.scrollY,
            width: rect.width,
            height: rect.height
        });
    }

    return boxes;
`) as (el: Element) => MeasuredAdBox[];

function matchesExpectedDimension(box: MeasuredAdBox, targetW: number, targetH: number) {
    if (!box.width || !box.height || !targetW || !targetH) return false;

    const widthTolerance = targetW <= 320 ? 0.30 : 0.12;
    const heightTolerance = targetH <= 100 ? 0.25 : 0.12;
    const widthDiff = Math.abs(box.width - targetW) / targetW;
    const heightDiff = Math.abs(box.height - targetH) / targetH;

    if (targetH <= 100 && heightDiff <= heightTolerance && box.width >= targetW && box.width <= targetW * 1.4) {
        return true;
    }

    return widthDiff <= widthTolerance && heightDiff <= heightTolerance;
}

function describeMeasuredBoxes(boxes: MeasuredAdBox[]) {
    return boxes
        .map(box => `${box.source}:${Math.round(box.width)}x${Math.round(box.height)}`)
        .join(', ') || 'sem boxes visiveis';
}

async function getLocatorDocumentBox(locator: Locator): Promise<MeasuredAdBox | null> {
    return await locator.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        const isVisible = rect.width > 0
            && rect.height > 0
            && style.display !== 'none'
            && style.visibility !== 'hidden';

        if (!isVisible) return null;

        return {
            source: 'selector',
            x: rect.x + window.scrollX,
            y: rect.y + window.scrollY,
            width: rect.width,
            height: rect.height,
        };
    }).catch(() => null);
}

async function waitForExpectedDimensionInSlot(
    locator: Locator,
    targetW: number,
    targetH: number,
    maxWaitMs: number,
    signal?: AbortSignal,
) {
    const startedAt = Date.now();
    let measuredBoxes: MeasuredAdBox[] = [];

    while (true) {
        throwIfCaptureAborted(signal);
        measuredBoxes = await locator.evaluate(measureAdBoxesInPage);
        const matchingBox = measuredBoxes.find(candidate => matchesExpectedDimension(candidate, targetW, targetH));

        if (matchingBox) {
            return {
                matchingBox,
                measuredBoxes,
                waitedMs: Date.now() - startedAt,
            };
        }

        const elapsedMs = Date.now() - startedAt;
        if (elapsedMs >= maxWaitMs) {
            return {
                matchingBox: null,
                measuredBoxes,
                waitedMs: elapsedMs,
            };
        }

        await abortableDelay(Math.min(250, maxWaitMs - elapsedMs), signal);
    }
}

async function primeConfiguredSlotForLazyLoad(
    page: import('playwright').Page,
    locator: Locator,
    signal: AbortSignal | undefined,
    campaignId: string,
) {
    throwIfCaptureAborted(signal);

    await nexusLogStore.addLog(
        'Nexus: Posicionando seletor na viewport para ativar lazy-load',
        'SYSTEM',
        undefined,
        campaignId,
    );

    await locator.scrollIntoViewIfNeeded({ timeout: FAST_SELECTOR_VISIBLE_TIMEOUT_MS }).catch(() => null);
    await abortableDelay(FAST_SCROLL_SETTLE_MS, signal);

    const targetScrollY = await locator.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return Math.max(0, rect.top + window.scrollY + (rect.height / 2) - (window.innerHeight / 2));
    }).catch(() => null);

    if (typeof targetScrollY === 'number') {
        await page.evaluate((y) => window.scrollTo(0, y), targetScrollY);
        await abortableDelay(FAST_SCROLL_SETTLE_MS, signal);
    }
}

async function injectCreativeAsset(locator: Locator, assetUrl: string, width: number, height: number) {
    await locator.evaluate((element, creative) => {
        const image = document.createElement('img');
        image.src = creative.assetUrl;
        image.alt = '';
        image.dataset.adsnapCreative = 'true';
        image.style.display = 'block';
        image.style.width = `${creative.width}px`;
        image.style.height = `${creative.height}px`;
        image.style.objectFit = 'contain';

        const target = element as HTMLElement;
        target.replaceChildren(image);
        target.style.width = `${creative.width}px`;
        target.style.height = `${creative.height}px`;
        target.style.minWidth = `${creative.width}px`;
        target.style.minHeight = `${creative.height}px`;
        target.style.overflow = 'hidden';
    }, { assetUrl, width, height });

    const image = locator.locator('img[data-adsnap-creative="true"]').first();
    await image.waitFor({ state: 'visible', timeout: FAST_SELECTOR_VISIBLE_TIMEOUT_MS });
    await image.evaluate((node: HTMLImageElement) => {
        if (node.complete && node.naturalWidth > 0) return;
        return new Promise<void>((resolve, reject) => {
            node.addEventListener('load', () => resolve(), { once: true });
            node.addEventListener('error', () => reject(new Error('Falha ao carregar asset do criativo')), { once: true });
        });
    });
}

function getLayeredCreativeDocumentUrl(assetUrl: string) {
    try {
        const url = new URL(assetUrl)
        if (!/(^|\.)00px\.net$/i.test(url.hostname)) return undefined
        const match = url.pathname.match(/^\/rocket\/([^/]+)\/(?:resources\/)?[^/]+\.(?:png|jpe?g|webp)$/i)
        if (!match) return undefined

        return `${url.origin}/rocket/${match[1]}/index.html`
    } catch {
        return undefined
    }
}

async function renderLayeredCreativeAsset(
    browser: ChromiumBrowser,
    creativeDocumentUrl: string,
    width: number,
    height: number,
    captureDelaySeconds: number,
    signal: AbortSignal | undefined,
    campaignId: string,
) {
    throwIfCaptureAborted(signal)
    const page = await browser.newPage()

    try {
        await nexusLogStore.addLog(
            'Nexus: Renderizando pacote HTML5 do criativo',
            'SYSTEM',
            `${creativeDocumentUrl} | ${width}x${height}`,
            campaignId,
        )

        await page.setViewportSize({ width, height })
        await page.goto(creativeDocumentUrl, {
            waitUntil: 'domcontentloaded',
            timeout: FAST_CAPTURE_NAVIGATION_TIMEOUT_MS,
        })
        await page.waitForFunction(
            () => Array.from(document.images).every((img) => img.complete && img.naturalWidth > 0),
            null,
            { timeout: FAST_SELECTOR_VISIBLE_TIMEOUT_MS },
        ).catch(() => null)
        await page.addStyleTag({
            content: `
                html, body {
                    width: ${width}px !important;
                    height: ${height}px !important;
                    margin: 0 !important;
                    overflow: hidden !important;
                    background: transparent !important;
                }
            `,
        }).catch(() => null)

        const delayMs = normalizeCaptureDelaySeconds(captureDelaySeconds) * 1000
        if (delayMs > 0) {
            await abortableDelay(delayMs, signal)
        }

        throwIfCaptureAborted(signal)
        return await page.screenshot({
            type: 'png',
            clip: { x: 0, y: 0, width, height },
            animations: 'allow',
            timeout: FAST_SCREENSHOT_TIMEOUT_MS,
        })
    } finally {
        await page.close().catch(() => null)
    }
}

function isStandaloneCreativeAsset(assetUrl: string) {
    try {
        const url = new URL(assetUrl)
        const isAdfLayer = url.hostname === 'creatives.adftech.com.br'
            && /\/\d{2}\.(?:png|jpe?g|webp)$/i.test(url.pathname)
        const isRocketLayer = /(^|\.)00px\.net$/i.test(url.hostname)
            && /\/rocket\/[^/]+\/(?:resources\/)?[^/]+\.(?:png|jpe?g|webp)$/i.test(url.pathname)

        return !isAdfLayer && !isRocketLayer && /\.(?:png|jpe?g|webp)(?:$|\?)/i.test(url.toString())
    } catch {
        return false
    }
}

const BLOCKED_CAPTURE_ELEMENT_SELECTOR = [
    '#cookie-banner',
    '[id*="cookie-banner" i]',
    '[id*="adopt" i]',
    '[class*="adopt" i]',
    'button#adopt-preferences-button',
    'a[class*="adopt-" i]',
].join(',')
const BLOCKED_CAPTURE_ELEMENT_XPATH = '//*[@id="cookie-banner"]'
const BLOCKED_CAPTURE_ELEMENT_STYLE = `
    ${BLOCKED_CAPTURE_ELEMENT_SELECTOR} {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
    }
`

async function installKnownBlockedElementGuard(
    page: import('playwright').Page,
    signal?: AbortSignal,
) {
    throwIfCaptureAborted(signal)

    await page.addInitScript((styleContent) => {
        const blockedSelector = '#cookie-banner'
        const styleId = 'adsnap-blocked-capture-elements'

        const ensureStyle = () => {
            if (document.getElementById(styleId)) return
            const style = document.createElement('style')
            style.id = styleId
            style.textContent = String(styleContent)
            ;(document.head || document.documentElement).appendChild(style)
        }

        const removeBlockedElements = () => {
            document.querySelectorAll(blockedSelector).forEach((element) => element.remove())
        }

        const install = () => {
            ensureStyle()
            removeBlockedElements()
            const observer = new MutationObserver(() => {
                ensureStyle()
                removeBlockedElements()
            })
            observer.observe(document.documentElement, { childList: true, subtree: true })
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', install, { once: true })
        } else {
            install()
        }
    }, BLOCKED_CAPTURE_ELEMENT_STYLE).catch(() => null)
}

async function removeKnownBlockedElementsBeforeScreenshot(
    page: import('playwright').Page,
    campaignId: string,
    signal?: AbortSignal,
) {
    throwIfCaptureAborted(signal)

    await page.addStyleTag({ content: BLOCKED_CAPTURE_ELEMENT_STYLE }).catch(() => null)
    const removed = await page.locator(`xpath=${BLOCKED_CAPTURE_ELEMENT_XPATH}`).evaluateAll((elements) => {
        for (const element of elements) {
            element.remove()
        }

        return elements.length
    }).catch(() => 0)

    if (removed > 0) {
        await nexusLogStore.addLog(
            'Nexus: Cookie banner bloqueado antes do print',
            'SYSTEM',
            `XPath bloqueado: ${BLOCKED_CAPTURE_ELEMENT_XPATH}`,
            campaignId,
        )
    }
}

async function captureScreenshotAfterConfiguredDelay(
    page: import('playwright').Page,
    campaignId: string,
    captureDelaySeconds: number,
    signal?: AbortSignal,
    animations: 'allow' | 'disabled' = 'allow',
    _alreadyWaitedMs = 0,
) {
    throwIfCaptureAborted(signal)
    const configuredDelayMs = normalizeCaptureDelaySeconds(captureDelaySeconds) * 1000

    await page.waitForLoadState('domcontentloaded', { timeout: FAST_SCROLL_SETTLE_MS }).catch(() => null)
    if (configuredDelayMs > 0) {
        const remainingSeconds = Number((configuredDelayMs / 1000).toFixed(1))
        await nexusLogStore.addLog(
            `Nexus: Aguardando ${remainingSeconds}s apos o criativo ficar pronto`,
            'SYSTEM',
            'Delay configurado aplicado apos validacao do slot/formato; selecao automatica de frame desativada',
            campaignId,
        )
        await abortableDelay(configuredDelayMs, signal)
    } else {
        await nexusLogStore.addLog(
            'Nexus: Captura sem delay adicional apos slot pronto',
            'SYSTEM',
            'Delay configurado igual a 0s',
            campaignId,
        )
    }
    throwIfCaptureAborted(signal)
    await removeKnownBlockedElementsBeforeScreenshot(page, campaignId, signal)
    throwIfCaptureAborted(signal)
    return page.screenshot({ type: 'png', animations, scale: 'css', timeout: FAST_SCREENSHOT_TIMEOUT_MS })
}

// ============================================================================
// MAIN CAPTURE EXECUTION
// ============================================================================

async function _executeCapture(campaignId: string, settings: any, options: CaptureOptions = {}): Promise<CaptureResult> {
    console.log('[Nexus] _executeCapture() iniciando...')
    throwIfCaptureAborted(options.signal)
    const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: {
            url: true,
            format: true,
            device: true,
            client: true,
            agency: true,
            campaignName: true,
            pi: true,
            compositionBox: true,
            captureDelaySeconds: true,
        }
    });

    if (!campaign) throw new Error('Campanha não encontrada');
    const composition = campaign.compositionBox && typeof campaign.compositionBox === 'object'
        ? campaign.compositionBox as { creativeAssetUrl?: string }
        : null;
    const creativeAssetUrl = composition?.creativeAssetUrl;
    const standaloneCreativeAssetUrl = creativeAssetUrl && isStandaloneCreativeAsset(creativeAssetUrl)
        ? creativeAssetUrl
        : undefined;
    const layeredCreativeDocumentUrl = creativeAssetUrl
        ? getLayeredCreativeDocumentUrl(creativeAssetUrl)
        : undefined;

    if (layeredCreativeDocumentUrl) {
        await nexusLogStore.addLog(
            'Nexus: Pacote HTML5 do criativo detectado',
            'INFO',
            layeredCreativeDocumentUrl,
            campaignId
        );
    } else if (creativeAssetUrl && !standaloneCreativeAssetUrl) {
        await nexusLogStore.addLog(
            'Nexus: Asset em camadas detectado; usando renderizacao real do preview',
            'INFO',
            creativeAssetUrl,
            campaignId
        );
    }

    console.log('[Nexus] Campanha encontrada:', campaign.client, '-', campaign.format)
    await nexusLogStore.addLog(`Nexus: Processando ${campaign.client} - Formato: ${campaign.format}`, 'INFO', undefined, campaignId);

    // Parse Settings Formats
    let bannerConfig = null;
    let targetW = 0;
    let targetH = 0;

    try {
        const formats = JSON.parse(settings.bannerFormats || '[]');
        bannerConfig = formats.find((f: any) => f.id === campaign.format);

        if (bannerConfig) {
            console.log(`[Nexus] Formato configurado detectado: ${bannerConfig.label} (${bannerConfig.selector})`);
            targetW = bannerConfig.width;
            targetH = bannerConfig.height;
        } else {
            // Legacy/Fallback parsing
            console.log('[Nexus] Formato configurado não encontrado (ou legado). Tentando parsing manual...');
            const dims = campaign.format.toLowerCase().split('x').map(Number);
            if (dims.length === 2 && !isNaN(dims[0]) && !isNaN(dims[1])) {
                targetW = dims[0];
                targetH = dims[1];
            }
            await nexusLogStore.addLog(`Nexus: Formato '${campaign.format}' não configurado. Fallback dimensões: ${targetW}x${targetH}`, 'SYSTEM', undefined, campaignId);
        }
    } catch (e) {
        console.error('[Nexus] Erro ao processar formatos:', e);
        const dims = campaign.format.toLowerCase().split('x').map(Number);
        targetW = dims[0];
        targetH = dims[1];
    }

    if (!targetW || !targetH) {
        const error = `Formato inválido ou não configurado: ${campaign.format}`;
        await nexusLogStore.addLog(`Nexus: ${error}`, 'ERROR', undefined, campaignId);
        throw new Error(error);
    }

    const campaignForStorage = {
        ...campaign,
        formatLabel: bannerConfig?.label || `${targetW}x${targetH}`,
    };

    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
    const closeBrowserOnAbort = () => {
        browser?.close().catch(() => {})
    }
    try {
        options.signal?.addEventListener('abort', closeBrowserOnAbort, { once: true })
        console.log('[Nexus] Iniciando browser...')
        await nexusLogStore.addLog(`Nexus: Lançando browser Playwright (${targetW}x${targetH})`, 'SYSTEM', undefined, campaignId);
        const isMobile = campaign.device === 'mobile' || (targetW === 320 && (targetH === 100 || targetH === 50));

        browser = await chromium.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-extensions',
                '--disable-background-networking',
                '--disable-background-timer-throttling',
                '--disable-renderer-backgrounding',
                '--disable-sync',
                '--mute-audio',
                '--no-first-run',
                '--font-render-hinting=none'
            ]
        });
        throwIfCaptureAborted(options.signal)

        const context = await browser.newContext(isMobile ? {
            ...devices['iPhone 8'],
            viewport: MOBILE_CAPTURE_VIEWPORT,
            screen: MOBILE_CAPTURE_VIEWPORT,
            deviceScaleFactor: 1,
            timezoneId: 'America/Sao_Paulo',
            serviceWorkers: 'block',
        } : {
            viewport: DESKTOP_CAPTURE_VIEWPORT,
            timezoneId: 'America/Sao_Paulo',
            serviceWorkers: 'block',
        });
        context.setDefaultTimeout(FAST_SELECTOR_VISIBLE_TIMEOUT_MS)
        context.setDefaultNavigationTimeout(FAST_CAPTURE_NAVIGATION_TIMEOUT_MS)
        await context.route('**/*', route => {
            const resourceType = route.request().resourceType()
            if (resourceType === 'manifest' || resourceType === 'websocket' || resourceType === 'eventsource') {
                return route.abort().catch(() => undefined)
            }
            return route.continue().catch(() => undefined)
        })

        const page = await context.newPage();
        await installKnownBlockedElementGuard(page, options.signal)
        throwIfCaptureAborted(options.signal)

        // Navigate
        console.log(`[Nexus] Navegando para: ${campaign.url}`);
        await nexusLogStore.addLog(`Nexus: Navegando para a URL`, 'SYSTEM', campaign.url, campaignId);

        try {
            await page.goto(campaign.url, {
                waitUntil: 'domcontentloaded',
                timeout: Math.min(Number(settings.nexusTimeout) || FAST_CAPTURE_NAVIGATION_TIMEOUT_MS, FAST_CAPTURE_NAVIGATION_TIMEOUT_MS)
            });
        } catch (navError) {
            throwIfCaptureAborted(options.signal)
            const navMsg = navError instanceof Error ? navError.message : String(navError);
            console.log('[Nexus] Navegação inicial finalizada com aviso/timeout:', navMsg);
            await nexusLogStore.addLog(`Nexus: Aviso na navegação (prosseguindo)`, 'INFO', navMsg, campaignId);
        }

        await removeKnownBlockedElementsBeforeScreenshot(page, campaignId, options.signal)

        // WARM-UP: Smart Scroll
        // Sempre realiza o scroll para mobile para garantir o carregamento de banners lazy-load (ex: Metrópoles)
        // O usuário confirmou que 320x100 funciona, vamos garantir que 320x50 siga o mesmo fluxo robusto
        if (!bannerConfig?.selector && isMobile) {
            console.log('[Nexus] Realizando scroll de aquecimento (Lazy Load Check)...');
            await nexusLogStore.addLog('Nexus: Realizando scroll para carregar anúncios (Lazy Load)', 'SYSTEM', undefined, campaignId);
            await page.evaluate(async () => {
                return new Promise<void>((resolve) => {
                    let totalHeight = 0;
                    const distance = 300;
                    const timer = setInterval(() => {
                        const scrollHeight = document.body.scrollHeight;
                        window.scrollBy(0, distance);
                        totalHeight += distance;

                        if (totalHeight >= scrollHeight || totalHeight > 1600) {
                            clearInterval(timer);
                            window.scrollTo(0, 0); // Reset to top
                            resolve();
                        }
                    }, 25);
                });
            });
            await abortableDelay(FAST_SCROLL_SETTLE_MS, options.signal);
        } else if (!bannerConfig?.selector) {
            console.log('[Nexus] Desktop detectado. Realizando warm-up de slots...');
            await abortableDelay(FAST_SCROLL_SETTLE_MS, options.signal);
            await page.evaluate(async () => {
                return new Promise<void>((resolve) => {
                    let totalHeight = 0;
                    const distance = 350;
                    const timer = setInterval(() => {
                        window.scrollBy(0, distance);
                        totalHeight += distance;

                        if (totalHeight > 2200) {
                            clearInterval(timer);
                            window.scrollTo(0, 0);
                            resolve();
                        }
                    }, 25);
                });
            });
            await abortableDelay(FAST_SCROLL_SETTLE_MS, options.signal);
        }
        throwIfCaptureAborted(options.signal)

        // ====================================================
        // STRATEGY 1: EXPLICIT SELECTOR
        // ====================================================
        let selectorMismatchError: string | null = null;
        if (bannerConfig && bannerConfig.selector) {
            const selectorCandidates = [bannerConfig.selector];
            if (targetW === 300 && targetH === 250 && bannerConfig.selector.includes('home-quadrado-0')) {
                selectorCandidates.push(bannerConfig.selector.replace('home-quadrado-0', 'home-quadrado-1'));
            }

            for (const selector of selectorCandidates) {
                throwIfCaptureAborted(options.signal)
                console.log(`[Nexus] Tentando captura via seletor: ${selector}`);
                await nexusLogStore.addLog(`Nexus: Buscando seletor configurado: ${selector}`, 'SYSTEM', undefined, campaignId);

                try {
                    const locator = page.locator(selector).first();

                    await locator.waitFor({ state: 'attached', timeout: FAST_SELECTOR_ATTACHED_TIMEOUT_MS });
                    await primeConfiguredSlotForLazyLoad(page, locator, options.signal, campaignId);
    
                    if (!await locator.isVisible()) {
                        console.log('[Nexus] Seletor existe mas não está visível. Tentando scroll...');
                        await locator.scrollIntoViewIfNeeded({ timeout: FAST_SELECTOR_VISIBLE_TIMEOUT_MS });
                        await abortableDelay(FAST_SCROLL_SETTLE_MS, options.signal);
                    }
    
                    await locator.waitFor({ state: 'visible', timeout: FAST_SELECTOR_VISIBLE_TIMEOUT_MS });
    
                    if (standaloneCreativeAssetUrl) {
                        console.log(`[Nexus] Injetando asset autenticado do GAM no slot (${targetW}x${targetH})`);
                        await injectCreativeAsset(locator, standaloneCreativeAssetUrl, targetW, targetH);
                        await nexusLogStore.addLog('Nexus: Criativo autenticado injetado no slot', 'SUCCESS', standaloneCreativeAssetUrl, campaignId);
                    }
    
                    const box = await locator.boundingBox();
    
                    if (box && (box.width < 10 || box.height < 10)) {
                        console.log('[Nexus] Dimensões pequenas. Buscando iframe...');
                        const frameLocator = locator.locator('iframe').first();
                        if (await frameLocator.count() > 0) {
                            await frameLocator.waitFor({ state: 'visible', timeout: FAST_SELECTOR_VISIBLE_TIMEOUT_MS });
                        }
                    }
    
                    let measuredBoxes = await locator.evaluate(measureAdBoxesInPage);
                    let matchingBox: MeasuredAdBox | null = measuredBoxes.find(candidate => matchesExpectedDimension(candidate, targetW, targetH)) || null;
                    let selectorDimensionWaitMs = 0;

                    if (!matchingBox) {
                        const initialMeasured = describeMeasuredBoxes(measuredBoxes);
                        const configuredDelayMs = normalizeCaptureDelaySeconds(campaign.captureDelaySeconds) * 1000;
                        const maxSlotWaitMs = Math.min(MULTI_SIZE_SLOT_TIMEOUT_MS, Math.max(configuredDelayMs, 1_500));

                        console.log(`[Nexus] Slot multi-size ainda nao exibiu ${targetW}x${targetH}. Medido: ${initialMeasured}`);
                        await nexusLogStore.addLog(
                            'Nexus: Conferindo dimensao do slot configurado',
                            'INFO',
                            `Esperado ${targetW}x${targetH}; medido agora: ${initialMeasured}; janela: ${maxSlotWaitMs / 1000}s`,
                            campaignId,
                        );

                        const waitedMeasurement = await waitForExpectedDimensionInSlot(
                            locator,
                            targetW,
                            targetH,
                            maxSlotWaitMs,
                            options.signal,
                        );

                        matchingBox = waitedMeasurement.matchingBox;
                        measuredBoxes = waitedMeasurement.measuredBoxes;
                        selectorDimensionWaitMs = waitedMeasurement.waitedMs;
                    }
    
                    const captureAnchorBox = matchingBox || await getLocatorDocumentBox(locator);

                    if (!captureAnchorBox) {
                        throw new Error('Seletor configurado sem area visivel para captura');
                    }

                    if (matchingBox) {
                        console.log(`[Nexus] Seletor validado! ${matchingBox.source} (${Math.round(matchingBox.width)}x${Math.round(matchingBox.height)})`);
                        await nexusLogStore.addLog('Nexus: Seletor validado com dimensao correta', 'SUCCESS', `Dim: ${Math.round(matchingBox.width)}x${Math.round(matchingBox.height)} | Esperado: ${targetW}x${targetH}`, campaignId);
                    } else {
                        const measured = describeMeasuredBoxes(measuredBoxes);
                        console.log(`[Nexus] Dimensao nao confirmou ${targetW}x${targetH}; seguindo pelo XPath configurado. Medido: ${measured}`);
                        await nexusLogStore.addLog(
                            'Nexus: Dimensao nao confirmou; seguindo pelo XPath configurado',
                            'INFO',
                            `Esperado ${targetW}x${targetH}; medido apos espera: ${measured}`,
                            campaignId,
                        );
                    }

                    const viewportHeight = isMobile ? MOBILE_CAPTURE_VIEWPORT.height : DESKTOP_CAPTURE_VIEWPORT.height;
                    const targetScrollY = Math.max(0, captureAnchorBox.y + (captureAnchorBox.height / 2) - (viewportHeight / 2));

                    await page.evaluate((y) => window.scrollTo(0, y), targetScrollY);
                    await abortableDelay(FAST_SCROLL_SETTLE_MS, options.signal);

                    if (standaloneCreativeAssetUrl) {
                        await injectCreativeAsset(locator, standaloneCreativeAssetUrl, targetW, targetH);
                        await abortableDelay(FAST_SCROLL_SETTLE_MS, options.signal);
                    }

                    let captureDelaySeconds = campaign.captureDelaySeconds;
                    let screenshotAnimations: 'allow' | 'disabled' = standaloneCreativeAssetUrl ? 'disabled' : 'allow';

                    if (layeredCreativeDocumentUrl && !standaloneCreativeAssetUrl) {
                        const renderedCreative = await renderLayeredCreativeAsset(
                            browser,
                            layeredCreativeDocumentUrl,
                            targetW,
                            targetH,
                            campaign.captureDelaySeconds,
                            options.signal,
                            campaignId,
                        );
                        const renderedDataUrl = `data:image/png;base64,${renderedCreative.toString('base64')}`;
                        await injectCreativeAsset(locator, renderedDataUrl, targetW, targetH);
                        await abortableDelay(FAST_SCROLL_SETTLE_MS, options.signal);
                        await nexusLogStore.addLog(
                            'Nexus: Criativo HTML5 renderizado e fixado no slot',
                            'SUCCESS',
                            `${targetW}x${targetH}`,
                            campaignId,
                        );
                        captureDelaySeconds = 0;
                        screenshotAnimations = 'disabled';
                    }

                    const screenshotBuffer = await captureScreenshotAfterConfiguredDelay(
                        page,
                        campaignId,
                        captureDelaySeconds,
                        options.signal,
                        screenshotAnimations,
                        selectorDimensionWaitMs,
                    );
                    const finalImage = await prepareFinalCaptureImage(screenshotBuffer, campaign.url, isMobile, browser, options.signal);
                    await browser.close();
                    return await saveCapture(campaignForStorage, finalImage, campaignId, options);
                } catch (selError) {
                    const msg = selError instanceof Error ? selError.message : String(selError);
                    console.warn('[Nexus] Falha no seletor:', msg);
                    await nexusLogStore.addLog(`Nexus: Falha no seletor (${msg}). Tentando proximo slot...`, 'INFO', undefined, campaignId);
                }
            }
        }

        // ====================================================
        // STRATEGY 2: AUTO-DETECTION
        // ====================================================
        console.log('[Nexus] Iniciando Auto-Detecção...')
        await nexusLogStore.addLog('Nexus: Iniciando script de detecção automática', 'SYSTEM', undefined, campaignId);

        const candidates = await page.evaluate<BannerCandidate[]>(eval(FIND_BANNER_SCRIPT), [targetW, targetH]);
        throwIfCaptureAborted(options.signal)

        if (!candidates || candidates.length === 0) {
            console.log('[Nexus] Nenhum banner encontrado via script')
            await browser.close();
            await nexusLogStore.addLog('Nexus: Nenhum candidato a banner encontrado na pagina', 'INFO', undefined, campaignId);
            if (selectorMismatchError) {
                return { success: false, error: selectorMismatchError };
            }
            return { success: false, error: 'Banner não localizado na página' };
        }

        console.log(`[Nexus] ${candidates.length} candidatos encontrados.`);
        await nexusLogStore.addLog(`Nexus: ${candidates.length} candidatos identificados. Analisando conteúdo...`, 'SYSTEM', undefined, campaignId);

        let bestCandidate = null;
        let fallbackCandidate = null;
        let largestSizeKB = 0;

        const MIN_STRICT_KB = 0.5;
        const MIN_FALLBACK_KB = 0.1;

        for (const [index, candidate] of candidates.entries()) {
            throwIfCaptureAborted(options.signal)
            console.log(`[Nexus] Verificando candidato #${index + 1}: ${Math.round(candidate.width)}x${Math.round(candidate.height)}`);

            try {
                await page.evaluate((y) => window.scrollTo(0, y), Math.max(0, candidate.y - 300));
                await abortableDelay(FAST_SCROLL_SETTLE_MS, options.signal);

                const clip = {
                    x: candidate.x,
                    y: candidate.y,
                    width: candidate.width,
                    height: candidate.height
                };

                const bannerBuffer = await page.screenshot({ clip, timeout: FAST_SCREENSHOT_TIMEOUT_MS });
                const sizeKB = bannerBuffer.length / 1024;
                console.log(`[Nexus] Candidato #${index + 1} - Tamanho: ${sizeKB.toFixed(2)} KB`);

                if (sizeKB > largestSizeKB) {
                    largestSizeKB = sizeKB;
                    fallbackCandidate = candidate;
                }

                if (sizeKB >= MIN_STRICT_KB) {
                    console.log(`[Nexus] Candidato #${index + 1} validado!`);
                    await nexusLogStore.addLog(`Nexus: Candidato #${index + 1} validado (${sizeKB.toFixed(2)} KB)`, 'INFO', undefined, campaignId);
                    bestCandidate = candidate;
                    break;
                } else {
                    await nexusLogStore.addLog(`Nexus: Candidato #${index + 1} muito leve (${sizeKB.toFixed(2)} KB)`, 'INFO', undefined, campaignId);
                }
            } catch (e) {
                console.warn(`[Nexus] Erro ao analisar candidato #${index + 1}:`, e);
            }
        }

        if (!bestCandidate && fallbackCandidate && largestSizeKB >= MIN_FALLBACK_KB) {
            console.log(`[Nexus] Usando fallback: ${largestSizeKB.toFixed(2)} KB`);
            await nexusLogStore.addLog(`Nexus: Usando melhor material alternativo encontrado (${largestSizeKB.toFixed(2)} KB)`, 'INFO', undefined, campaignId);
            bestCandidate = fallbackCandidate;
        }

        if (!bestCandidate) {
            console.log('[Nexus] Falha: Nenhum conteúdo visual detectado.');
            await browser.close();
            await nexusLogStore.addLog('Nexus: Falha - Banners localizados mas parecem vazios ou invisiveis', 'INFO', undefined, campaignId);
            if (selectorMismatchError) {
                return { success: false, error: selectorMismatchError };
            }
            return { success: false, error: 'Banners encontrados mas parecem vazios ou invisíveis' };
        }

        const viewportHeight = isMobile ? MOBILE_CAPTURE_VIEWPORT.height : DESKTOP_CAPTURE_VIEWPORT.height;
        const targetScrollY = Math.max(0, bestCandidate.y + (bestCandidate.height / 2) - (viewportHeight / 2));

        console.log(`[Nexus] Scroll final para Y = ${Math.round(targetScrollY)} `);
        await page.evaluate((y) => window.scrollTo(0, y), targetScrollY);

        await abortableDelay(FAST_SCROLL_SETTLE_MS, options.signal);

        console.log('[Nexus] Aguardando delay configurado para screenshot final...')
        const screenshotBuffer = await captureScreenshotAfterConfiguredDelay(page, campaignId, campaign.captureDelaySeconds, options.signal);
        await nexusLogStore.addLog('Nexus: Print capturado. Aplicando moldura obrigatoria...', 'SYSTEM', undefined, campaignId);

        const finalImage = await prepareFinalCaptureImage(screenshotBuffer, campaign.url, isMobile, browser, options.signal);
        await browser.close();

        return await saveCapture(campaignForStorage, finalImage, campaignId, options);

    } catch (err) {
        if (browser) await browser.close();
        if (isCaptureAborted(err, options.signal)) {
            const msg = getAbortMessage(options.signal)
            await nexusLogStore.addLog('Nexus: Captura interrompida por timeout', 'INFO', msg, campaignId);
            return { success: false, error: msg, aborted: true };
        }
        const msg = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : undefined;
        console.error('[Capture Error]', err);
        await nexusLogStore.addLog(`Nexus: Falha da tentativa de captura`, 'INFO', `${msg}\n\nStack: ${stack}`, campaignId);
        return { success: false, error: msg };
    } finally {
        options.signal?.removeEventListener('abort', closeBrowserOnAbort)
    }
}

async function saveCapture(campaign: any, imageBuffer: Buffer, campaignId: string, options: CaptureOptions = {}) {
    try {
        throwIfCaptureAborted(options.signal)
        const requestedStorageLabel = getCaptureStorageProviderLabel()
        await nexusLogStore.addLog(`Nexus: Iniciando upload para o ${requestedStorageLabel}...`, 'SYSTEM', undefined, campaignId);

        const storedCapture = await uploadCaptureImage(imageBuffer, { campaign, campaignId })
        const storageLabel = getCaptureStorageProviderLabel(storedCapture.provider)
        const publicUrl = storedCapture.uri

        console.log(`[Nexus] Captura salva em ${storageLabel}: ${storedCapture.uri}`);

        if (storedCapture.fallbackReason) {
            await nexusLogStore.addLog(
                `Nexus: Google Drive indisponivel. Captura preservada no Supabase Storage.`,
                'INFO',
                storedCapture.fallbackReason,
                campaignId
            )
        }

        await nexusLogStore.addLog(`Nexus: Upload concluido no ${storageLabel}. Salvando no banco de dados...`, 'SYSTEM', storedCapture.uri, campaignId);



        console.log(`[Nexus] URI de captura gerada: ${publicUrl}`);

        // 4. Save to database using transaction
        await prisma.$transaction([
            prisma.capture.create({
                data: {
                    campaignId,
                    screenshotPath: publicUrl,
                    status: 'SUCCESS',
                    auditNotes: 'Captura realizada com sucesso via Nexus Engine Cloud.'
                }
            }),
            prisma.campaign.update({
                where: { id: campaignId },
                data: {
                    status: 'SUCCESS',
                    lastCaptureAt: new Date(),
                    retryCount: 0,
                    processingStartedAt: null,
                    processingHeartbeatAt: null,
                    processingRunId: null,
                    lockedUntil: null,
                    lastWorkerError: null
                }
            })
        ]);

        await nexusLogStore.addLog(`Nexus: Processo finalizado com sucesso!`, 'SUCCESS', undefined, campaignId);
        return { success: true, filePath: publicUrl };

    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[Nexus saveCapture Error]', err);
        await nexusLogStore.addLog(`Nexus: Erro ao salvar captura final`, 'ERROR', msg, campaignId);

        // Ensure failed state in database
        try {
            await prisma.campaign.update({
                where: { id: campaignId },
                data: {
                    status: 'FAILED',
                    processingStartedAt: null,
                    processingHeartbeatAt: null,
                    processingRunId: null,
                    lockedUntil: null,
                    lastWorkerError: msg
                }
            });
        } catch (dbErr) {
            console.error('[Nexus saveCapture DB Fallback Error]', dbErr);
        }

        throw err;
    }
}

// ============================================================================
// STUDIO COMPOSITION - Premium device frames
// ============================================================================

async function compositeEvidenceFrameImage(
    screenshot: Buffer,
    url: string,
    isMobile: boolean,
    signal?: AbortSignal,
    existingBrowser?: ChromiumBrowser,
): Promise<Buffer> {
    throwIfCaptureAborted(signal)
    const ownsBrowser = !existingBrowser
    const studioBrowser = existingBrowser || await chromium.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-extensions',
            '--disable-background-networking',
            '--disable-sync',
            '--mute-audio',
            '--no-first-run',
        ]
    });
    let closeStudioOnAbort: (() => void) | undefined;
    let studioPage: import('playwright').Page | undefined;
    let compositionTimeout: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
        compositionTimeout = setTimeout(() => reject(new Error('Studio Composition Timeout')), FAST_FRAME_TIMEOUT_MS)
    });

    try {
        closeStudioOnAbort = () => studioBrowser.close().catch(() => {})
        signal?.addEventListener('abort', closeStudioOnAbort, { once: true })
        studioPage = await studioBrowser.newPage();
        await studioPage.setViewportSize({ width: 1920, height: 1080 });

        const base64 = screenshot.toString('base64');
        const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
        const date = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });
        const domain = new URL(url).hostname;
        const safeDomain = domain.replace(/^www\./, '');
        const safeUrl = `https://${safeDomain}`;

        const html = `
            <html>
            <head>
                <style>
                    * { box-sizing: border-box; }
                    html, body {
                        margin: 0;
                        width: 1920px;
                        height: 1080px;
                        overflow: hidden;
                        background: transparent;
                        font-family: Inter, Arial, system-ui, sans-serif;
                    }
                    body { color: #ffffff; }
                    .stage {
                        position: relative;
                        width: 1920px;
                        height: 1080px;
                        overflow: hidden;
                        background:
                            radial-gradient(circle at 50% 46%, rgba(255,255,255,.12), transparent 36%),
                            linear-gradient(135deg, #0f0f0f 0%, #151515 52%, #0b0b0b 100%);
                    }
                    .stage::before {
                        content: "";
                        position: absolute;
                        inset: 0;
                        background-image:
                            linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px);
                        background-size: 44px 44px;
                        opacity: .24;
                    }
                    .desktop-shell {
                        position: absolute;
                        inset: 28px;
                        overflow: hidden;
                        border: 1px solid rgba(255,255,255,.10);
                        border-radius: 14px;
                        background: #ffffff;
                        box-shadow: 0 42px 120px rgba(0,0,0,.48);
                    }
                    .browser-bar {
                        height: 58px;
                        display: grid;
                        grid-template-columns: 92px 1fr 170px;
                        align-items: center;
                        gap: 18px;
                        padding: 0 18px;
                        background: rgba(20,20,20,.96);
                        border-bottom: 1px solid rgba(255,255,255,.08);
                    }
                    .traffic {
                        display: flex;
                        gap: 8px;
                    }
                    .traffic span {
                        width: 11px;
                        height: 11px;
                        border-radius: 50%;
                        background: rgba(255,255,255,.30);
                    }
                    .traffic span:nth-child(1) { background: #ff5f57; }
                    .traffic span:nth-child(2) { background: #ffbd2e; }
                    .traffic span:nth-child(3) { background: #28c840; }
                    .address {
                        height: 34px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 8px;
                        padding: 0 20px;
                        overflow: hidden;
                        border: 1px solid rgba(255,255,255,.10);
                        border-radius: 8px;
                        background: rgba(255,255,255,.08);
                        color: #e5e5e5;
                        font-size: 13px;
                        line-height: 1;
                        white-space: nowrap;
                    }
                    .address svg {
                        flex: 0 0 auto;
                        opacity: .62;
                    }
                    .browser-meta {
                        display: flex;
                        align-items: center;
                        justify-content: flex-end;
                        color: #a3a3a3;
                        font-size: 12px;
                        white-space: nowrap;
                    }
                    .desktop-content {
                        width: 100%;
                        height: calc(100% - 58px);
                        overflow: hidden;
                        background: #ffffff;
                    }
                    .desktop-content img,
                    .phone-content img {
                        width: 100%;
                        height: 100%;
                        object-fit: contain;
                        object-position: top center;
                        display: block;
                        background: #ffffff;
                    }
                    .mobile-meta {
                        position: absolute;
                        top: 78px;
                        left: 50%;
                        transform: translateX(-50%);
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        padding: 10px 14px;
                        border: 1px solid rgba(255,255,255,.08);
                        border-radius: 999px;
                        background: rgba(20,20,20,.72);
                        color: #e5e5e5;
                        font-size: 13px;
                        box-shadow: 0 18px 50px rgba(0,0,0,.28);
                    }
                    .phone-wrap {
                        position: absolute;
                        inset: 0;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        perspective: 1600px;
                    }
                    .phone {
                        position: relative;
                        width: 414px;
                        height: 896px;
                        border-radius: 58px;
                        padding: 12px;
                        background: linear-gradient(145deg, #2b2b2b, #050505);
                        border: 1px solid rgba(255,255,255,.20);
                        box-shadow: 0 46px 120px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.05) inset;
                        transform: rotateX(1.5deg) rotateY(-1deg);
                    }
                    .phone::before,
                    .phone::after {
                        content: "";
                        position: absolute;
                        width: 5px;
                        border-radius: 4px;
                        background: #2b2b2b;
                    }
                    .phone::before { left: -5px; top: 170px; height: 82px; }
                    .phone::after { right: -5px; top: 190px; height: 96px; }
                    .phone-screen {
                        position: relative;
                        width: 100%;
                        height: 100%;
                        overflow: hidden;
                        border-radius: 47px;
                        background: #ffffff;
                    }
                    .phone-content {
                        position: absolute;
                        inset: 48px 0 64px;
                        overflow: hidden;
                        background: #ffffff;
                    }
                    .ios-status {
                        position: absolute;
                        z-index: 5;
                        top: 0;
                        left: 0;
                        right: 0;
                        height: 48px;
                        display: flex;
                        align-items: flex-end;
                        justify-content: space-between;
                        padding: 0 26px 10px;
                        color: #050505;
                        font-size: 15px;
                        font-weight: 700;
                        background: rgba(255,255,255,.96);
                    }
                    .island {
                        position: absolute;
                        z-index: 6;
                        top: 11px;
                        left: 50%;
                        transform: translateX(-50%);
                        width: 108px;
                        height: 31px;
                        border-radius: 999px;
                        background: #000000;
                    }
                    .safari {
                        position: absolute;
                        z-index: 5;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        height: 64px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        padding: 0 22px 10px;
                        background: rgba(255,255,255,.96);
                        border-top: 1px solid rgba(0,0,0,.08);
                    }
                    .safari-pill {
                        width: 100%;
                        height: 38px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 6px;
                        border-radius: 12px;
                        background: #f2f2f7;
                        color: #1c1c1e;
                        font-size: 13px;
                    }
                    .home-indicator {
                        position: absolute;
                        z-index: 7;
                        bottom: 7px;
                        left: 50%;
                        width: 128px;
                        height: 5px;
                        transform: translateX(-50%);
                        border-radius: 999px;
                        background: #000000;
                    }
                </style>
            </head>
            <body>
                <main class="stage">
                    ${isMobile ? `
                        <div class="mobile-meta">
                            <span>${safeUrl}</span>
                            <span style="color:#777;">${date} ${time}</span>
                        </div>
                        <section class="phone-wrap">
                            <div class="phone">
                                <div class="phone-screen">
                                    <div class="ios-status">
                                        <span>${time}</span>
                                        <span style="font-size:12px; letter-spacing:.04em;">5G</span>
                                    </div>
                                    <div class="island"></div>
                                    <div class="phone-content">
                                        <img src="data:image/png;base64,${base64}" alt="Evidence capture" />
                                    </div>
                                    <div class="safari">
                                        <div class="safari-pill">
                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V8a5 5 0 0 1 10 0v3"/></svg>
                                            ${safeDomain}
                                        </div>
                                    </div>
                                    <div class="home-indicator"></div>
                                </div>
                            </div>
                        </section>
                    ` : `
                        <section class="desktop-shell">
                            <div class="browser-bar">
                                <div class="traffic"><span></span><span></span><span></span></div>
                                <div class="address">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
                                    ${safeUrl}
                                </div>
                                <div class="browser-meta">${date} ${time}</div>
                            </div>
                            <div class="desktop-content">
                                <img src="data:image/png;base64,${base64}" alt="Evidence capture" />
                            </div>
                        </section>
                    `}
                </main>
            </body>
            </html>
        `;

        await studioPage.setContent(html, { waitUntil: 'domcontentloaded' });
        await abortableDelay(FAST_FRAME_SETTLE_MS, signal);

        const finalBuffer = await Promise.race([
            studioPage.screenshot({ type: 'png', timeout: FAST_SCREENSHOT_TIMEOUT_MS }),
            timeoutPromise
        ]);

        throwIfCaptureAborted(signal)
        return finalBuffer;
    } finally {
        if (compositionTimeout) clearTimeout(compositionTimeout)
        if (closeStudioOnAbort) signal?.removeEventListener('abort', closeStudioOnAbort)
        await studioPage?.close().catch(() => {})
        if (ownsBrowser) await studioBrowser.close();
    }
}

async function compositeStudioImage(
    screenshot: Buffer,
    url: string,
    isMobile: boolean,
    signal?: AbortSignal,
    existingBrowser?: ChromiumBrowser,
): Promise<Buffer> {
    throwIfCaptureAborted(signal)
    const ownsBrowser = !existingBrowser
    const studioBrowser = existingBrowser || await chromium.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-extensions',
            '--disable-background-networking',
            '--disable-sync',
            '--mute-audio',
            '--no-first-run',
        ]
    });
    let closeStudioOnAbort: (() => void) | undefined;
    let studioPage: import('playwright').Page | undefined;
    let compositionTimeout: ReturnType<typeof setTimeout> | undefined;
    
    const timeoutPromise = new Promise<never>((_, reject) => {
        compositionTimeout = setTimeout(() => reject(new Error('Studio Composition Timeout')), FAST_FRAME_TIMEOUT_MS)
    });

    try {
        closeStudioOnAbort = () => studioBrowser.close().catch(() => {})
        signal?.addEventListener('abort', closeStudioOnAbort, { once: true })
        studioPage = await studioBrowser.newPage();
        await studioPage.setViewportSize({ width: 1920, height: 1080 });

        const base64 = screenshot.toString('base64');
        const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
        const date = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });
        const domain = new URL(url).hostname;

        // ===================================
        // UI COMPONENTS (Shared)
        // ===================================

        // Windows 11 Taskbar (Improved Realism - No Weather Text)
        const uniqueId = Math.random().toString(36).substring(7);
        const windowsTaskbar = `
            <div style="position: absolute; bottom: 0; left: 0; width: 100%; height: 48px; background: rgba(243, 243, 243, 0.85); backdrop-filter: blur(20px); border-top: 1px solid rgba(0,0,0,0.1); display: flex; align-items: center; justify-content: center; z-index: 9999; box-sizing: border-box;">
                
                <!-- Left System Data (Hidden Weather) -->
                <div style="position: absolute; left: 16px; display: flex; align-items: center; gap: 8px; opacity: 0.8; min-width: 80px; flex-shrink: 0;">
                     <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style="flex-shrink: 0;"><path d="M17.5 19C19.9853 19 22 16.9853 22 14.5C22 12.132 20.177 10.244 17.812 10.012C17.65 6.648 15.02 4 11.5 4C8.42 4 5.92 6.01 5.3 9.09C2.26 9.61 0 12.18 0 15C0 17.76 2.24 20 5 20H17.5V19Z" fill="url(#cloud_grad_${uniqueId})"/><defs><linearGradient id="cloud_grad_${uniqueId}" x1="0" y1="4" x2="22" y2="20" gradientUnits="userSpaceOnUse"><stop stop-color="#fff"/><stop offset="1" stop-color="#e0e0e0"/></linearGradient></defs></svg>
                     <span style="font-size: 13px; font-weight: 500; color: #444; font-family: 'Segoe UI', system-ui, sans-serif; white-space: nowrap;">24°C</span>
                </div>

                <!-- Centered Apps -->
                <div style="display: flex; gap: 6px; align-items: center; height: 100%; flex-shrink: 0;">
                    <!-- Start Menu -->
                    <div style="width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; border-radius: 4px; transition: background 0.2s; flex-shrink: 0;">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style="flex-shrink: 0;">
                            <path d="M4 4h7v7H4V4z" fill="#0078D4"/>
                            <path d="M13 4h7v7h-7V4z" fill="#1E90FF"/>
                            <path d="M4 13h7v7H4v-7z" fill="#005A9E"/>
                            <path d="M13 13h7v7h-7v-7z" fill="#004C87"/>
                        </svg>
                    </div>

                    <!-- Search (Pill Shape) -->
                    <div style="background: rgba(255,255,255,0.6); height: 32px; padding: 0 12px; border-radius: 16px; display: flex; align-items: center; gap: 8px; min-width: 140px; margin: 0 4px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); flex-shrink: 0;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#444" stroke-width="2.5" stroke-linecap="round" style="flex-shrink: 0;"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/></svg>
                        <span style="font-size: 13px; color: #666; font-family: 'Segoe UI', sans-serif;">Pesquisar</span>
                    </div>

                    <!-- Task View -->
                    <div style="width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; border-radius: 4px; flex-shrink: 0;">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="#555" style="flex-shrink: 0;"><rect x="3" y="3" width="7" height="7" rx="1" opacity="0.6"/><rect x="14" y="3" width="7" height="7" rx="1" opacity="1"/><rect x="3" y="14" width="7" height="7" rx="1" opacity="0.4"/> <rect x="14" y="14" width="7" height="7" rx="1" opacity="0.8"/></svg>
                    </div>
                    
                    <!-- Chat / Teams -->
                    <div style="width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; border-radius: 4px; flex-shrink: 0;">
                         <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style="flex-shrink: 0;"><rect x="2" y="4" width="20" height="14" rx="3" fill="#7B83EB"/><path d="M7 10h10" stroke="#fff" stroke-width="2" stroke-linecap="round"/><path d="M7 14h6" stroke="#fff" stroke-width="2" stroke-linecap="round"/><path d="M12 21l-3-3" stroke="#7B83EB" stroke-width="2"/></svg>
                    </div>

                    <!-- File Explorer -->
                    <div style="width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; border-radius: 4px; flex-shrink: 0;">
                         <svg width="26" height="26" viewBox="0 0 24 24" fill="none" style="flex-shrink: 0;"><path d="M2.5 6C2.5 4.89543 3.39543 4 4.5 4H9.58579C9.851 4 10.1054 4.10536 10.2929 4.29289L12.2071 6.20711C12.3946 6.39464 12.649 6.5 12.9142 6.5H19.5C20.6046 6.5 21.5 7.39543 21.5 8.5V17.5C21.5 18.6046 20.6046 19.5 19.5 19.5H4.5C3.39543 19.5 2.5 18.6046 2.5 17.5V6Z" fill="#FCD53F"/><path d="M10.5 13.5H13.5" stroke="#D3A000" stroke-width="1.5" stroke-linecap="round"/></svg>
                    </div>

                    <!-- Browser (Active) -->
                    <div style="width: 44px; height: 40px; display: flex; align-items: center; justify-content: center; border-radius: 4px; background: rgba(255,255,255,0.4); border-bottom: 3px solid #0078d4; box-shadow: 0 1px 2px rgba(0,0,0,0.05); flex-shrink: 0;">
                         <svg width="24" height="24" viewBox="0 0 24 24" style="flex-shrink: 0;"><path d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0z" fill="#fff"/><path d="M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16z" fill="#4285f4"/><path d="M12 4v8l6.93 4A8 8 0 0 1 12 20a8 8 0 0 1-8-8c0-4.42 3.58-8 8-8z" fill="#2d6fc5"/></svg>
                    </div>
                </div>

                <!-- System Tray -->
                <div style="position: absolute; right: 16px; display: flex; gap: 12px; align-items: center; min-width: 100px; justify-content: flex-end; flex-shrink: 0;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="2" style="flex-shrink: 0;"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                    <div style="display: flex; flex-direction: column; align-items: flex-end; padding: 0 4px; line-height: 1.1; font-family: 'Segoe UI', system-ui, sans-serif; white-space: nowrap;">
                        <span style="font-size: 14px; font-weight: 600; color: #000;">${time}</span>
                        <span style="font-size: 12px; font-weight: 400; color: #000;">${date}</span>
                    </div>
                    <div style="width: 4px; height: 16px; border-left: 1px solid #ccc;"></div>
                </div>
            </div>
        `;

        // Modern Chrome Header (Shared)
        const chromeHeader = `
            <div style="height: 80px; background: #dee1e6; display: flex; flex-direction: column; flex-shrink: 0; box-sizing: border-box;">
                <!-- Tab Region -->
                <div style="height: 38px; display: flex; align-items: flex-end; padding: 0 10px; gap: 6px;">
                    <!-- Active Tab -->
                    <div style="width: 240px; height: 34px; background: #fff; border-radius: 10px 10px 0 0; display: flex; align-items: center; padding: 0 12px; gap: 10px; font-size: 12px; color: #1f1f1f; position: relative; box-shadow: 0 -1px 3px rgba(0,0,0,0.05);">
                        <div style="width: 16px; height: 16px; background: #f1f3f4; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; color: #1a73e8; font-size: 10px;">
                            ${domain.charAt(0).toUpperCase()}
                        </div>
                        <span style="flex: 1; overflow: hidden; white-space: nowrap; font-family: 'Segoe UI', sans-serif;">${domain}</span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity: 0.5;"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </div>
                    <!-- New Tab Icon -->
                    <div style="width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5f6368" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
                    </div>
                </div>

                <!-- Navigation Bar -->
                <div style="height: 42px; background: #fff; display: flex; align-items: center; padding: 0 12px; gap: 12px; border-bottom: 1px solid #e0e0e0;">
                    <div style="display: flex; gap: 14px; color: #5f6368;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="opacity: 0.4;"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M23 4v6h-6M2.05 13a10 10 0 1 1 2.63 5.89"/></svg>
                    </div>

                    <!-- Omnibox -->
                    <div style="flex: 1; background: #f1f3f4; height: 30px; border-radius: 15px; display: flex; align-items: center; padding: 0 16px; gap: 10px; font-size: 13px; color: #202124;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5f6368" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                        <span style="color: #3c4043;">https://${domain}</span>
                    </div>

                    <!-- Profile / Extension -->
                    <div style="width: 26px; height: 26px; background: #efd5ff; border-radius: 50%; color: #a142f4; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: bold;">A</div>
                     <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5f6368" stroke-width="2"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
                </div>
            </div>
        `;

        const mobileFrame = `
            <div style="width: 1920px; height: 1080px; background: #eaeff5; position: relative; overflow: hidden; display: flex; flex-direction: column;">
                <!-- 1. Background Chrome Header (Consistência Desktop no fundo) -->
                ${chromeHeader}
                
                <!-- 2. Main Content Area containing iPhone -->
                <div style="flex: 1; display: flex; align-items: center; justify-content: center; background: radial-gradient(circle at center, #f0f4f8 0%, #dce4eb 100%); overflow: hidden; position: relative;">
                     
                    <!-- iPhone 14 Pro Frame -->
                    <div style="transform: scale(0.85); transform-origin: center center; position: relative; width: 400px; height: 850px; background: #000; border-radius: 56px; box-shadow: 0 30px 80px rgba(0,0,0,0.4); border: 4px solid #333;">
                        
                        <!-- Side Buttons -->
                        <div style="position: absolute; left: -8px; top: 120px; width: 4px; height: 32px; background: #2c2c2e; border-radius: 4px 0 0 4px;"></div>
                        <div style="position: absolute; left: -8px; top: 170px; width: 4px; height: 62px; background: #2c2c2e; border-radius: 4px 0 0 4px;"></div>
                        <div style="position: absolute; right: -8px; top: 160px; width: 4px; height: 96px; background: #2c2c2e; border-radius: 0 4px 4px 0;"></div>

                        <!-- Screen -->
                        <div style="width: 100%; height: 100%; background: #fff; border-radius: 48px; overflow: hidden; display: flex; flex-direction: column; position: relative;">
                            
                            <!-- iOS Status Bar -->
                            <div style="height: 48px; display: flex; align-items: flex-end; justify-content: space-between; padding: 0 24px 10px; font-weight: 600; font-size: 16px; color: #000; z-index: 20; position: absolute; top: 0; width: 100%; box-sizing: border-box;">
                                <span>${time}</span>
                                <div style="display: flex; gap: 6px; align-items: center;">
                                    <svg width="18" height="12" viewBox="0 0 18 12" fill="#000"><path d="M1 11h16V1H1v10zm0 1C.45 12 0 11.55 0 11V1c0-.55.45-1 1-1h16c.55 0 1 .45 1 1v10c0 .55-.45 1-1 1H1z" opacity=".4"/><path d="M1 11h12V3H1v8z"/></svg>
                                    <svg width="22" height="12" viewBox="0 0 24 16" fill="#000"><path d="M12 0L6 0C2.68 0 0 2.68 0 6s2.68 6 6 6h6c3.32 0 6-2.68 6-6s-2.68-6-6-6zm0 10H6c-2.21 0-4-1.79-4-4s1.79-4 4-4h6c2.21 0 4 1.79 4 4s-1.79 4-4 4z"/></svg>
                                    <div style="width: 24px; height: 11px; border: 1px solid #999; border-radius: 3px; position: relative; padding: 1px; display: flex; align-items: center;">
                                        <div style="flex: 1; background: #000; border-radius: 1px;"></div>
                                        <div style="position: absolute; right: -3px; top: 3px; width: 2px; height: 4px; background: #999; border-radius: 0 2px 2px 0;"></div>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Dynamic Island -->
                            <div style="position: absolute; top: 8px; left: 50%; transform: translateX(-50%); width: 110px; height: 32px; background: #000; border-radius: 20px; z-index: 30;"></div>

                            <!-- Capture Content -->
                            <div style="flex: 1; overflow: hidden; background: #fff; padding-top: 48px; padding-bottom: 80px;">
                                <img src="data:image/png;base64,${base64}" style="width:100%; height:100%; object-fit: cover; object-position: top center;" />
                            </div>

                            <!-- iOS Safari Bottom Bar -->
                            <div style="position: absolute; bottom: 0; width: 100%; height: 80px; background: rgba(255,255,255,0.95); backdrop-filter: blur(10px); border-top: 1px solid rgba(0,0,0,0.1); display: flex; flex-direction: column; z-index: 40;">
                                <div style="flex: 1; display: flex; align-items: center; justify-content: center; padding: 0 20px;">
                                    <div style="width: 100%; height: 44px; background: #f2f2f7; border-radius: 12px; display: flex; align-items: center; padding: 0 12px; gap: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
                                        <div style="font-size: 11px; font-weight: 500;">Aa</div>
                                        <div style="flex: 1; text-align: center; font-size: 14px; font-weight: 400; color: #1c1c1e; display: flex; align-items: center; justify-content: center; gap: 4px;">
                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="opacity: 0.4;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                                            ${domain}
                                        </div>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#007aff" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                                    </div>
                                </div>
                                <div style="height: 16px;"></div>
                            </div>
                             <!-- Home Indicator -->
                             <div style="position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%); width: 130px; height: 5px; background: #000; border-radius: 10px; z-index: 60;"></div>
                        </div>
                    </div>
                </div>

                <!-- 3. Windows Taskbar (Requested by user) -->
                ${windowsTaskbar}
            </div>
        `;

        const desktopFrame = `
            <div style="width: 1920px; height: 1080px; background: #eaeff5; position: relative; overflow: hidden; display: flex; flex-direction: column;">
                
                <!-- Browser Window -->
                <div style="flex: 1; margin: 12px; margin-bottom: 60px; background: #fff; border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.15); display: flex; flex-direction: column; overflow: hidden; border: 1px solid #d1d9e6;">
                    
                    ${chromeHeader}

                    <!-- Web Content -->
                    <div style="flex: 1; background: #fff; overflow: hidden; position: relative;">
                        <img src="data:image/png;base64,${base64}" style="width:100%; height:100%; object-fit: cover; object-position: top center;" />
                    </div>
                </div>

                <!-- Windows 11 Taskbar -->
                ${windowsTaskbar}
            </div>
        `;

        const html = `
            <html>
            <body style="margin:0; padding: 0; background: transparent; width: 1920px; height: 1080px; overflow:hidden; font-family: 'Segoe UI', system-ui, sans-serif;">
                ${isMobile ? mobileFrame : desktopFrame}
            </body>
            </html>
                `;

        await studioPage.setViewportSize({ width: 1920, height: 1080 });
        await studioPage.setContent(html, { waitUntil: 'domcontentloaded' });
        await abortableDelay(FAST_FRAME_SETTLE_MS, signal);

        const finalBuffer = await Promise.race([
            studioPage.screenshot({ type: 'png', timeout: FAST_SCREENSHOT_TIMEOUT_MS }),
            timeoutPromise
        ]);

        throwIfCaptureAborted(signal)
        return finalBuffer;
    } finally {
        if (compositionTimeout) clearTimeout(compositionTimeout)
        if (closeStudioOnAbort) signal?.removeEventListener('abort', closeStudioOnAbort)
        await studioPage?.close().catch(() => {})
        if (ownsBrowser) await studioBrowser.close();
    }
}
