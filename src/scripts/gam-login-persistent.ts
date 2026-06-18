import 'dotenv/config'
import path from 'path'
import { chromium } from 'playwright'

const NETWORK_CODE = process.env.GAM_NETWORK_CODE || '123935210'
const LOGIN_TARGET = `https://admanager.google.com/${NETWORK_CODE}`
const USER_DATA_DIR = process.env.GAM_USER_DATA_DIR || path.join(process.cwd(), '.gam-session')

async function main() {
    const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
        headless: process.env.GAM_HEADLESS !== 'false',
        viewport: { width: 1366, height: 768 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        timezoneId: 'America/Sao_Paulo',
        args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-setuid-sandbox'],
    })

    const page = context.pages()[0] || await context.newPage()

    try {
        await page.goto(LOGIN_TARGET, { waitUntil: 'domcontentloaded', timeout: 90000 })
        await page.waitForTimeout(2500)

        if (page.url().includes('accounts.google.com')) {
            const email = page.locator('#identifierId, input[name="identifier"]').first()
            if (await email.isVisible().catch(() => false)) {
                await email.fill(process.env.GAM_USER || '')
                await page.locator('#identifierNext').click()
            }

            const password = page.locator('input[name="Passwd"], input[type="password"]:visible').first()
            if (await password.waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch(() => false)) {
                await password.fill(process.env.GAM_PASS || '')
                await page.locator('#passwordNext').click()
            }

            await page.waitForTimeout(5000)
            const body = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ')
            const number = body.match(/(?:tap|toque em)\s+(\d{1,3})/i)?.[1]

            if (number) console.log(`GAM_VERIFY_NUMBER=${number}`)
            else console.log('GAM_VERIFY_ON_PHONE')

            for (let attempt = 0; attempt < 120 && page.url().includes('accounts.google.com'); attempt++) {
                await page.waitForTimeout(5000)
            }
        }

        if (!page.url().includes(`admanager.google.com/${NETWORK_CODE}`)) {
            throw new Error('A verificacao Google nao foi concluida dentro de 10 minutos.')
        }

        console.log('GAM_SESSION_AUTHENTICATED')
    } finally {
        await context.close()
    }
}

main().catch(error => {
    console.error(`GAM_LOGIN_ERROR=${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
})
