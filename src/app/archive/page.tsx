import prisma from '@/lib/prisma'
import { archiveCampaign, deleteCampaign } from '@/app/actions'
import { RotateCcw, Trash2, History, Clock } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export default async function ArchivePage() {
    const campaigns = await prisma.campaign.findMany({
        where: { isArchived: true },
        orderBy: { updatedAt: 'desc' },
        include: { captures: { take: 5, orderBy: { createdAt: 'desc' } } }
    })

    return (
        <div className="space-y-12 animate-slide-up">
            <header className="relative">
                <div
                    className="absolute -top-20 -left-20 w-80 h-80 rounded-full blur-3xl opacity-20 pointer-events-none"
                    style={{ background: 'var(--secondary)' }}
                />

                <div className="relative flex items-center gap-4">
                    <div
                        className="w-14 h-14 rounded-2xl flex items-center justify-center"
                        style={{
                            background: 'var(--secondary-muted)',
                            color: 'var(--secondary)'
                        }}
                    >
                        <History size={28} />
                    </div>
                    <div>
                        <h1
                            className="text-4xl font-extrabold tracking-tight"
                            style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
                        >
                            Arquivados
                        </h1>
                        <p style={{ color: 'var(--text-secondary)' }}>
                            Histórico de campanhas finalizadas.
                        </p>
                    </div>
                </div>
            </header>

            <div className="grid grid-cols-1 gap-4">
                {campaigns.map((c) => (
                    <div
                        key={c.id}
                        className="p-6 rounded-2xl flex items-center justify-between transition-all duration-300 hover:-translate-y-1 group relative overflow-hidden"
                        style={{
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border)'
                        }}
                    >
                        {/* Hover effect */}
                        <div
                            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                            style={{ background: 'var(--gradient-glow)' }}
                        />

                        <div className="flex-1 min-w-0 relative z-10">
                            <div className="flex items-center gap-3 mb-2">
                                <span
                                    className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg"
                                    style={{
                                        background: 'var(--bg-tertiary)',
                                        color: 'var(--text-muted)'
                                    }}
                                >
                                    {c.agency}
                                </span>
                                <h3
                                    className="text-lg font-bold truncate"
                                    style={{
                                        color: 'var(--text-primary)',
                                        fontFamily: 'var(--font-display)'
                                    }}
                                >
                                    {c.client}
                                </h3>
                            </div>
                            <div
                                className="flex items-center gap-3 text-xs font-medium"
                                style={{ color: 'var(--text-muted)' }}
                            >
                                <span>{c.format}</span>
                                <span style={{ color: 'var(--border)' }}>•</span>
                                <span>{c.captures.length} capturas</span>
                                <span style={{ color: 'var(--border)' }}>•</span>
                                <span className="flex items-center gap-1.5">
                                    <Clock size={12} />
                                    Arquivada há {formatDistanceToNow(new Date(c.updatedAt), { locale: ptBR })}
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 relative z-10">
                            <form action={async () => {
                                'use server'
                                await archiveCampaign(c.id, false)
                            }}>
                                <button
                                    className="flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-bold transition-all"
                                    style={{
                                        background: 'var(--accent-muted)',
                                        color: 'var(--accent-light)'
                                    }}
                                >
                                    <RotateCcw size={14} />
                                    Restaurar
                                </button>
                            </form>
                            <form action={async () => {
                                'use server'
                                await deleteCampaign(c.id)
                            }}>
                                <button
                                    className="p-3 rounded-xl transition-all"
                                    style={{ color: 'var(--text-muted)' }}
                                    title="Excluir Permanentemente"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </form>
                        </div>
                    </div>
                ))}
                {campaigns.length === 0 && (
                    <div
                        className="py-24 text-center rounded-2xl"
                        style={{
                            border: '2px dashed var(--border)',
                            color: 'var(--text-muted)'
                        }}
                    >
                        <History size={64} className="mx-auto mb-6 opacity-20" />
                        <h2
                            className="text-2xl font-bold mb-2"
                            style={{ fontFamily: 'var(--font-display)' }}
                        >
                            Vazio
                        </h2>
                        <p className="font-medium opacity-60">Nenhuma campanha arquivada.</p>
                    </div>
                )}
            </div>
        </div>
    )
}
