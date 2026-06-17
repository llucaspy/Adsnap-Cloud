'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, CalendarDays, Database, Loader2, Trash2 } from 'lucide-react'

type CleanupPreview = {
    startDate: string
    endDate: string
    captureCount: number
    storageFileCount: number
    localFileCount: number
    campaignCount: number
    campaigns: {
        pi: string
        client: string
        count: number
    }[]
}

type CleanupResult = {
    deletedCaptures: number
    deletedStorageFiles: number
    failedStorageFiles: number
    deletedLocalFiles: number
    processedCaptures?: number
    remainingCaptures?: number
    hasMore?: boolean
    message?: string
}

function getTodayKey() {
    return new Date().toISOString().slice(0, 10)
}

function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Erro ao processar manutencao'
}

export function AdminPrintCleanup() {
    const [startDate, setStartDate] = useState(getTodayKey())
    const [endDate, setEndDate] = useState(getTodayKey())
    const [confirmation, setConfirmation] = useState('')
    const [preview, setPreview] = useState<CleanupPreview | null>(null)
    const [result, setResult] = useState<CleanupResult | null>(null)
    const [errorMessage, setErrorMessage] = useState('')
    const [isPreviewing, setIsPreviewing] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [cleanupTotal, setCleanupTotal] = useState(0)

    const validationMessage = useMemo(() => {
        if (!startDate || !endDate) return 'Selecione as duas datas'
        if (startDate > endDate) return 'A data inicial nao pode ser maior que a final'
        return ''
    }, [endDate, startDate])

    const resetPreview = () => {
        setPreview(null)
        setResult(null)
        setConfirmation('')
        setErrorMessage('')
        setCleanupTotal(0)
    }

    const handlePreview = async () => {
        if (validationMessage) return

        setIsPreviewing(true)
        setErrorMessage('')
        setResult(null)
        setConfirmation('')

        try {
            const params = new URLSearchParams({ startDate, endDate })
            const response = await fetch(`/api/admin/prints/cleanup?${params.toString()}`, {
                cache: 'no-store'
            })
            const data = await response.json() as CleanupPreview | { error?: string }

            if (!response.ok) {
                throw new Error('error' in data && data.error ? data.error : 'Erro ao analisar periodo')
            }

            setPreview(data as CleanupPreview)
        } catch (error) {
            setPreview(null)
            setErrorMessage(getErrorMessage(error))
        } finally {
            setIsPreviewing(false)
        }
    }

    const handleDelete = async () => {
        if (!preview || confirmation !== 'APAGAR' || preview.captureCount === 0) return

        setIsDeleting(true)
        setErrorMessage('')
        setCleanupTotal(preview.captureCount)

        const aggregate: CleanupResult = {
            deletedCaptures: 0,
            deletedStorageFiles: 0,
            failedStorageFiles: 0,
            deletedLocalFiles: 0,
            processedCaptures: 0,
            remainingCaptures: preview.captureCount,
            hasMore: true
        }
        setResult(aggregate)

        try {
            let hasMore = true

            while (hasMore) {
                const response = await fetch('/api/admin/prints/cleanup', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        startDate,
                        endDate,
                        confirmation
                    })
                })
                const data = await response.json() as CleanupResult | { error?: string }

                if (!response.ok) {
                    throw new Error('error' in data && data.error ? data.error : 'Erro ao apagar prints')
                }

                const batch = data as CleanupResult
                aggregate.deletedCaptures += batch.deletedCaptures
                aggregate.deletedStorageFiles += batch.deletedStorageFiles
                aggregate.failedStorageFiles += batch.failedStorageFiles
                aggregate.deletedLocalFiles += batch.deletedLocalFiles
                aggregate.processedCaptures = (aggregate.processedCaptures ?? 0) + (batch.processedCaptures ?? batch.deletedCaptures)
                aggregate.remainingCaptures = batch.remainingCaptures ?? 0
                aggregate.hasMore = Boolean(batch.hasMore)

                setResult({ ...aggregate })
                setPreview((current) => current
                    ? {
                        ...current,
                        captureCount: batch.remainingCaptures ?? 0,
                        storageFileCount: Math.max(0, current.storageFileCount - batch.deletedStorageFiles),
                        localFileCount: Math.max(0, current.localFileCount - batch.deletedLocalFiles)
                    }
                    : current
                )

                hasMore = Boolean(batch.hasMore)
            }

            setPreview(null)
            setConfirmation('')
        } catch (error) {
            setErrorMessage(getErrorMessage(error))
        } finally {
            setIsDeleting(false)
        }
    }

    const canDelete = Boolean(preview && preview.captureCount > 0 && confirmation === 'APAGAR' && !isDeleting)
    const cleanupProgress = cleanupTotal > 0 && result?.remainingCaptures !== undefined
        ? Math.round(((cleanupTotal - result.remainingCaptures) / cleanupTotal) * 100)
        : 0

    return (
        <section className="rounded-[12px] border border-white/8 bg-white/[0.04] p-5 md:p-6 shadow-[rgba(0,0,0,0.30)_0px_8px_24px_0px] backdrop-blur-[16px]">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                <div className="max-w-2xl">
                    <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-[8px] border border-white/8 bg-[#f59e0b1a] text-[#f59e0b]">
                        <Database size={19} />
                    </div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-white/30">
                        Manutencao de storage
                    </p>
                    <h2 className="mt-2 text-[22px] font-semibold leading-[1.3] text-white">
                        Remover prints por periodo
                    </h2>
                    <p className="mt-3 max-w-xl text-[14px] leading-[1.55] text-white/45">
                        Apaga os arquivos do bucket Supabase e remove os registros de captura no banco. Use para liberar espaco depois que os books antigos nao forem mais necessarios.
                    </p>
                </div>

                <div className="grid w-full gap-3 xl:max-w-2xl xl:grid-cols-[1fr_1fr_auto] xl:items-end">
                    <label className="grid gap-2">
                        <span className="text-[13px] font-semibold uppercase tracking-[0.18em] text-white/35">
                            De
                        </span>
                        <input
                            type="date"
                            value={startDate}
                            disabled={isDeleting}
                            onChange={(event) => {
                                setStartDate(event.target.value)
                                resetPreview()
                            }}
                            className="h-11 rounded-[8px] border border-white/16 bg-white/[0.04] px-3 text-[14px] font-medium text-[#e5e5e5] outline-none transition-colors focus:border-[#7c3aed] disabled:cursor-not-allowed disabled:opacity-50"
                        />
                    </label>

                    <label className="grid gap-2">
                        <span className="text-[13px] font-semibold uppercase tracking-[0.18em] text-white/35">
                            Ate
                        </span>
                        <input
                            type="date"
                            value={endDate}
                            disabled={isDeleting}
                            onChange={(event) => {
                                setEndDate(event.target.value)
                                resetPreview()
                            }}
                            className="h-11 rounded-[8px] border border-white/16 bg-white/[0.04] px-3 text-[14px] font-medium text-[#e5e5e5] outline-none transition-colors focus:border-[#7c3aed] disabled:cursor-not-allowed disabled:opacity-50"
                        />
                    </label>

                    <button
                        type="button"
                        onClick={handlePreview}
                        disabled={Boolean(validationMessage) || isPreviewing || isDeleting}
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-[8px] border border-white/16 bg-white/[0.04] px-5 text-[14px] font-medium text-white/70 transition-all hover:-translate-y-px hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        {isPreviewing ? <Loader2 size={16} className="animate-spin" /> : <CalendarDays size={16} />}
                        Analisar
                    </button>
                </div>
            </div>

            {(validationMessage || errorMessage) && (
                <div className="mt-5 flex items-center gap-2 rounded-[8px] border border-[#f59e0b]/20 bg-[rgba(245,158,11,0.10)] px-4 py-3 text-[13px] font-medium text-[#f59e0b]">
                    <AlertTriangle size={15} />
                    {errorMessage || validationMessage}
                </div>
            )}

            {preview && (
                <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1.15fr]">
                    <div className="rounded-[12px] border border-white/8 bg-[#141414] p-4">
                        <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-white/30">
                            Impacto estimado
                        </p>
                        <div className="mt-4 grid grid-cols-2 gap-3">
                            <div className="rounded-[8px] border border-white/8 bg-white/[0.03] p-3">
                                <p className="text-[24px] font-semibold leading-none text-white">{preview.captureCount}</p>
                                <p className="mt-1 text-[12px] text-white/35">prints no banco</p>
                            </div>
                            <div className="rounded-[8px] border border-white/8 bg-white/[0.03] p-3">
                                <p className="text-[24px] font-semibold leading-none text-white">{preview.storageFileCount}</p>
                                <p className="mt-1 text-[12px] text-white/35">arquivos Supabase</p>
                            </div>
                            <div className="rounded-[8px] border border-white/8 bg-white/[0.03] p-3">
                                <p className="text-[24px] font-semibold leading-none text-white">{preview.campaignCount}</p>
                                <p className="mt-1 text-[12px] text-white/35">campanhas afetadas</p>
                            </div>
                            <div className="rounded-[8px] border border-white/8 bg-white/[0.03] p-3">
                                <p className="text-[24px] font-semibold leading-none text-white">{preview.localFileCount}</p>
                                <p className="mt-1 text-[12px] text-white/35">arquivos locais</p>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-[12px] border border-[#ef4444]/20 bg-[rgba(239,68,68,0.06)] p-4">
                        <div className="flex items-start gap-3">
                            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[#ef4444]/10 text-[#ef4444]">
                                <Trash2 size={16} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-[14px] font-semibold text-white">
                                    Exclusao permanente
                                </p>
                                <p className="mt-1 text-[13px] leading-[1.5] text-white/45">
                                    Para confirmar, digite <span className="font-semibold text-white">APAGAR</span>. Esta acao remove os prints do Supabase e da timeline de Books.
                                </p>

                                {preview.campaigns.length > 0 && (
                                    <div className="mt-4 max-h-28 space-y-1 overflow-y-auto pr-1">
                                        {preview.campaigns.map((campaign) => (
                                            <div key={`${campaign.pi}-${campaign.client}`} className="flex items-center justify-between gap-3 text-[12px] text-white/45">
                                                <span className="truncate">PI {campaign.pi} - {campaign.client}</span>
                                                <span className="shrink-0 text-white/35">{campaign.count}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
                                    <input
                                        type="text"
                                        value={confirmation}
                                        disabled={preview.captureCount === 0 || isDeleting}
                                        onChange={(event) => setConfirmation(event.target.value)}
                                        placeholder="Digite APAGAR"
                                        className="h-11 rounded-[8px] border border-white/16 bg-white/[0.04] px-3 text-[14px] font-medium text-[#e5e5e5] outline-none transition-colors placeholder:text-white/20 focus:border-[#ef4444] disabled:cursor-not-allowed disabled:opacity-50"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleDelete}
                                        disabled={!canDelete}
                                        className="inline-flex h-11 items-center justify-center gap-2 rounded-[8px] bg-[#ef4444] px-5 text-[14px] font-medium text-white transition-all hover:-translate-y-px hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-white/[0.04] disabled:text-white/25"
                                    >
                                        {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                                        Apagar prints
                                    </button>
                                </div>

                                {isDeleting && (
                                    <div className="mt-4">
                                        <div className="flex items-center justify-between text-[12px] font-medium text-white/40">
                                            <span>{result?.deletedCaptures ?? 0} removidos</span>
                                            <span>{result?.remainingCaptures ?? preview.captureCount} restantes</span>
                                        </div>
                                        <div className="mt-2 h-1.5 overflow-hidden rounded-[4px] bg-white/[0.06]">
                                            <div
                                                className="h-full rounded-[4px] bg-[#ef4444] transition-all duration-300"
                                                style={{ width: `${cleanupProgress}%` }}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {result && (
                <div className="mt-5 rounded-[8px] border border-[#22c55e]/20 bg-[rgba(34,197,94,0.10)] px-4 py-3 text-[13px] font-medium text-[#22c55e]">
                    {isDeleting
                        ? `${result.deletedCaptures} prints removidos ate agora. ${result.remainingCaptures ?? 0} restantes.`
                        : result.message || `${result.deletedCaptures} prints removidos. ${result.deletedStorageFiles} arquivos apagados do Supabase${result.failedStorageFiles ? `, ${result.failedStorageFiles} falharam` : ''}.`}
                </div>
            )}
        </section>
    )
}
