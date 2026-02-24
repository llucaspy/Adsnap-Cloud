import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
    const targets = [
        'https://www.google.com',
        'https://cloudflare.com',
    ]

    const results: number[] = []

    for (const url of targets) {
        try {
            const start = Date.now()
            await fetch(url, {
                method: 'HEAD',
                signal: AbortSignal.timeout(5000),
                cache: 'no-store',
            })
            results.push(Date.now() - start)
        } catch {
            results.push(9999) // timeout / unreachable
        }
    }

    const avg = results.reduce((a, b) => a + b, 0) / results.length
    const hasFailure = results.some(r => r >= 9999)

    let status: 'stable' | 'slow' | 'unstable'
    let label: string
    let latency = Math.round(avg)

    if (hasFailure || avg > 3000) {
        status = 'unstable'
        label = 'Instável'
    } else if (avg > 800) {
        status = 'slow'
        label = 'Lenta'
    } else {
        status = 'stable'
        label = 'Estável'
    }

    return NextResponse.json({ status, label, latency })
}
