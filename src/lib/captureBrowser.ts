import { chromium, type LaunchOptions } from 'playwright'
import { CaptureEgressProxy } from './captureNetwork'

/** Only OS/runtime configuration is inherited; DB, storage and API credentials stay in the worker. */
export function captureBrowserEnvironment() {
    const allowed = new Set(['PATH', 'HOME', 'USERPROFILE', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP',
        'TMPDIR', 'LANG', 'LC_ALL', 'DISPLAY', 'XDG_RUNTIME_DIR', 'FONTCONFIG_PATH', 'FONTCONFIG_FILE'])
    return Object.fromEntries(Object.entries(process.env).filter(([key, value]) => allowed.has(key.toUpperCase()) && value !== undefined)) as Record<string, string>
}

export async function launchCaptureBrowser(options: LaunchOptions = {}) {
    const proxy = new CaptureEgressProxy()
    const server = await proxy.start()
    try {
        const browser = await chromium.launch({
            ...options,
            chromiumSandbox: true,
            env: captureBrowserEnvironment(),
            proxy: { server, bypass: '<-loopback>' },
            args: [...(options.args || []).filter(arg => !['--no-sandbox', '--disable-setuid-sandbox'].includes(arg)),
                '--disable-quic', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp'],
        })
        browser.once('disconnected', () => { void proxy.close() })
        return browser
    } catch (error) {
        await proxy.close()
        throw error
    }
}
