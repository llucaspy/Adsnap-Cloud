'use client'

import { createMultipleCampaigns, getSettings } from '@/app/actions'
import { useTransition, useState, useEffect } from 'react'
import {
    Plus, Globe, Smartphone, Monitor, Calendar,
    Clock, ChevronRight, ChevronLeft, Check,
    Building2, User2, Hash, Layers, Sparkles,
    CalendarRange, Shield, Landmark, Building, Users,
    ChevronDown, Trash2, X
} from 'lucide-react'
import { MultiTimePicker } from './MultiTimePicker'

interface MediaEntry {
    url: string
    device: string
    format: string
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

export function CreateCampaignFlow({ existingPis = [] }: { existingPis?: string[] }) {
    const [step, setStep] = useState(1)
    const [isPending, startTransition] = useTransition()
    const [bannerFormats, setBannerFormats] = useState<any[]>([])
    const [mediaEntries, setMediaEntries] = useState<MediaEntry[]>([])
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

    const updateFields = (fields: Partial<typeof formData>) => {
        setFormData(prev => ({ ...prev, ...fields }))
    }

    const next = () => setStep(s => Math.min(s + 1, 4))
    const back = () => setStep(s => Math.max(s - 1, 1))

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
                    mediaEntries,
                })
                alert(`${result.count} campanha(s) ativada(s) com sucesso!`)
                window.location.reload()
            } catch (error) {
                alert('Erro: ' + (error as Error).message)
            }
        })
    }

    return (
        <div
            className="rounded-3xl overflow-hidden transition-all duration-500 relative"
            style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)'
            }}
        >
            {/* Gradient border effect */}
            <div
                className="absolute inset-0 rounded-3xl opacity-50 pointer-events-none"
                style={{
                    background: 'var(--gradient-primary)',
                    padding: '1px',
                    mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                    maskComposite: 'exclude',
                    WebkitMaskComposite: 'xor'
                }}
            />

            {/* Progress Header */}
            <div
                className="px-8 pt-8 pb-6 flex items-center justify-between relative z-10"
                style={{ borderBottom: '1px solid var(--border)' }}
            >
                <div className="flex gap-2">
                    {[1, 2, 3, 4].map((s) => (
                        <div
                            key={s}
                            className="h-2 rounded-full transition-all duration-500"
                            style={{
                                width: step >= s ? '40px' : '20px',
                                background: step >= s ? 'var(--gradient-primary)' : 'var(--bg-tertiary)',
                                boxShadow: step >= s ? '0 0 12px rgba(255, 255, 255, 0.2)' : 'none'
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

            <div className="p-8 lg:p-10 relative z-10">
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
        </div>
    )
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

    const canAdd = currentUrl && currentFormat
    const canContinue = mediaEntries.length > 0

    const addEntry = () => {
        if (!canAdd || !setMediaEntries) return
        setMediaEntries([...mediaEntries, { url: currentUrl, device: currentDevice, format: currentFormat }])
        // Reset format only, keep URL and device for convenience
        setCurrentFormat('')
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
                                Ativar Agendamento diário
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
                                {SEGMENTATIONS.find((s: any) => s.value === formData.segmentation)?.label}
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
