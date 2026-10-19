import Link from 'next/link'
import prisma from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { describeCaptureFailure } from '@/lib/captureFailure'
import { getFormatLabelMap, resolveFormatLabel } from '@/lib/formatLabels'
import type { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'
const clock = (value: Date | null) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(value) : 'Horário não registrado'

export default async function QuarantinePage({ searchParams }: { searchParams: Promise<{ q?: string; scope?: string; page?: string }> }) {
    await requireAuth()
    const params = await searchParams
    const q = (params.q || '').trim().slice(0, 120)
    const history = params.scope === 'history'
    const page = Math.max(1, Math.min(10000, Number.parseInt(params.page || '1', 10) || 1))
    const campaign: Prisma.CampaignWhereInput = { isArchived: false,
        ...(!history ? { status: { in: ['FAILED', 'QUARANTINE'] } } : {}),
        ...(q ? { OR: ['client', 'pi', 'campaignName'].map(field => ({ [field]: { contains: q, mode: 'insensitive' } })) } : {}) }
    const where: Prisma.WorkerJobWhereInput = { type: 'CAPTURE', status: 'FAILED', campaign: { is: campaign } }
    const [jobs, count, legacy, labels] = await Promise.all([
        prisma.workerJob.findMany({ where, include: { campaign: true }, orderBy: [{ finishedAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * 30, take: 30 }),
        prisma.workerJob.count({ where }),
        prisma.campaign.findMany({ where: { ...campaign, status: { in: ['FAILED', 'QUARANTINE'] }, workerJobs: { none: { type: 'CAPTURE' } } }, take: 20, orderBy: { updatedAt: 'desc' } }),
        getFormatLabelMap(),
    ])
    const href = (next: number) => `/quarantine?${new URLSearchParams({ q, scope: history ? 'history' : 'pending', page: String(next) })}`
    return <div className="mx-auto max-w-6xl space-y-7 text-neutral-100">
        <header className="pt-14 lg:pt-0"><p className="text-xs tracking-widest text-neutral-400">REVISÃO DE CAPTURAS</p><h1 className="mt-3 text-3xl font-semibold">Quarentena e falhas</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-400">Analise cada tarefa que terminou com erro. Quarentena indica uma falha classificada como não recuperável; as demais esgotaram as tentativas ou foram interrompidas. Horários de Brasília.</p></header>
        <form className="flex flex-wrap items-end gap-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
            <label className="flex-1 text-sm">Cliente, PI ou campanha<input name="q" defaultValue={q} maxLength={120} className="mt-2 block w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2" /></label>
            <label className="text-sm">Exibir<select name="scope" defaultValue={history ? 'history' : 'pending'} className="mt-2 block rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2"><option value="pending">Campanhas com pendências</option><option value="history">Histórico de falhas</option></select></label>
            <button className="rounded-lg bg-white px-5 py-2 text-sm font-semibold text-black">Filtrar</button>
            <Link href="/workers" className="px-2 py-2 text-sm underline">Ver workers</Link>
        </form>
        <p className="text-sm text-neutral-400">{count} ocorrência(s) encontrada(s). Cada cartão representa uma tarefa; tentativas da mesma tarefa ficam no diagnóstico.</p>
        {jobs.length === 0 && <p className="rounded-2xl border border-dashed border-neutral-700 p-10 text-center text-neutral-400">Nenhuma ocorrência encontrada neste filtro.</p>}
        <div className="grid gap-4 md:grid-cols-2">
            {jobs.map(job => {
                const item = job.campaign!
                const failure = describeCaptureFailure(job.lastError)
                return <article key={job.id} className="flex flex-col gap-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
                    <p className="text-xs text-amber-300">{item.status === 'QUARANTINE' ? 'Campanha em quarentena' : `Campanha: ${item.status}`} · {clock(job.finishedAt)}</p>
                    <h2 className="text-lg font-semibold">{item.client} · PI {item.pi}</h2>
                    <p className="text-sm text-neutral-400">{item.campaignName} · {resolveFormatLabel(labels, item.format)} · {item.device}</p>
                    <p className="text-sm">{failure.category} · {job.attempts}/{job.maxAttempts} tentativas</p>
                    <p className="line-clamp-3 break-words text-sm leading-6 text-red-200">{failure.reason}</p>
                    <Link href={`/quarantine/${encodeURIComponent(job.id)}`} className="mt-auto pt-3 text-sm font-semibold underline">Analisar esta captura →</Link>
                </article>
            })}
        </div>
        {count > 30 && <nav aria-label="Paginação" className="flex gap-5 text-sm">{page > 1 && <Link href={href(page - 1)}>← Anterior</Link>}<span>Página {page}</span>{page * 30 < count && <Link href={href(page + 1)}>Próxima →</Link>}</nav>}
        {legacy.length > 0 && <section className="space-y-3"><h2 className="text-xl font-semibold">Pendências antigas</h2><p className="text-sm text-neutral-400">Até 20 campanhas sem registro de tarefa. O histórico antigo pode não separar as tentativas.</p>{legacy.map(item => <Link key={item.id} href={`/workers/campaigns/${item.id}`} className="block rounded-xl border border-neutral-800 p-4 text-sm underline">{item.client} · PI {item.pi} · {item.format} · {item.status}</Link>)}</section>}
    </div>
}
