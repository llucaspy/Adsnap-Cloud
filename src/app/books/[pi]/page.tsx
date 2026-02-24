import prisma from '@/lib/prisma'
import fs from 'fs'
import { ArrowLeft, Download } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BookCampaignList } from '@/components/BookCampaignList'

export default async function PiDetailPage({ params }: { params: Promise<{ pi: string }> }) {
    const { pi } = await params

    const [campaigns, settings] = await Promise.all([
        prisma.campaign.findMany({
            where: { pi },
            include: {
                captures: {
                    orderBy: { createdAt: 'desc' }
                }
            },
            orderBy: { createdAt: 'desc' },
        }),
        prisma.settings.findFirst()
    ])

    // Load format settings for label lookup
    const bannerFormats = (settings as any)?.bannerFormats
    const formats = bannerFormats ? JSON.parse(bannerFormats) : []

    // Process campaigns: filter existing files AND resolve format labels
    const processedCampaigns = campaigns.map(campaign => {
        // 1. Resolve Format Label
        const foundFormat = formats.find((f: any) =>
            f.id?.trim().toLowerCase() === campaign.format?.trim().toLowerCase()
        )
        const formatLabel = foundFormat
            ? foundFormat.label
            : (campaign.format?.includes('x') ? campaign.format : 'Formato Indefinido')

        // 2. Filter Captures (Handle Cloud Storage URLs)
        const validCaptures = campaign.captures.filter(c => {
            if (!c.screenshotPath) return false;

            // If it's a URL (Supabase), it's valid for the frontend
            if (c.screenshotPath.startsWith('http')) return true;

            // If it's a local path, check if it exists
            try {
                return fs.existsSync(c.screenshotPath)
            } catch {
                return false
            }
        })

        return {
            ...campaign,
            formatLabel,
            captures: validCaptures
        }
    })

    if (processedCampaigns.length === 0) {
        notFound()
    }

    const client = processedCampaigns[0].client
    const agency = processedCampaigns[0].agency

    return (
        <div className="space-y-12 animate-slide-up">
            <header className="relative">
                {/* Background glow */}
                <div
                    className="absolute -top-32 -left-32 w-[600px] h-[600px] rounded-full blur-[120px] opacity-20 pointer-events-none"
                    style={{ background: 'var(--gradient-primary)' }}
                />

                <div className="relative flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div>
                        <Link
                            href="/books"
                            className="flex items-center gap-2 mb-6 text-sm font-medium transition-colors hover:text-white"
                            style={{ color: 'var(--text-muted)' }}
                        >
                            <ArrowLeft size={16} />
                            Voltar para Books
                        </Link>
                        <div className="flex items-center gap-3 mb-4">
                            <span
                                className="text-[10px] font-bold uppercase tracking-[0.2em] px-4 py-2 rounded-lg backdrop-blur-md"
                                style={{
                                    background: 'rgba(168, 85, 247, 0.1)',
                                    color: 'var(--accent-light)',
                                    border: '1px solid rgba(168, 85, 247, 0.2)'
                                }}
                            >
                                PI {pi}
                            </span>
                        </div>
                        <h1
                            className="text-5xl md:text-7xl font-black tracking-tighter mb-2"
                            style={{ fontFamily: 'var(--font-display)' }}
                        >
                            <span className="text-white">{client}</span>
                        </h1>
                        <p
                            className="text-xl font-medium flex items-center gap-2"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            {agency}
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)] opacity-50" />
                            <span className="text-[var(--text-muted)]">{processedCampaigns.length} formatos</span>
                        </p>
                    </div>

                    <button
                        className="flex items-center gap-3 px-8 py-4 rounded-xl font-bold transition-all group text-white hover:scale-105 active:scale-95"
                        style={{
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border)',
                        }}
                    >
                        <Download size={20} className="group-hover:text-[var(--accent)] transition-colors" />
                        Exportar Relatório PDF
                    </button>
                </div>
            </header>

            <BookCampaignList campaigns={processedCampaigns} />
        </div>
    )
}
