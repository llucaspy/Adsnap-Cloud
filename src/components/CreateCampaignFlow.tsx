'use client'

import {
    cancelGamImportJob,
    createMultipleCampaigns,
    deleteGamImportDraft,
    getGamImportDrafts,
    getSettings,
    requestGamImportDraft,
} from '@/app/actions'
import type { GamImportDraft } from '@/lib/gamImportPlanner'
import { useTransition, useState, useEffect, useCallback } from 'react'
import {
    Plus, Globe, Smartphone, Monitor, Calendar,
    Clock, ChevronRight, ChevronLeft, Check,
    Building2, User2, Hash, Layers, Sparkles,
    CalendarRange, Landmark, Building, Users,
    ChevronDown, Trash2, X, Wand2, RefreshCw, FileCheck2,
    Loader2, CircleCheck, CircleX, RotateCcw, Terminal, Square
} from 'lucide-react'
import { MultiTimePicker } from './MultiTimePicker'

interface MediaEntry {
    url: string
    device: string
    format: string
    externalChannelId: string
    isMultiChannel: boolean
    allowedChannels: string
    externalCampaignId?: string
    externalAuthUrl?: string
    creativeAssetUrl?: string
}

interface GamImportJob {
    id: string
    level: string
    message: string
    createdAt: string
    orderId: string
    orderUrl: string
    requestedPi: string
    requestedSegmentation: string
    executionLogs: Array<{
        at: string
        message: string
        tone: 'info' | 'success' | 'error'
    }>
    draft: GamImportDraft | null
}

interface StepProps {
    formData: any
    updateFields: (fields: Partial<any>) => void
    next: () => void
    back?: () => void
    isPending?: boolean
    existingPis?: string[]
    bannerFormats?: any[]
    mediaEntries?: MediaEntry[]
    setMediaEntries?: (entries: MediaEntry[]) => void
}

const SEGMENTATIONS = [
    { value: 'PRIVADO', label: 'Privado', icon: Building2, description: 'Empresas privadas' },
    { value: 'GOV_FEDERAL', label: 'Gov. Federal', icon: Landmark, description: 'Governo Federal' },
    { value: 'GOV_ESTADUAL', label: 'Gov. Estadual', icon: Building, description: 'Governo Estadual' },
    { value: 'INTERNO', label: 'Interno', icon: Users, description: 'Campanhas internas' },
]

const GAM_SEGMENTATIONS = [
    { value: 'GOV_FEDERAL', label: 'Governo Federal', icon: Landmark },
    { value: 'GOV_ESTADUAL', label: 'Governo Estadual', icon: Building },
    { value: 'PRIVADO', label: 'Privado', icon: Building2 },
    { value: 'OUTRO', label: 'Outro', icon: Users },
]

function segmentationLabel(value: string) {
    if (value.startsWith('OUTRO:')) return value.replace(/^OUTRO:\s*/i, '')
    return GAM_SEGMENTATIONS.find(item => item.value === value)?.label
        || SEGMENTATIONS.find(item => item.value === value)?.label
        || value
}

export function CreateCampaignFlow({
    existingPis = [],
    initialGamJobId = null,
}: {
    existingPis?: string[]
    initialGamJobId?: string | null
}) {
    const [setupMode, setSetupMode] = useState<'gam' | 'manual'>('gam')
    const [step, setStep] = useState(1)
    const [isPending, startTransition] = useTransition()
    const [isGamPending, startGamTransition] = useTransition()
    const [bannerFormats, setBannerFormats] = useState<any[]>([])
    const [mediaEntries, setMediaEntries] = useState<MediaEntry[]>([])
    const [gamOrderUrl, setGamOrderUrl] = useState('')
    const [gamPi, setGamPi] = useState('')
    const [gamSegmentation, setGamSegmentation] = useState('GOV_FEDERAL')
    const [gamCustomSegmentation, setGamCustomSegmentation] = useState('')
    const [gamStatus, setGamStatus] = useState('')
    const [isGamRefreshing, setIsGamRefreshing] = useState(false)
    const [gamDrafts, setGamDrafts] = useState<GamImportJob[]>([])
    const [selectedGamJobId, setSelectedGamJobId] = useState<string | null>(initialGamJobId)
    const [loadedGamJobId, setLoadedGamJobId] = useState<string | null>(null)
    const [formData, setFormData] = useState({
        agency: '',
        client: '',
        campaignName: '',
        pi: '',
        segmentation: 'PRIVADO',
        flightStart: '',
        flightEnd: '',
        isScheduled: false,
        scheduledTimes: '[]' as string
    })

    useEffect(() => {
        async function fetchFormats() {
            const settings = await getSettings()
            try {
                if (settings && (settings as any).bannerFormats) {
                    setBannerFormats(JSON.parse((settings as any).bannerFormats))
                }
            } catch (e) {
                console.error("Failed to parse banner formats", e)
            }
        }
        fetchFormats()
    }, [])

    const refreshGamDrafts = useCallback(async () => {
        setIsGamRefreshing(true)
        try {
            const drafts = await getGamImportDrafts()
            setGamDrafts(drafts)
            setSelectedGamJobId(current => {
                if (current && drafts.some(job => job.id === current)) return current
                return drafts.find(job => job.level === 'JOB_GAM_RUNNING' || job.level === 'JOB_GAM_PENDING')?.id
                    || drafts[0]?.id
                    || null
            })
            return drafts
        } finally {
            setIsGamRefreshing(false)
        }
    }, [])

    useEffect(() => {
        refreshGamDrafts().catch(() => null)
    }, [refreshGamDrafts])

    const hasActiveGamJob = gamDrafts.some(job => job.level === 'JOB_GAM_PENDING' || job.level === 'JOB_GAM_RUNNING')

    useEffect(() => {
        if (!hasActiveGamJob) return
        const interval = window.setInterval(() => {
            if (document.visibilityState === 'visible') refreshGamDrafts().catch(() => null)
        }, 4000)
        return () => window.clearInterval(interval)
    }, [hasActiveGamJob, refreshGamDrafts])

    const updateFields = (fields: Partial<typeof formData>) => {
        setFormData(prev => ({ ...prev, ...fields }))
    }

    const next = () => setStep(s => Math.min(s + 1, 4))
    const back = () => setStep(s => Math.max(s - 1, 1))

    function loadGamDraft(job: GamImportJob) {
        if (!job.draft) return
        const draft = job.draft
        setSelectedGamJobId(job.id)
        setLoadedGamJobId(job.id)
        setFormData({
            agency: draft.agency,
            client: draft.client,
            campaignName: draft.campaignName,
            pi: draft.pi,
            segmentation: draft.segmentation,
            flightStart: draft.flightStart || '',
            flightEnd: draft.flightEnd || '',
            isScheduled: draft.isScheduled,
            scheduledTimes: draft.scheduledTimes,
        })
        setMediaEntries(draft.mediaEntries.map(entry => ({
            url: entry.url,
            device: entry.device,
            format: entry.format,
            externalChannelId: '',
            isMultiChannel: false,
            allowedChannels: '[]',
            externalCampaignId: entry.externalCampaignId,
            externalAuthUrl: draft.orderUrl || '',
            creativeAssetUrl: entry.creativeAssetUrl,
        })))
        setGamStatus(`Rascunho carregado: ${draft.mediaEntries.length} formato(s).`)
        setStep(4)
        setSetupMode('manual')
    }

    function requestGamDraft(url: string, pi: string, segmentation: string) {
        startGamTransition(async () => {
            try {
                setGamStatus('Solicitando rascunho...')
                const result = await requestGamImportDraft({ orderUrl: url, pi, segmentation })
                setSelectedGamJobId(result.jobId)
                setGamStatus(result.existing
                    ? `A Order ${result.orderId} ja esta em processamento.`
                    : result.triggered
                        ? `Order ${result.orderId} enviada ao worker.`
                        : `Order ${result.orderId} enfileirada; aguardando o agendador.`)
                await refreshGamDrafts()
            } catch (error) {
                setGamStatus((error as Error).message)
            }
        })
    }

    function handleRequestGamDraft() {
        const segmentation = gamSegmentation === 'OUTRO'
            ? `OUTRO: ${gamCustomSegmentation.trim()}`
            : gamSegmentation
        requestGamDraft(gamOrderUrl, gamPi, segmentation)
    }

    function handleRetryGamDraft(job: GamImportJob) {
        const pi = job.requestedPi || gamPi
        const segmentation = job.requestedSegmentation || (
            gamSegmentation === 'OUTRO' ? `OUTRO: ${gamCustomSegmentation.trim()}` : gamSegmentation
        )
        setGamOrderUrl(job.orderUrl)
        setGamPi(pi)
        if (segmentation.startsWith('OUTRO:')) {
            setGamSegmentation('OUTRO')
            setGamCustomSegmentation(segmentation.replace(/^OUTRO:\s*/i, ''))
        } else {
            setGamSegmentation(segmentation)
        }
        requestGamDraft(job.orderUrl, pi, segmentation)
    }

    async function handleDeleteGamDraft(jobId: string) {
        if (!window.confirm('Excluir este rascunho e o historico de execucao?')) return
        try {
            await deleteGamImportDraft(jobId)
            if (selectedGamJobId === jobId) setSelectedGamJobId(null)
            if (loadedGamJobId === jobId) setLoadedGamJobId(null)
            setGamStatus('Rascunho excluido.')
            await refreshGamDrafts()
        } catch (error) {
            setGamStatus((error as Error).message)
        }
    }

    async function handleStopGamWorker(jobId: string) {
        if (!window.confirm('Encerrar esta execucao do GAM agora?')) return
        try {
            await cancelGamImportJob(jobId)
            setGamStatus('Worker encerrado. O rascunho pode ser excluido.')
            await refreshGamDrafts()
        } catch (error) {
            setGamStatus((error as Error).message)
        }
    }

    async function handleFinalSubmit() {
        startTransition(async () => {
            try {
                const result = await createMultipleCampaigns({
                    agency: formData.agency,
                    client: formData.client,
                    campaignName: formData.campaignName,
                    pi: formData.pi,
                    segmentation: formData.segmentation,
                    flightStart: formData.flightStart || null,
                    flightEnd: formData.flightEnd || null,
                    isScheduled: formData.isScheduled,
                    scheduledTimes: formData.scheduledTimes,
                    mediaEntries: mediaEntries.map(e => ({
                        url: e.url,
                        device: e.device,
                        format: e.format,
                        externalChannelId: e.externalChannelId,
                        isMultiChannel: e.isMultiChannel,
                        allowedChannels: e.allowedChannels,
                        externalCampaignId: e.externalCampaignId,
                        externalAuthUrl: e.externalAuthUrl,
                        creativeAssetUrl: e.creativeAssetUrl,
                    })),
                })
                if (loadedGamJobId) {
                    await deleteGamImportDraft(loadedGamJobId)
                    setLoadedGamJobId(null)
                    setSelectedGamJobId(null)
                }
                alert(`${result.count} campanha(s) ativada(s) com sucesso!`)
                window.location.reload()
            } catch (error) {
                alert('Erro: ' + (error as Error).message)
            }
        })
    }

    return (
        <div className="space-y-6">
            <div
                className="inline-flex p-1"
                style={{ background: '#e9e7e2', border: '1px solid rgba(23,23,23,0.08)', borderRadius: '8px' }}
                aria-label="Modo de cadastro"
            >
                <button
                    type="button"
                    onClick={() => setSetupMode('gam')}
                    className="h-9 px-4 flex items-center gap-2 text-sm font-semibold transition-colors"
                    style={{
                        color: setupMode === 'gam' ? '#ffffff' : '#525252',
                        background: setupMode === 'gam' ? '#7c3aed' : 'transparent',
                        borderRadius: '6px',
                    }}
                >
                    <Wand2 size={15} /> Importar do GAM
                </button>
                <button
                    type="button"
                    onClick={() => setSetupMode('manual')}
                    className="h-9 px-4 flex items-center gap-2 text-sm font-semibold transition-colors"
                    style={{
                        color: setupMode === 'manual' ? '#ffffff' : '#525252',
                        background: setupMode === 'manual' ? '#7c3aed' : 'transparent',
                        borderRadius: '6px',
                    }}
                >
                    <Plus size={15} /> Cadastro manual
                </button>
            </div>

            {setupMode === 'gam' && (
            <GamImportPanel
                orderUrl={gamOrderUrl}
                onOrderUrlChange={setGamOrderUrl}
                pi={gamPi}
                onPiChange={value => setGamPi(value.replace(/\D/g, '').slice(0, 8))}
                segmentation={gamSegmentation}
                onSegmentationChange={setGamSegmentation}
                customSegmentation={gamCustomSegmentation}
                onCustomSegmentationChange={setGamCustomSegmentation}
                onRequestDraft={handleRequestGamDraft}
                onRefresh={refreshGamDrafts}
                onLoadDraft={loadGamDraft}
                onRetry={handleRetryGamDraft}
                onDelete={handleDeleteGamDraft}
                onStop={handleStopGamWorker}
                selectedJobId={selectedGamJobId}
                onSelectJob={setSelectedGamJobId}
                isPending={isGamPending}
                isRefreshing={isGamRefreshing}
                status={gamStatus}
                drafts={gamDrafts}
                existingPis={existingPis}
            />
            )}

            {setupMode === 'manual' && (
            <section
                className="overflow-hidden"
                style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px' }}
            >
            <div
                className="px-5 py-4 flex items-center justify-between"
                style={{ borderBottom: '1px solid var(--border)' }}
            >
                <div className="flex gap-2">
                    {[1, 2, 3, 4].map((s) => (
                        <div
                            key={s}
                            className="h-1.5 transition-all duration-500"
                            style={{
                                width: step >= s ? '36px' : '18px',
                                background: step >= s ? '#7c3aed' : '#1a1a1a',
                                borderRadius: '4px',
                            }}
                        />
                    ))}
                </div>
                <span
                    className="text-xs font-bold uppercase tracking-widest"
                    style={{ color: 'var(--text-muted)' }}
                >
                    Passo {step} de 4
                </span>
            </div>

            <div className="p-5 md:p-7">
                {step === 1 && (
                    <StepIdentification
                        formData={formData}
                        updateFields={updateFields}
                        next={next}
                        existingPis={existingPis}
                    />
                )}
                {step === 2 && (
                    <StepSegmentation
                        formData={formData}
                        updateFields={updateFields}
                        next={next}
                        back={back}
                    />
                )}
                {step === 3 && (
                    <StepMedia
                        formData={formData}
                        updateFields={updateFields}
                        next={next}
                        back={back}
                        bannerFormats={bannerFormats}
                        mediaEntries={mediaEntries}
                        setMediaEntries={setMediaEntries}
                    />
                )}
                {step === 4 && (
                    <StepAutomation
                        formData={formData}
                        updateFields={updateFields}
                        onSubmit={handleFinalSubmit}
                        back={back}
                        isPending={isPending}
                        mediaEntries={mediaEntries}
                        bannerFormats={bannerFormats}
                    />
                )}
            </div>
            </section>
            )}
        </div>
    )
}

function GamImportPanel({
    orderUrl,
    onOrderUrlChange,
    pi,
    onPiChange,
    segmentation,
    onSegmentationChange,
    customSegmentation,
    onCustomSegmentationChange,
    onRequestDraft,
    onRefresh,
    onLoadDraft,
    onRetry,
    onDelete,
    onStop,
    selectedJobId,
    onSelectJob,
    isPending,
    isRefreshing,
    status,
    drafts,
    existingPis,
}: {
    orderUrl: string
    onOrderUrlChange: (value: string) => void
    pi: string
    onPiChange: (value: string) => void
    segmentation: string
    onSegmentationChange: (value: string) => void
    customSegmentation: string
    onCustomSegmentationChange: (value: string) => void
    onRequestDraft: () => void
    onRefresh: () => Promise<GamImportJob[]>
    onLoadDraft: (job: GamImportJob) => void
    onRetry: (job: GamImportJob) => void
    onDelete: (jobId: string) => Promise<void>
    onStop: (jobId: string) => Promise<void>
    selectedJobId: string | null
    onSelectJob: (jobId: string) => void
    isPending: boolean
    isRefreshing: boolean
    status: string
    drafts: GamImportJob[]
    existingPis: string[]
}) {
    const visibleJobs = drafts.slice(0, 8)
    const selectedJob = visibleJobs.find(job => job.id === selectedJobId)
        || visibleJobs.find(job => ['JOB_GAM_PENDING', 'JOB_GAM_RUNNING'].includes(job.level))
        || visibleJobs[0]
        || null
    const hasValidPi = /^\d{3,8}$/.test(pi)
    const hasValidOrder = /^https:\/\/admanager\.google\.com\/.+order_id=\d+/i.test(orderUrl.trim())
    const hasValidSegmentation = segmentation !== 'OUTRO' || customSegmentation.trim().length >= 2
    const canRequest = hasValidPi && hasValidOrder && hasValidSegmentation && !isPending
    const piAlreadyExists = hasValidPi && existingPis.includes(pi)

    return (
        <section
            className="overflow-hidden"
            style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px' }}
        >
            <div className="px-5 py-4 flex items-center justify-between gap-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 flex items-center justify-center shrink-0" style={{ background: 'rgba(124,58,237,0.12)', color: '#a78bfa', borderRadius: '8px' }}>
                        <Wand2 size={17} />
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-base font-semibold" style={{ color: '#ffffff' }}>Importar Order do GAM</h2>
                        <p className="text-xs truncate" style={{ color: '#737373' }}>Defina o contexto, gere o rascunho e acompanhe o worker.</p>
                    </div>
                </div>
                <button
                    onClick={() => onRefresh()}
                    disabled={isRefreshing}
                    className="w-9 h-9 flex items-center justify-center transition-colors disabled:opacity-40"
                    style={{ color: '#a3a3a3', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px' }}
                    title="Atualizar execucoes"
                >
                    <RefreshCw size={15} className={isRefreshing ? 'animate-spin' : ''} />
                </button>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.78fr)] gap-5 p-5">
                <div className="space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-[180px_minmax(0,1fr)] gap-4">
                        <div className="space-y-2">
                            <label htmlFor="gam-pi" className="text-xs font-semibold" style={{ color: '#a3a3a3' }}>Numero do PI</label>
                            <div className="relative">
                                <Hash className="absolute left-3 top-1/2 -translate-y-1/2" size={16} style={{ color: '#737373' }} />
                                <input
                                    id="gam-pi"
                                    inputMode="numeric"
                                    value={pi}
                                    onChange={event => onPiChange(event.target.value)}
                                    placeholder="042760"
                                    className="w-full h-11 pl-10 pr-3 outline-none text-sm font-medium"
                                    style={{ background: '#1a1a1a', color: '#e5e5e5', border: `1px solid ${pi && !hasValidPi ? '#ef4444' : 'rgba(255,255,255,0.08)'}`, borderRadius: '8px' }}
                                />
                            </div>
                            {piAlreadyExists && <p className="text-[11px]" style={{ color: '#f59e0b' }}>Este PI ja possui campanhas. Os novos formatos serao agrupados no mesmo Book.</p>}
                        </div>

                        <fieldset className="space-y-2">
                            <legend className="text-xs font-semibold" style={{ color: '#a3a3a3' }}>Segmentacao</legend>
                            <div className="grid grid-cols-2 gap-2">
                                {GAM_SEGMENTATIONS.map(item => {
                                    const Icon = item.icon
                                    const active = segmentation === item.value
                                    return (
                                        <button
                                            key={item.value}
                                            type="button"
                                            onClick={() => onSegmentationChange(item.value)}
                                            className="h-11 px-3 flex items-center justify-center gap-2 text-xs font-semibold transition-colors"
                                            style={{
                                                color: active ? '#ffffff' : '#a3a3a3',
                                                background: active ? '#7c3aed' : '#1a1a1a',
                                                border: active ? '1px solid #7c3aed' : '1px solid rgba(255,255,255,0.08)',
                                                borderRadius: '8px',
                                            }}
                                        >
                                            <Icon size={15} />
                                            <span className="truncate">{item.label}</span>
                                        </button>
                                    )
                                })}
                            </div>
                        </fieldset>
                    </div>

                    {segmentation === 'OUTRO' && (
                        <div className="space-y-2">
                            <label htmlFor="gam-custom-segmentation" className="text-xs font-semibold" style={{ color: '#a3a3a3' }}>Descreva a segmentacao</label>
                            <input
                                id="gam-custom-segmentation"
                                value={customSegmentation}
                                onChange={event => onCustomSegmentationChange(event.target.value)}
                                placeholder="Ex.: Autarquia municipal"
                                className="w-full h-11 px-3 outline-none text-sm"
                                style={{ background: '#1a1a1a', color: '#e5e5e5', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px' }}
                            />
                        </div>
                    )}

                    <div className="space-y-2">
                        <label htmlFor="gam-order-url" className="text-xs font-semibold" style={{ color: '#a3a3a3' }}>Link da Order</label>
                        <div className="relative">
                            <Globe className="absolute left-3 top-1/2 -translate-y-1/2" size={16} style={{ color: '#737373' }} />
                            <input
                                id="gam-order-url"
                                value={orderUrl}
                                onChange={event => onOrderUrlChange(event.target.value)}
                                placeholder="https://admanager.google.com/...order_id=..."
                                className="w-full h-11 pl-10 pr-3 outline-none text-sm"
                                style={{ background: '#1a1a1a', color: '#e5e5e5', border: `1px solid ${orderUrl && !hasValidOrder ? '#ef4444' : 'rgba(255,255,255,0.08)'}`, borderRadius: '8px' }}
                            />
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                        <div className="min-h-5" aria-live="polite">
                            {status ? (
                                <p className="text-xs" style={{ color: /erro|valido|informe/i.test(status) ? '#f59e0b' : '#a3a3a3' }}>{status}</p>
                            ) : (
                                <p className="text-xs" style={{ color: '#737373' }}>O worker usa o PI e a segmentacao definidos aqui na campanha final.</p>
                            )}
                        </div>
                        <button
                            onClick={onRequestDraft}
                            disabled={!canRequest}
                            className="h-11 px-5 shrink-0 flex items-center justify-center gap-2 text-sm font-semibold text-white transition-colors disabled:opacity-40"
                            style={{ background: '#7c3aed', borderRadius: '8px' }}
                        >
                            {isPending ? <Loader2 size={16} className="animate-spin" /> : <FileCheck2 size={16} />}
                            {isPending ? 'Enviando...' : 'Gerar rascunho'}
                        </button>
                    </div>
                </div>

                {selectedJob ? (
                    <GamJobDebugger job={selectedJob} onStop={onStop} onDelete={onDelete} presentation={debuggerPresentation(selectedJob)} />
                ) : (
                    <div className="min-h-[290px] flex flex-col items-center justify-center text-center px-8" style={{ background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px' }}>
                        <Terminal size={22} style={{ color: '#737373' }} />
                        <p className="mt-3 text-sm font-semibold" style={{ color: '#e5e5e5' }}>Execucao em tempo real</p>
                        <p className="mt-1 text-xs leading-5" style={{ color: '#737373' }}>Os passos do worker aparecem aqui assim que o rascunho entra na fila.</p>
                    </div>
                )}
            </div>

            {visibleJobs.length > 0 && (
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                    <div className="px-5 py-3 flex items-center justify-between">
                        <p className="text-xs font-semibold" style={{ color: '#a3a3a3' }}>Rascunhos recentes</p>
                        <span className="text-[11px]" style={{ color: '#737373' }}>{visibleJobs.length} execucao(oes)</span>
                    </div>
                    {visibleJobs.map(job => {
                        const presentation = debuggerPresentation(job)
                        const active = job.id === selectedJob?.id
                        const canDelete = !['JOB_GAM_PENDING', 'JOB_GAM_RUNNING'].includes(job.level)
                        return (
                            <div
                                key={job.id}
                                className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-5 py-3 items-center cursor-pointer"
                                style={{ borderTop: '1px solid rgba(255,255,255,0.08)', background: active ? 'rgba(124,58,237,0.08)' : 'transparent' }}
                                onClick={() => onSelectJob(job.id)}
                            >
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <p className="text-sm font-semibold" style={{ color: '#e5e5e5' }}>Order {job.orderId || 'GAM'}</p>
                                        <span className="px-2 py-1 text-[10px] font-semibold" style={{ color: presentation.color, background: presentation.background, borderRadius: '6px' }}>{presentation.label}</span>
                                    </div>
                                    <p className="text-xs mt-1 truncate" style={{ color: '#737373' }}>
                                        PI {job.requestedPi || job.draft?.pi || '-'} · {segmentationLabel(job.requestedSegmentation || job.draft?.segmentation || '-')}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2" onClick={event => event.stopPropagation()}>
                                    {job.draft && (
                                        <button onClick={() => onLoadDraft(job)} className="h-9 px-3 flex items-center gap-2 text-xs font-semibold text-white" style={{ background: '#7c3aed', borderRadius: '8px' }}>
                                            Revisar <ChevronRight size={14} />
                                        </button>
                                    )}
                                    {job.level === 'JOB_GAM_ERROR' && job.orderUrl && (
                                        <button onClick={() => onRetry(job)} disabled={isPending} className="w-9 h-9 flex items-center justify-center disabled:opacity-40" style={{ color: '#f59e0b', border: '1px solid rgba(245,158,11,0.28)', borderRadius: '8px' }} title="Tentar novamente">
                                            <RotateCcw size={14} />
                                        </button>
                                    )}
                                    {canDelete && (
                                        <button onClick={() => onDelete(job.id)} className="w-9 h-9 flex items-center justify-center" style={{ color: '#ef4444', border: '1px solid rgba(239,68,68,0.28)', borderRadius: '8px' }} title="Excluir rascunho">
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </section>
    )
}

function GamJobDebugger({ job, onStop, onDelete, presentation }: {
    job: GamImportJob | null
    onStop: (jobId: string) => Promise<void>
    onDelete: (jobId: string) => Promise<void>
    presentation: ReturnType<typeof debuggerPresentation> | null
}) {
    if (!job || !presentation) return null

    const isActive = job.level === 'JOB_GAM_PENDING' || job.level === 'JOB_GAM_RUNNING'
    const logs = job.executionLogs.length > 0
        ? job.executionLogs
        : [{ at: job.createdAt, message: job.message.replace(/^Nexus GAM:\s*/i, ''), tone: 'info' as const }]

    return (
        <aside
            className="min-h-[280px] flex flex-col overflow-hidden"
            style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px' }}
            aria-live="polite"
        >
            <div className="px-4 py-3 pr-14 sm:pr-4 flex items-center justify-between gap-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 flex items-center justify-center shrink-0" style={{ color: '#7c3aed', background: 'rgba(124,58,237,0.12)', borderRadius: '8px' }}>
                        <Terminal size={17} />
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-semibold" style={{ color: '#e5e5e5' }}>Depurador GAM</p>
                        <p className="text-xs truncate" style={{ color: '#737373' }}>Order {job.orderId || 'GAM'}</p>
                    </div>
                </div>
                <span className="px-2 py-1 text-[10px] font-semibold shrink-0" style={{ color: presentation.color, background: presentation.background, borderRadius: '6px' }}>
                    {presentation.label}
                </span>
            </div>

            <div className="flex-1 max-h-72 overflow-y-auto px-4 py-3 space-y-3" style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                {logs.map((log, index) => {
                    const color = log.tone === 'error' ? '#ef4444' : log.tone === 'success' ? '#22c55e' : '#7c3aed'
                    const isCurrent = isActive && index === logs.length - 1
                    return (
                        <div key={`${log.at}-${index}`} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 items-start">
                            <div className="w-5 h-5 flex items-center justify-center mt-0.5" style={{ color }}>
                                {isCurrent ? <Loader2 size={13} className="animate-spin" /> : log.tone === 'error' ? <CircleX size={13} /> : <Check size={13} />}
                            </div>
                            <div className="min-w-0">
                                <p className="text-xs leading-5 break-words" style={{ color: '#a3a3a3' }}>{log.message}</p>
                                <time className="text-[10px]" style={{ color: '#525252' }}>
                                    {new Date(log.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </time>
                            </div>
                        </div>
                    )
                })}
            </div>

            <div className="px-4 py-3 flex justify-end gap-2" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                {isActive ? (
                    <button
                        onClick={() => onStop(job.id)}
                        className="px-3 py-2 flex items-center gap-2 text-xs font-semibold transition-colors"
                        style={{ color: '#ef4444', border: '1px solid rgba(239,68,68,0.28)', borderRadius: '8px' }}
                    >
                        <Square size={13} fill="currentColor" /> Encerrar worker
                    </button>
                ) : (
                    <button
                        onClick={() => onDelete(job.id)}
                        className="px-3 py-2 flex items-center gap-2 text-xs font-semibold transition-colors"
                        style={{ color: '#ef4444', border: '1px solid rgba(239,68,68,0.28)', borderRadius: '8px' }}
                    >
                        <Trash2 size={14} /> Excluir rascunho
                    </button>
                )}
            </div>
        </aside>
    )
}

function debuggerPresentation(job: GamImportJob) {
    if (job.level === 'JOB_GAM_RUNNING') return { label: 'Processando', color: '#7c3aed', background: 'rgba(124,58,237,0.12)' }
    if (job.level === 'JOB_GAM_PENDING') return { label: 'Na fila', color: '#f59e0b', background: 'rgba(245,158,11,0.10)' }
    if (job.level === 'JOB_GAM_REVIEW') return { label: 'Pronto', color: '#22c55e', background: 'rgba(34,197,94,0.10)' }
    if (job.level === 'JOB_GAM_CANCELLED') return { label: 'Encerrado', color: '#f59e0b', background: 'rgba(245,158,11,0.10)' }
    return { label: 'Erro', color: '#ef4444', background: 'rgba(239,68,68,0.10)' }
}

function StepIdentification({ formData, updateFields, next, existingPis }: StepProps) {
    const [suggestions, setSuggestions] = useState<string[]>([])

    const handlePiChange = (val: string) => {
        updateFields({ pi: val })
        if (val.length > 0 && existingPis) {
            const filtered = existingPis.filter(p => p.toLowerCase().includes(val.toLowerCase())).slice(0, 3)
            setSuggestions(filtered)
        } else {
            setSuggestions([])
        }
    }

    const canContinue = formData.agency && formData.client && formData.campaignName && formData.pi

    return (
        <div className="space-y-8 animate-slide-up">
            <header>
                <h2
                    className="text-3xl font-bold tracking-tight mb-2"
                    style={{ fontFamily: 'var(--font-display)' }}
                >
                    <span className="text-gradient">Identidade</span>
                </h2>
                <p style={{ color: 'var(--text-secondary)' }}>Vincule esta campanha a um PI/Book.</p>
            </header>

            <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <InputField
                        label="Agência"
                        icon={Building2}
                        value={formData.agency}
                        onChange={(v: string) => updateFields({ agency: v })}
                        placeholder="Binder, Nacional..."
                    />
                    <InputField
                        label="Cliente"
                        icon={User2}
                        value={formData.client}
                        onChange={(v: string) => updateFields({ client: v })}
                        placeholder="Detran-DF, Brasal..."
                    />
                </div>

                <InputField
                    label="Nome da Campanha"
                    icon={Layers}
                    value={formData.campaignName}
                    onChange={(v: string) => updateFields({ campaignName: v })}
                    placeholder="Ex: Black Friday 2026, Lançamento Produto X..."
                />

                <div className="relative">
                    <div className="relative">
                        <InputField
                            label="PI / Identificador (Essencial para o Book)"
                            icon={Hash}
                            value={formData.pi}
                            onChange={handlePiChange}
                            placeholder="Ex: 991"
                            onBlur={async () => {
                                if (formData.pi.length >= 3) {
                                    const { getCampaignDetailsByPi } = await import('@/app/actions')
                                    const data = await getCampaignDetailsByPi(formData.pi)
                                    if (data) {
                                        updateFields({
                                            agency: data.agency,
                                            client: data.client,
                                            campaignName: data.campaignName,
                                            // format: data.format,
                                            // url: data.url,
                                            // device: data.device,
                                            segmentation: data.segmentation,
                                            flightStart: data.flightStart ? new Date(data.flightStart).toISOString().split('T')[0] : '',
                                            flightEnd: data.flightEnd ? new Date(data.flightEnd).toISOString().split('T')[0] : ''
                                        })
                                    }
                                }
                            }}
                        />
                        {/* Loading indicator could go here */}
                    </div>

                    {suggestions.length > 0 && (
                        <div
                            className="absolute z-10 w-full mt-2 rounded-xl p-2 animate-fade-in shadow-xl"
                            style={{
                                background: 'var(--bg-tertiary)',
                                border: '1px solid var(--border)'
                            }}
                        >
                            {suggestions.map(s => (
                                <button
                                    key={s}
                                    onClick={async () => {
                                        updateFields({ pi: s })
                                        setSuggestions([])
                                        // Auto-fill trigger
                                        const { getCampaignDetailsByPi } = await import('@/app/actions')
                                        const data = await getCampaignDetailsByPi(s)
                                        if (data) {
                                            updateFields({
                                                agency: data.agency,
                                                client: data.client,
                                                campaignName: data.campaignName,
                                                // format: data.format,
                                                // url: data.url,
                                                // device: data.device,
                                                segmentation: data.segmentation,
                                                flightStart: data.flightStart ? new Date(data.flightStart).toISOString().split('T')[0] : '',
                                                flightEnd: data.flightEnd ? new Date(data.flightEnd).toISOString().split('T')[0] : ''
                                            })
                                        }
                                    }}
                                    className="w-full text-left p-3 rounded-lg text-sm font-bold transition-all flex items-center justify-between"
                                    style={{ color: 'var(--text-primary)' }}
                                    onMouseEnter={e => {
                                        e.currentTarget.style.background = 'var(--accent-muted)'
                                        e.currentTarget.style.color = 'var(--accent-light)'
                                    }}
                                    onMouseLeave={e => {
                                        e.currentTarget.style.background = 'transparent'
                                        e.currentTarget.style.color = 'var(--text-primary)'
                                    }}
                                >
                                    <span>PI {s}</span>
                                    <span className="text-[10px] opacity-60 uppercase tracking-wider">Preencher Automático</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <PrimaryButton onClick={next} disabled={!canContinue}>
                Próximo: Segmentação
                <ChevronRight size={20} />
            </PrimaryButton>
        </div>
    )
}

function StepSegmentation({ formData, updateFields, next, back }: StepProps) {
    return (
        <div className="space-y-8 animate-slide-up">
            <header>
                <h2
                    className="text-3xl font-bold tracking-tight mb-2"
                    style={{ fontFamily: 'var(--font-display)' }}
                >
                    <span className="text-gradient">Segmentação</span>
                </h2>
                <p style={{ color: 'var(--text-secondary)' }}>Tipo de cliente e período de veiculação.</p>
            </header>

            <div className="space-y-6">
                {/* Segmentation Selection */}
                <div className="space-y-3">
                    <label
                        className="text-xs font-bold uppercase tracking-widest"
                        style={{ color: 'var(--text-muted)' }}
                    >
                        Tipo de Cliente
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                        {SEGMENTATIONS.map((seg) => {
                            const isActive = formData.segmentation === seg.value
                            return (
                                <button
                                    key={seg.value}
                                    onClick={() => updateFields({ segmentation: seg.value })}
                                    className="p-5 rounded-xl transition-all flex items-center gap-4 text-left group"
                                    style={{
                                        background: isActive ? 'var(--accent-muted)' : 'var(--bg-tertiary)',
                                        border: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                                        boxShadow: isActive ? '0 0 20px rgba(255, 255, 255, 0.1)' : 'none'
                                    }}
                                >
                                    <div
                                        className="w-12 h-12 rounded-xl flex items-center justify-center transition-all"
                                        style={{
                                            background: isActive ? 'var(--gradient-primary)' : 'var(--bg-elevated)',
                                            color: isActive ? 'white' : 'var(--text-muted)'
                                        }}
                                    >
                                        <seg.icon size={22} />
                                    </div>
                                    <div>
                                        <p
                                            className="font-bold text-sm"
                                            style={{ color: isActive ? 'var(--accent-light)' : 'var(--text-primary)' }}
                                        >
                                            {seg.label}
                                        </p>
                                        <p
                                            className="text-xs"
                                            style={{ color: 'var(--text-muted)' }}
                                        >
                                            {seg.description}
                                        </p>
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* Flight Dates */}
                <div className="space-y-3">
                    <label
                        className="text-xs font-bold uppercase tracking-widest flex items-center gap-2"
                        style={{ color: 'var(--text-muted)' }}
                    >
                        <CalendarRange size={14} />
                        Período de Veiculação
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label
                                className="text-[10px] font-bold uppercase tracking-widest"
                                style={{ color: 'var(--text-muted)' }}
                            >
                                Início
                            </label>
                            <input
                                type="date"
                                value={formData.flightStart}
                                onChange={e => updateFields({ flightStart: e.target.value })}
                                className="w-full rounded-xl p-4 outline-none transition-all font-medium"
                                style={{
                                    background: 'var(--bg-tertiary)',
                                    border: '2px solid transparent',
                                    color: 'var(--text-primary)'
                                }}
                                onFocus={e => {
                                    e.currentTarget.style.borderColor = 'var(--accent)'
                                }}
                                onBlur={e => {
                                    e.currentTarget.style.borderColor = 'transparent'
                                }}
                            />
                        </div>
                        <div className="space-y-2">
                            <label
                                className="text-[10px] font-bold uppercase tracking-widest"
                                style={{ color: 'var(--text-muted)' }}
                            >
                                Fim
                            </label>
                            <input
                                type="date"
                                value={formData.flightEnd}
                                onChange={e => updateFields({ flightEnd: e.target.value })}
                                className="w-full rounded-xl p-4 outline-none transition-all font-medium"
                                style={{
                                    background: 'var(--bg-tertiary)',
                                    border: '2px solid transparent',
                                    color: 'var(--text-primary)'
                                }}
                                onFocus={e => {
                                    e.currentTarget.style.borderColor = 'var(--accent)'
                                }}
                                onBlur={e => {
                                    e.currentTarget.style.borderColor = 'transparent'
                                }}
                            />
                        </div>
                    </div>
                    <p
                        className="text-xs flex items-center gap-2"
                        style={{ color: 'var(--text-muted)' }}
                    >
                        <Sparkles size={12} style={{ color: 'var(--accent)' }} />
                        Capturas automáticas só ocorrerão dentro do período de veiculação.
                    </p>
                </div>
            </div>

            <div className="flex gap-4">
                <BackButton onClick={back} />
                <PrimaryButton onClick={next} disabled={!formData.flightStart || !formData.flightEnd}>
                    Próximo: Detalhes da Mídia
                    <ChevronRight size={20} />
                </PrimaryButton>
            </div>
        </div>
    )
}

function StepMedia({ formData, updateFields, next, back, bannerFormats = [], mediaEntries = [], setMediaEntries }: StepProps) {
    const [currentUrl, setCurrentUrl] = useState('')
    const [currentDevice, setCurrentDevice] = useState('desktop')
    const [currentFormat, setCurrentFormat] = useState('')
    const [currentChannelId, setCurrentChannelId] = useState('')

    const canAdd = currentUrl && currentFormat
    const canContinue = mediaEntries.length > 0

    const addEntry = () => {
        if (!canAdd || !setMediaEntries) return
        setMediaEntries([...mediaEntries, { 
            url: currentUrl, 
            device: currentDevice, 
            format: currentFormat,
            externalChannelId: currentChannelId,
            isMultiChannel: false,
            allowedChannels: '[]',
            externalCampaignId: '',
            externalAuthUrl: ''
        }])
        // Reset format and channel, keep URL and device for convenience
        setCurrentFormat('')
        setCurrentChannelId('')
    }

    const removeEntry = (index: number) => {
        if (!setMediaEntries) return
        setMediaEntries(mediaEntries.filter((_, i) => i !== index))
    }

    const getFormatLabel = (formatId: string) => {
        const fmt = bannerFormats.find((f: any) => f.id === formatId)
        return fmt ? `${fmt.label} (${fmt.width}x${fmt.height})` : formatId
    }

    return (
        <div className="space-y-8 animate-slide-up">
            <header>
                <h2
                    className="text-3xl font-bold tracking-tight mb-2"
                    style={{ fontFamily: 'var(--font-display)' }}
                >
                    <span className="text-gradient">Veiculação</span>
                </h2>
                <p style={{ color: 'var(--text-secondary)' }}>Adicione os formatos e URLs da campanha.</p>
            </header>

            {/* Added entries list */}
            {mediaEntries.length > 0 && (
                <div className="space-y-2">
                    <label
                        className="text-xs font-bold uppercase tracking-widest flex items-center gap-2"
                        style={{ color: 'var(--text-muted)' }}
                    >
                        <Layers size={14} />
                        Formatos Adicionados ({mediaEntries.length})
                    </label>
                    <div className="space-y-2">
                        {mediaEntries.map((entry, idx) => (
                            <div
                                key={idx}
                                className="flex items-center gap-3 p-3 rounded-xl group transition-all"
                                style={{
                                    background: 'var(--accent-muted)',
                                    border: '1px solid var(--accent)',
                                }}
                            >
                                <div
                                    className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                                    style={{ background: 'var(--gradient-primary)' }}
                                >
                                    {entry.device === 'mobile' ? <Smartphone size={16} className="text-white" /> : <Monitor size={16} className="text-white" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold truncate" style={{ color: 'var(--accent-light)' }}>
                                        {getFormatLabel(entry.format)}
                                    </p>
                                    <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                                        {entry.url}
                                    </p>
                                </div>
                                <button
                                    onClick={() => removeEntry(idx)}
                                    className="w-8 h-8 rounded-lg flex items-center justify-center opacity-60 hover:opacity-100 transition-all hover:bg-red-500/20"
                                    style={{ color: 'var(--text-muted)' }}
                                    title="Remover"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Input form for new entry */}
            <div
                className="space-y-4 p-5 rounded-2xl"
                style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)' }}
            >
                <label
                    className="text-xs font-bold uppercase tracking-widest flex items-center gap-2"
                    style={{ color: 'var(--text-muted)' }}
                >
                    <Plus size={14} />
                    {mediaEntries.length === 0 ? 'Adicionar Formato' : 'Adicionar Outro Formato'}
                </label>

                <InputField
                    label="URL Alvo"
                    icon={Globe}
                    value={currentUrl}
                    onChange={setCurrentUrl}
                    placeholder="https://exemplo.com.br/materia"
                />

                <InputField
                    label="ID Canal 00px (Referência)"
                    icon={Layers}
                    value={currentChannelId}
                    onChange={setCurrentChannelId}
                    placeholder="Ex: 81848 (Opcional)"
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label
                            className="text-xs font-bold uppercase tracking-widest"
                            style={{ color: 'var(--text-muted)' }}
                        >
                            Dispositivo
                        </label>
                        <div
                            className="flex gap-2 p-1.5 rounded-xl"
                            style={{ background: 'var(--bg-elevated, var(--bg-secondary))' }}
                        >
                            <DeviceButton
                                active={currentDevice === 'desktop'}
                                onClick={() => setCurrentDevice('desktop')}
                                icon={Monitor}
                                label="Desktop"
                            />
                            <DeviceButton
                                active={currentDevice === 'mobile'}
                                onClick={() => setCurrentDevice('mobile')}
                                icon={Smartphone}
                                label="Mobile"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                            Formato
                        </label>
                        <div className="relative">
                            <Layers className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" size={18} />
                            <select
                                value={currentFormat}
                                onChange={e => setCurrentFormat(e.target.value)}
                                className="w-full appearance-none rounded-xl p-4 pl-12 pr-10 outline-none transition-all font-medium"
                                style={{
                                    background: 'var(--bg-elevated, var(--bg-secondary))',
                                    border: '2px solid transparent',
                                    color: 'var(--text-primary)'
                                }}
                            >
                                <option value="">Selecione um formato...</option>
                                {bannerFormats.map((fmt: any) => (
                                    <option key={fmt.id} value={fmt.id}>
                                        {fmt.label} ({fmt.width}x{fmt.height})
                                    </option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" size={18} />
                        </div>
                    </div>
                </div>

                <button
                    onClick={addEntry}
                    disabled={!canAdd}
                    className="w-full font-bold py-3.5 rounded-xl transition-all flex justify-center items-center gap-2 disabled:opacity-30 text-sm"
                    style={{
                        background: canAdd ? 'var(--accent-muted)' : 'var(--bg-elevated, var(--bg-secondary))',
                        color: canAdd ? 'var(--accent-light)' : 'var(--text-muted)',
                        border: canAdd ? '1px solid var(--accent)' : '1px solid transparent'
                    }}
                >
                    <Plus size={18} />
                    Adicionar à Lista
                </button>
            </div>

            <div className="flex gap-4">
                <BackButton onClick={back} />
                <PrimaryButton onClick={next} disabled={!canContinue}>
                    Próximo: Automação ({mediaEntries.length} formato{mediaEntries.length !== 1 ? 's' : ''})
                    <ChevronRight size={20} />
                </PrimaryButton>
            </div>
        </div>
    )
}

function StepAutomation({ formData, updateFields, onSubmit, back, isPending, mediaEntries = [], bannerFormats = [] }: any) {
    const getFormatLabel = (formatId: string) => {
        const fmt = bannerFormats.find((f: any) => f.id === formatId)
        return fmt ? `${fmt.label} (${fmt.width}x${fmt.height})` : formatId
    }

    return (
        <div className="space-y-8 animate-slide-up">
            <header>
                <h2
                    className="text-3xl font-bold tracking-tight mb-2"
                    style={{ fontFamily: 'var(--font-display)' }}
                >
                    <span className="text-gradient">Automação</span>
                </h2>
                <p style={{ color: 'var(--text-secondary)' }}>Configure o disparo automático.</p>
            </header>

            <div className="space-y-6">
                <button
                    onClick={() => updateFields({ isScheduled: !formData.isScheduled })}
                    className="w-full p-6 rounded-2xl transition-all flex items-center justify-between group"
                    style={{
                        background: formData.isScheduled ? 'var(--accent-muted)' : 'var(--bg-tertiary)',
                        border: formData.isScheduled ? '2px solid var(--accent)' : '2px solid transparent',
                        boxShadow: formData.isScheduled ? 'var(--shadow-glow)' : 'none'
                    }}
                >
                    <div className="flex items-center gap-4 text-left">
                        <div
                            className="w-14 h-14 rounded-xl flex items-center justify-center transition-all"
                            style={{
                                background: formData.isScheduled ? 'var(--gradient-primary)' : 'var(--bg-elevated)',
                                color: formData.isScheduled ? 'white' : 'var(--text-muted)'
                            }}
                        >
                            <Calendar size={26} />
                        </div>
                        <div>
                            <p
                                className="font-bold text-lg"
                                style={{ color: 'var(--text-primary)' }}
                            >
                                {formData.isScheduled ? 'Agendamento diário ativo' : 'Ativar Agendamento diário'}
                            </p>
                            <p
                                className="text-sm"
                                style={{ color: 'var(--text-secondary)' }}
                            >
                                O sistema capturará automaticamente no horário definido.
                            </p>
                        </div>
                    </div>
                    <div
                        className="w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all"
                        style={{
                            background: formData.isScheduled ? 'var(--accent)' : 'transparent',
                            borderColor: formData.isScheduled ? 'var(--accent)' : 'var(--border)'
                        }}
                    >
                        {formData.isScheduled && <Check size={16} className="text-white" />}
                    </div>
                </button>

                {formData.isScheduled && (
                    <div
                        className="p-6 rounded-2xl space-y-4 animate-fade-in"
                        style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)' }}
                    >
                        <div className="flex items-center gap-3">
                            <Clock size={22} style={{ color: 'var(--accent-light)' }} />
                            <span className="text-sm font-bold" style={{ color: 'var(--text-secondary)' }}>
                                Horários dos Disparos
                            </span>
                        </div>

                        <MultiTimePicker
                            value={(() => {
                                try {
                                    return JSON.parse(formData.scheduledTimes)
                                } catch {
                                    return []
                                }
                            })()}
                            onChange={(times) => updateFields({ scheduledTimes: JSON.stringify(times) })}
                        />
                    </div>
                )}

                {/* Summary Card */}
                <div
                    className="p-6 rounded-2xl space-y-4"
                    style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)' }}
                >
                    <p
                        className="text-xs font-bold uppercase tracking-widest"
                        style={{ color: 'var(--text-muted)' }}
                    >
                        Resumo da Campanha
                    </p>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <span style={{ color: 'var(--text-muted)' }}>Cliente:</span>
                            <span className="ml-2 font-bold" style={{ color: 'var(--text-primary)' }}>{formData.client}</span>
                        </div>
                        <div>
                            <span style={{ color: 'var(--text-muted)' }}>Segmento:</span>
                            <span className="ml-2 font-bold" style={{ color: 'var(--accent-light)' }}>
                                {segmentationLabel(formData.segmentation)}
                            </span>
                        </div>
                        <div className="col-span-2">
                            <span style={{ color: 'var(--text-muted)' }}>Período:</span>
                            <span className="ml-2 font-bold" style={{ color: 'var(--text-primary)' }}>
                                {formData.flightStart} → {formData.flightEnd}
                            </span>
                        </div>
                    </div>

                    {/* Media entries summary */}
                    <div className="pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                        <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>
                            Formatos ({mediaEntries.length})
                        </p>
                        <div className="space-y-2">
                            {mediaEntries.map((entry: MediaEntry, idx: number) => (
                                <div
                                    key={idx}
                                    className="flex items-center gap-3 p-2.5 rounded-lg text-sm"
                                    style={{ background: 'var(--bg-elevated, var(--bg-secondary))' }}
                                >
                                    {entry.device === 'mobile'
                                        ? <Smartphone size={14} style={{ color: 'var(--accent-light)' }} />
                                        : <Monitor size={14} style={{ color: 'var(--accent-light)' }} />
                                    }
                                    <span className="font-bold" style={{ color: 'var(--text-primary)' }}>
                                        {getFormatLabel(entry.format)}
                                    </span>
                                    <span className="text-xs truncate flex-1" style={{ color: 'var(--text-muted)' }}>
                                        {entry.url}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex gap-4">
                <BackButton onClick={back} disabled={isPending} />
                <button
                    onClick={onSubmit}
                    disabled={isPending}
                    className="flex-1 font-bold py-5 rounded-xl transition-all flex justify-center items-center gap-3 group disabled:opacity-50 text-white btn-glow"
                    style={{
                        background: 'var(--gradient-primary)',
                        fontFamily: 'var(--font-display)'
                    }}
                >
                    {isPending ? 'Ativando...' : (
                        <>
                            <Sparkles size={20} />
                            Ativar {mediaEntries.length} Campanha{mediaEntries.length !== 1 ? 's' : ''}
                        </>
                    )}
                </button>
            </div>
        </div>
    )
}

// Reusable Components
function InputField({ label, icon: Icon, value, onChange, placeholder, onBlur }: any) {
    return (
        <div className="space-y-2">
            <label
                className="text-xs font-bold uppercase tracking-widest"
                style={{ color: 'var(--text-muted)' }}
            >
                {label}
            </label>
            <div className="relative group">
                <Icon
                    className="absolute left-4 top-1/2 -translate-y-1/2 transition-colors"
                    size={18}
                    style={{ color: 'var(--text-muted)' }}
                />
                <input
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    placeholder={placeholder}
                    className="w-full rounded-xl p-4 pl-12 outline-none transition-all font-medium"
                    style={{
                        background: 'var(--bg-tertiary)',
                        border: '2px solid transparent',
                        color: 'var(--text-primary)'
                    }}
                    onFocus={e => {
                        e.currentTarget.style.borderColor = 'var(--accent)'
                        e.currentTarget.style.boxShadow = '0 0 20px rgba(255, 255, 255, 0.1)'
                    }}
                    onBlur={e => {
                        e.currentTarget.style.borderColor = 'transparent'
                        e.currentTarget.style.boxShadow = 'none'
                        if (onBlur) onBlur(e)
                    }}
                />
            </div>
        </div>
    )
}

function DeviceButton({ active, onClick, icon: Icon, label }: any) {
    return (
        <button
            onClick={onClick}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-lg transition-all font-bold text-sm"
            style={{
                background: active ? 'var(--gradient-primary)' : 'transparent',
                color: active ? 'white' : 'var(--text-muted)',
                boxShadow: active ? '0 0 20px rgba(255, 255, 255, 0.12)' : 'none'
            }}
        >
            <Icon size={18} /> {label}
        </button>
    )
}

function PrimaryButton({ onClick, disabled, children }: any) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className="w-full font-bold py-5 rounded-xl transition-all flex justify-center items-center gap-2 group disabled:opacity-50 text-white"
            style={{
                background: 'var(--gradient-primary)',
                boxShadow: disabled ? 'none' : 'var(--shadow-glow)'
            }}
        >
            {children}
        </button>
    )
}

function BackButton({ onClick, disabled }: any) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className="w-20 rounded-xl flex justify-center items-center transition-all disabled:opacity-50"
            style={{
                background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)'
            }}
        >
            <ChevronLeft size={24} />
        </button>
    )
}
