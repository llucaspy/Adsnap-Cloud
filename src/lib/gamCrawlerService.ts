import { chromium, BrowserContext, Page } from 'playwright';
import path from 'path';

export interface GamLineItem {
    id: string;
    name: string;
    formats: string[];
    previewLinks: { format: string; url: string }[];
}

export interface GamOrderData {
    orderId: string;
    clientName: string;
    agencyName: string;
    lineItems: GamLineItem[];
}

export class GamCrawlerService {
    private userDataDir = path.join(process.cwd(), '.gam-session');
    
    async startIngestion(orderUrl: string): Promise<GamOrderData> {
        console.log(`[Nexus GAM] Iniciando ingestão para: ${orderUrl}`);
        
        const browser = await chromium.launchPersistentContext(this.userDataDir, {
            headless: true,
            viewport: { width: 1280, height: 720 }
        });

        const page = await browser.newPage();
        
        try {
            // 1. Login Flow
            await this.ensureLogin(page);
            
            // 2. Navigate to Order
            await page.goto(orderUrl, { waitUntil: 'networkidle' });
            
            // 3. Extract Order Metadata (Client, Agency)
            const clientName = await page.locator('span[data-testid="order-advertiser-name"]').first().innerText().catch(() => 'Cliente Desconhecido');
            const agencyName = await page.locator('span[data-testid="order-agency-name"]').first().innerText().catch(() => 'Agência Desconhecida');
            const orderId = orderUrl.split('order_id=')[1]?.split('&')[0] || 'Unknown';

            // 4. Discover Line Items
            const lineItemLinks = await page.locator('a[href*="#delivery/line item/"]').all();
            const discoveredItems: GamLineItem[] = [];

            console.log(`[Nexus GAM] Encontrados ${lineItemLinks.length} possíveis itens de linha.`);

            for (const link of lineItemLinks) {
                const href = await link.getAttribute('href') || '';
                const id = href.split('line_item_id=')[1]?.split('&')[0];
                const name = await link.innerText();

                if (id && !discoveredItems.find(i => i.id === id)) {
                    discoveredItems.push({ id, name, formats: [], previewLinks: [] });
                }
            }

            // 5. Process Each Line Item (Deep Scrape)
            for (const item of discoveredItems) {
                await this.processLineItem(page, item);
            }

            return {
                orderId,
                clientName,
                agencyName,
                lineItems: discoveredItems
            };

        } finally {
            await browser.close();
        }
    }

    private async ensureLogin(page: Page) {
        await page.goto('https://admanager.google.com/home');
        
        // Verifica se já está logado
        if (page.url().includes('signin/identifier') || page.url().includes('accounts.google.com')) {
            console.log('[Nexus GAM] Sessão não encontrada. Realizando login...');
            
            await page.fill('input[type="email"]', process.env.GAM_USER || '');
            await page.click('#identifierNext');
            await page.waitForTimeout(2000);
            
            await page.fill('input[type="password"]', process.env.GAM_PASS || '');
            await page.click('#passwordNext');
            
            // Aguarda redirecionamento ou desafio
            await page.waitForTimeout(5000);
            
            if (page.url().includes('challenge')) {
                throw new Error('DESAFIO_BFA_DETECTADO: Por favor, realize o login manual no servidor uma vez.');
            }
        } else {
            console.log('[Nexus GAM] Sessão persistente ativa.');
        }
    }

    private async processLineItem(page: Page, item: GamLineItem) {
        const url = `https://admanager.google.com/${process.env.GAM_NETWORK_CODE}#delivery/line%20item/line_item_overview/line_item_id=${item.id}`;
        console.log(`[Nexus GAM] Processando Line Item: ${item.name} (${item.id})`);
        
        await page.goto(url, { waitUntil: 'networkidle' });
        
        // Clica na aba de Criativos
        await page.click('div[role="tab"]:has-text("Criativos")');
        await page.waitForTimeout(2000);

        // Pega o primeiro criativo ativo para gerar o preview
        const firstCreative = page.locator('a[href*="creative_id="]').first();
        if (await firstCreative.count() > 0) {
            await firstCreative.click();
            await page.waitForTimeout(2000);
            
            // Vai para a aba Visualizar
            await page.click('div[role="tab"]:has-text("Visualizar")');
            await page.waitForTimeout(2000);
            
            // Seleciona "No site"
            await page.click('div:has-text("No site")');
            await page.waitForTimeout(1000);
            
            // Insira metropoles.com
            const urlInput = page.locator('input[placeholder*="site"]');
            await urlInput.fill('metropoles.com');
            await page.click('button:has-text("Mostrar URL")');
            await page.waitForTimeout(2000);
            
            // Captura a URL final
            const previewUrl = await page.locator('input[readonly]').inputValue();
            item.previewLinks.push({ format: "DETECTED", url: previewUrl });
            
            console.log(`[Nexus GAM] Link de Preview gerado para ${item.name}`);
        }
    }
}

export const gamCrawler = new GamCrawlerService();
