'use client'

import { updateCampaign, getSettings } from '@/app/actions'
import { useTransition, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
    Globe, Smartphone, Monitor, Calendar,
    Clock, ChevronRight, ChevronLeft, Check,
    Building2, User2, Hash, Layers, Sparkles,
    CalendarRange, Landmark, Building, Users, Save,
    ChevronDown
} from 'lucide-react'
import { MultiTimePicker } from './MultiTimePicker'

interface Campaign {
    id: string
    agency: string
    client: string
    campaignName: string
    pi: string
    segmentation: string
    url: string
    device: string
    format: string
    flightStart: Date | null
    flightEnd: Date | null
    isScheduled: boolean
    scheduledTimes: string
}

const SEGMENTATIONS = [
    { value: 'PRIVADO', label: 'Privado', icon: Building2, description: 'Empresas privadas' },
    { value: 'GOV_FEDERAL', label: 'Gov. Federal', icon: Landmark, description: 'Governo Federal' },
    { value: 'GOV_ESTADUAL', label: 'Gov. Estadual', icon: Building, description: 'Governo Estadual' },
    { value: 'INTERNO', label: 'Interno', icon: Users, description: 'Campanhas internas' },
]

function formatDateForInput(date: Date | null): string {
    if (!date) return ''
    return new Date(date).toISOString().split('T')[0]
}

export function EditCampaignForm({ campaign, existingPis }: { campaign: Campaign, existingPis: string[] }) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [bannerFormats, setBannerFormats] = useState<any[]>([])
    const [formData, setFormData] = useState({
        agency: campaign.agency,
        client: campaign.client,
        campaignName: campaign.campaignName || '',
        pi: campaign.pi,
        segmentation: campaign.segmentation || 'PRIVADO',
        url: campaign.url,
        device: campaign.device,
        format: campaign.format,
        flightStart: formatDateForInput(campaign.flightStart),
        flightEnd: formatDateForInput(campaign.flightEnd),
        isScheduled: campaign.isScheduled,
        scheduledTimes: campaign.scheduledTimes || '[]'
    })

    useEffect(() => {
        async function fetchFormats() {
            const settings = await getSettings()
            try {
                if (settings && settings.bannerFormats) {
                    setBannerFormats(JSON.parse(settings.bannerFormats))
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

    async function handleSubmit() {
        const data = new FormData()
        Object.entries(formData).forEach(([key, value]) => {
            data.append(key, value.toString())
        })

        startTransition(async () => {
            try {
                await updateCampaign(campaign.id, data)
                router.push('/monitoring')
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
                    background: 'var(--gradient-secondary)',
                    padding: '1px',
                    mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                    maskComposite: 'exclude',
                    WebkitMaskComposite: 'xor'
                }}
            />

            <div className="p-8 lg:p-10 relative z-10 space-y-10">
                {/* Section: Identidade */}
                <section className="space-y-6">
                    <h2
                        className="text-2xl font-bold tracking-tight"
                        style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
                    >
                        <span className="text-gradient">Identidade</span>
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <InputField
                            label="Agência"
                            icon={Building2}
                            value={formData.agency}
                            onChange={(v: string) => updateFields({ agency: v })}
                            placeholder="Africa, WMcCann..."
                        />
                        <InputField
                            label="Cliente"
                            icon={User2}
                            value={formData.client}
                            onChange={(v: string) => updateFields({ client: v })}
                            placeholder="Itaú, Ambev..."
                        />
                    </div>

                    <InputField
                        label="Nome da Campanha"
                        icon={Layers}
                        value={formData.campaignName}
                        onChange={(v: string) => updateFields({ campaignName: v })}
                        placeholder="Ex: Black Friday 2026..."
                    />

                    <InputField
                        label="PI / Identificador"
                        icon={Hash}
                        value={formData.pi}
                        onChange={(v: string) => updateFields({ pi: v })}
                        placeholder="Ex: 991"
                    />
                </section>

                {/* Section: Segmentação */}
                <section className="space-y-6">
                    <h2
                        className="text-2xl font-bold tracking-tight"
                        style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
                    >
                        <span className="text-gradient">Segmentação</span>
                    </h2>

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
                                <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                                    Início
                                </label>
                                <input
                                    type="date"
                                    value={formData.flightStart}
                                    onChange={e => updateFields({ flightStart: e.target.value })}
                                    className="w-full rounded-xl p-4 outline-none transition-all font-medium"
                                    style={{ background: 'var(--bg-tertiary)', border: '2px solid transparent', color: 'var(--text-primary)' }}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                                    Fim
                                </label>
                                <input
                                    type="date"
                                    value={formData.flightEnd}
                                    onChange={e => updateFields({ flightEnd: e.target.value })}
                                    className="w-full rounded-xl p-4 outline-none transition-all font-medium"
                                    style={{ background: 'var(--bg-tertiary)', border: '2px solid transparent', color: 'var(--text-primary)' }}
                                />
                            </div>
                        </div>
                    </div>
                </section>

                {/* Section: Veiculação */}
                <section className="space-y-6">
                    <h2
                        className="text-2xl font-bold tracking-tight"
                        style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
                    >
                        <span className="text-gradient">Veiculação</span>
                    </h2>

                    <InputField
                        label="URL Alvo"
                        icon={Globe}
                        value={formData.url}
                        onChange={(v: string) => updateFields({ url: v })}
                        placeholder="https://exemplo.com.br/materia"
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                                Dispositivo
                            </label>
                            <div className="flex gap-2 p-1.5 rounded-xl" style={{ background: 'var(--bg-tertiary)' }}>
                                <DeviceButton
                                    active={formData.device === 'desktop'}
                                    onClick={() => updateFields({ device: 'desktop' })}
                                    icon={Monitor}
                                    label="Desktop"
                                />
                                <DeviceButton
                                    active={formData.device === 'mobile'}
                                    onClick={() => updateFields({ device: 'mobile' })}
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
                                    value={formData.format}
                                    onChange={e => updateFields({ format: e.target.value })}
                                    className="w-full appearance-none rounded-xl p-4 pl-12 pr-10 outline-none transition-all font-medium"
                                    style={{
                                        background: 'var(--bg-tertiary)',
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
                </section>

                {/* Section: Automação */}
                <section className="space-y-6">
                    <h2
                        className="text-2xl font-bold tracking-tight"
                        style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
                    >
                        <span className="text-gradient">Automação</span>
                    </h2>

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
                                <p className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
                                    Ativar Agendamento diário
                                </p>
                                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
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
                </section>

                {/* Actions */}
                <div className="flex gap-4 pt-6" style={{ borderTop: '1px solid var(--border)' }}>
                    <button
                        onClick={() => router.back()}
                        className="px-8 py-5 rounded-xl font-bold transition-all"
                        style={{
                            background: 'var(--bg-tertiary)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--border)'
                        }}
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isPending}
                        className="flex-1 font-bold py-5 rounded-xl transition-all flex justify-center items-center gap-3 group disabled:opacity-50 text-white btn-glow"
                        style={{
                            background: 'var(--gradient-secondary)',
                            fontFamily: 'var(--font-display)'
                        }}
                    >
                        {isPending ? 'Salvando...' : (
                            <>
                                <Save size={20} />
                                Salvar Alterações
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}

// Reusable Components
function InputField({ label, icon: Icon, value, onChange, placeholder }: any) {
    return (
        <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                {label}
            </label>
            <div className="relative group">
                <Icon className="absolute left-4 top-1/2 -translate-y-1/2 transition-colors" size={18} style={{ color: 'var(--text-muted)' }} />
                <input
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    placeholder={placeholder}
                    className="w-full rounded-xl p-4 pl-12 outline-none transition-all font-medium"
                    style={{ background: 'var(--bg-tertiary)', border: '2px solid transparent', color: 'var(--text-primary)' }}
                    onFocus={e => {
                        e.currentTarget.style.borderColor = 'var(--secondary)'
                        e.currentTarget.style.boxShadow = '0 0 20px rgba(236, 72, 153, 0.2)'
                    }}
                    onBlur={e => {
                        e.currentTarget.style.borderColor = 'transparent'
                        e.currentTarget.style.boxShadow = 'none'
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
                background: active ? 'var(--gradient-secondary)' : 'transparent',
                color: active ? 'white' : 'var(--text-muted)',
                boxShadow: active ? '0 0 20px rgba(236, 72, 153, 0.3)' : 'none'
            }}
        >
            <Icon size={18} /> {label}
        </button>
    )
}
