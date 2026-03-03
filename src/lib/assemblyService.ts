import { chromium, devices } from 'playwright'
import prisma from '@/lib/prisma'
import path from 'path'
import fs from 'fs/promises'
import { nexusLogStore } from './nexusLogStore'

// ============================================================================
// ASSEMBLY SERVICE - FOR MANUAL PRINTS WITH CUSTOM TIMESTAMPS
// ============================================================================

export async function processManualCapture(campaignId: string, customDate: string, customTime: string) {
    console.log('[Nexus Assembly] Starting manual capture with custom timestamp...')
    try {
        const settings = await prisma.settings.findUnique({ where: { id: 1 } }) || {
            nexusMaxRetries: 3,
            nexusTimeout: 60000,
            nexusDelay: 3000
        };

        const result = await _executeManualCapture(campaignId, settings, customDate, customTime);
        console.log('[Nexus Assembly] Result:', JSON.stringify(result, null, 2))

        return result;
    } catch (e) {
        console.error('[Nexus Assembly Critical Error]', e);
        return { success: false, error: String(e) };
    }
}

const FIND_BANNER_SCRIPT = `
    ([targetW, targetH]) => {
        const MAX_SIZE_DIFF = 0.10; // 10% strict tolerance
        const candidates = [];
        
        function isVisible(el) {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        }

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
                    score: wDiff + hDiff + (distanceC / window.innerWidth) * 0.1
                });
            }
        });

        candidates.sort((a, b) => a.score - b.score);
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

async function _executeManualCapture(campaignId: string, settings: any, customDate: string, customTime: string): Promise<{ success: boolean; filePath?: string; error?: string }> {
    const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { url: true, format: true, device: true, client: true, agency: true }
    });

    if (!campaign) throw new Error('Campanha não encontrada');

    let bannerConfig = null;
    let targetW = 0;
    let targetH = 0;

    try {
        const formats = JSON.parse(settings.bannerFormats || '[]');
        bannerConfig = formats.find((f: any) => f.id === campaign.format);

        if (bannerConfig) {
            targetW = bannerConfig.width;
            targetH = bannerConfig.height;
        } else {
            const dims = campaign.format.toLowerCase().split('x').map(Number);
            targetW = dims[0];
            targetH = dims[1];
        }
    } catch (e) {
        const dims = campaign.format.toLowerCase().split('x').map(Number);
        targetW = dims[0];
        targetH = dims[1];
    }

    if (!targetW || !targetH) throw new Error('Formato inválido: ' + campaign.format);

    let browser;
    try {
        const isMobile = campaign.device === 'mobile';
        browser = await chromium.launch({ headless: true });

        const context = await browser.newContext(isMobile ? {
            ...devices['iPhone 13'],
            viewport: { width: 390, height: 722 },
        } : {
            viewport: { width: 1920, height: 928 },
        });

        const page = await context.newPage();

        try {
            await page.goto(campaign.url, {
                waitUntil: 'domcontentloaded',
                timeout: settings.nexusTimeout
            });
        } catch (navError) {
            console.log('[Nexus Assembly] Navigation timeout (ignored).');
        }

        // WARM-UP Scroll
        // Sempre realiza o scroll para mobile para garantir o carregamento de banners lazy-load
        if (isMobile) {
            await page.evaluate(async () => {
                return new Promise<void>((resolve) => {
                    let totalHeight = 0;
                    const distance = 300;
                    const timer = setInterval(() => {
                        const scrollHeight = document.body.scrollHeight;
                        window.scrollBy(0, distance);
                        totalHeight += distance;
                        if (totalHeight >= scrollHeight || totalHeight > 4000) {
                            clearInterval(timer);
                            window.scrollTo(0, 0);
                            resolve();
                        }
                    }, 50);
                });
            });
            await page.waitForTimeout(8000);
        } else {
            await page.waitForTimeout(5000);
        }

        // Strategy 1: Selector
        let finalScreenshotBuffer: Buffer | null = null;

        if (bannerConfig && bannerConfig.selector) {
            try {
                const locator = page.locator(bannerConfig.selector).first();
                await locator.waitFor({ state: 'attached', timeout: 15000 });
                if (!await locator.isVisible()) {
                    await locator.scrollIntoViewIfNeeded();
                    await page.waitForTimeout(3000);
                }
                const box = await locator.boundingBox();
                if (box && box.width > 0 && box.height > 0) {
                    const viewportHeight = isMobile ? 722 : 928;
                    const targetScrollY = Math.max(0, box.y + (box.height / 2) - (viewportHeight / 2));
                    await page.evaluate((y) => window.scrollTo(0, y), targetScrollY);
                    await page.waitForTimeout(5000);
                    finalScreenshotBuffer = await page.screenshot({ type: 'png' });
                }
            } catch (err) {
                console.warn('[Assembly] Selector strategy failed, falling back to auto-detection');
            }
        }

        // Strategy 2: Auto-Detection
        if (!finalScreenshotBuffer) {
            const candidates = await page.evaluate<any>(eval(FIND_BANNER_SCRIPT), [targetW, targetH]);
            if (candidates && candidates.length > 0) {
                let bestCandidate = null;
                for (const candidate of candidates) {
                    await page.evaluate((y) => window.scrollTo(0, y), Math.max(0, candidate.y - 300));
                    await page.waitForTimeout(3000);

                    const clip = { x: candidate.x, y: candidate.y, width: candidate.width, height: candidate.height };
                    const bannerBuffer = await page.screenshot({ clip });
                    if (bannerBuffer.length / 1024 >= 0.5) {
                        bestCandidate = candidate;
                        break;
                    }
                }

                if (bestCandidate) {
                    const viewportHeight = isMobile ? 722 : 928;
                    const targetScrollY = Math.max(0, bestCandidate.y + (bestCandidate.height / 2) - (viewportHeight / 2));
                    await page.evaluate((y) => window.scrollTo(0, y), targetScrollY);
                    await page.waitForTimeout(6000);
                    finalScreenshotBuffer = await page.screenshot({ type: 'png' });
                }
            }
        }

        if (!finalScreenshotBuffer) {
            finalScreenshotBuffer = await page.screenshot({ type: 'png' });
        }

        await browser.close();

        const finalImage = await compositeAssemblyImage(finalScreenshotBuffer, campaign.url, isMobile, customDate, customTime);
        return await saveAssemblyCapture(campaign, finalImage, campaignId);

    } catch (err) {
        if (browser) await browser.close();
        console.error('[Assembly Capture Error]', err);
        return { success: false, error: String(err) };
    }
}

async function saveAssemblyCapture(campaign: any, imageBuffer: Buffer, campaignId: string) {
    const filename = `${campaign.format}_assembly_${Date.now()}.png`;
    const safeAgency = (campaign.agency || 'Unknown').replace(/\W/g, '_');
    const safeClient = (campaign.client || 'Unknown').replace(/\W/g, '_');

    const folder = path.join(process.cwd(), 'Comprovantes', safeAgency, safeClient);

    await fs.mkdir(folder, { recursive: true });
    const filePath = path.join(folder, filename);
    await fs.writeFile(filePath, imageBuffer);

    await prisma.$transaction([
        prisma.capture.create({
            data: {
                campaignId,
                screenshotPath: filePath,
                status: 'SUCCESS'
            }
        }),
        prisma.campaign.update({
            where: { id: campaignId },
            data: {
                status: 'SUCCESS',
                lastCaptureAt: new Date()
            }
        })
    ]);

    nexusLogStore.addLog(`Nexus: Montagem concluída - ${campaign.client} `, 'SUCCESS');
    return { success: true, filePath };
}

async function compositeAssemblyImage(screenshot: Buffer, url: string, isMobile: boolean, customDate: string, customTime: string): Promise<Buffer> {
    const studioBrowser = await chromium.launch({ headless: true });
    try {
        const studioPage = await studioBrowser.newPage();
        await studioPage.setViewportSize({ width: 1920, height: 1080 });

        const base64 = screenshot.toString('base64');
        const time = customTime;
        const date = customDate;
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
                        <span style="font-size: 12px; font-weight: 500; color: #000;">${date}</span>
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
                                <img src="data:image/png;base64,${base64}" style="width:100%; height:100%; object-fit: cover; object-position: center;" />
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
                        <img src="data:image/png;base64,${base64}" style="width:100%; height:100%; object-fit: cover; object-position: center;" />
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

        await studioPage.setContent(html);
        await studioPage.waitForTimeout(500);

        const finalBuffer = await studioPage.screenshot({ type: 'png' });
        return finalBuffer;
    } finally {
        await studioBrowser.close();
    }
}
