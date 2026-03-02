'use client'

import React, { useState, useEffect } from 'react'
import { Settings as SettingsIcon, Save, RotateCcw, Zap, Globe, Gauge, ShieldAlert, Cpu, Layers } from 'lucide-react'
import { getSettings, updateSettings } from '@/app/actions'

export function SettingsView() {
    const [settings, setSettings] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState('')

    useEffect(() => {
        async function fetchSettings() {
            const data = await getSettings()
            setSettings(data)
            setLoading(false)
        }
        fetchSettings()
    }, [])

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)
        setMessage('')
        try {
            await updateSettings(settings)
            setMessage('Configurações salvas com sucesso!')
            setTimeout(() => setMessage(''), 3000)
        } catch (error) {
            setMessage('Erro ao salvar configurações.')
        } finally {
            setSaving(false)
        }
    }

    if (loading) return <div className="p-8 text-center animate-pulse text-white/50">Sincronizando com o Nexus...</div>

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-slide-up pb-20">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-4xl font-black text-white flex items-center gap-3">
                        <SettingsIcon className="w-8 h-8 text-white/60" />
                        Configurações
                    </h1>
                    <p className="text-white/40 mt-1">Controle os parâmetros profundos do motor Nexus.</p>
                </div>
                {message && (
                    <div className="px-4 py-2 bg-white/8 border border-white/20 text-white text-sm font-bold rounded-xl">
                        {message}
                    </div>
                )}
            </div>

            <form onSubmit={handleSave} className="space-y-6">
                {/* Nexus Core Group */}
                <div className="glass-panel p-8 space-y-6">
                    <div className="flex items-center gap-3 mb-2">
                        <Cpu className="w-5 h-5 text-white/50" />
                        <h2 className="text-xl font-bold text-white">Nexus Core</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-2">
                            <label className="text-xs font-black uppercase tracking-widest text-white/40">Máximo de Retentativas</label>
                            <input
                                type="number"
                                value={settings.nexusMaxRetries}
                                onChange={e => setSettings({ ...settings, nexusMaxRetries: parseInt(e.target.value) })}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/30 transition-all"
                            />
                            <p className="text-[10px] text-white/20 italic">Quantas vezes o Nexus tentará recapturar um banner falho.</p>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-black uppercase tracking-widest text-white/40">Timeout de Navegação (ms)</label>
                            <input
                                type="number"
                                value={settings.nexusTimeout}
                                onChange={e => setSettings({ ...settings, nexusTimeout: parseInt(e.target.value) })}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/30 transition-all"
                            />
                            <p className="text-[10px] text-white/20 italic">Tempo limite para carregar o site alvo.</p>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-black uppercase tracking-widest text-white/40">Delay de Estabilização (ms)</label>
                            <input
                                type="number"
                                value={settings.nexusDelay}
                                onChange={e => setSettings({ ...settings, nexusDelay: parseInt(e.target.value) })}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/30 transition-all"
                            />
                            <p className="text-[10px] text-white/20 italic">Aguardar estabilização do layout antes de disparar o print.</p>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-black uppercase tracking-widest text-white/40">Polling de Atividade (ms)</label>
                            <input
                                type="number"
                                value={settings.feedPollingRate}
                                onChange={e => setSettings({ ...settings, feedPollingRate: parseInt(e.target.value) })}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/30 transition-all"
                            />
                        </div>
                    </div>
                </div>

                {/* Storage Monitoring Group */}
                <div className="glass-panel p-8 space-y-6">
                    <div className="flex items-center gap-3 mb-2">
                        <Gauge className="w-5 h-5 text-white/50" />
                        <h2 className="text-xl font-bold text-white">Monitoramento de Armazenamento</h2>
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-xs font-black uppercase tracking-widest text-white/40">Frequência de Verificação (Horas)</label>
                            <div className="flex items-center gap-4">
                                <input
                                    type="range"
                                    min="1"
                                    max="168"
                                    step="1"
                                    value={settings.storageCheckFrequency || 24}
                                    onChange={e => setSettings({ ...settings, storageCheckFrequency: parseInt(e.target.value) })}
                                    className="flex-1 h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer"
                                />
                                <span className="text-sm font-bold text-white/70 min-w-[3rem] text-right">
                                    {settings.storageCheckFrequency || 24}h
                                </span>
                            </div>
                            <p className="text-[10px] text-white/20 italic">
                                Define o intervalo em que o Nexus verificará o uso do Supabase e disparará alertas por e-mail.
                                <br />
                                24h = Diário | 168h = Semanal
                            </p>
                        </div>
                    </div>
                </div>

                {/* Automation & UI Group */}
                <div className="glass-panel p-8">
                    <div className="flex items-center gap-3 mb-6">
                        <Globe className="w-5 h-5 text-white/50" />
                        <h2 className="text-xl font-bold text-white">Integrações</h2>
                    </div>

                    <div className="space-y-4">
                        <label className="text-xs font-black uppercase tracking-widest text-white/40">Webhook Alerta (Discord/Slack)</label>
                        <input
                            type="text"
                            placeholder="https://hooks.slack.com/services/..."
                            value={settings.webhookUrl || ''}
                            onChange={e => setSettings({ ...settings, webhookUrl: e.target.value })}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-xs focus:outline-none focus:border-white/30 transition-all"
                        />
                    </div>
                </div>

                {/* Banner Format Manager */}
                <div className="glass-panel p-8 space-y-6">
                    <div className="flex items-center gap-3 mb-2">
                        <Layers className="w-5 h-5 text-white/50" />
                        <h2 className="text-xl font-bold text-white">Formatos & Seletores</h2>
                    </div>
                    <p className="text-sm text-white/50">
                        Defina os formatos de banner e seus seletores CSS correspondentes. O Nexus usará o seletor exato para capturar o anúncio.
                    </p>

                    <BannerFormatManager
                        formats={(() => {
                            try { return JSON.parse(settings.bannerFormats || '[]') }
                            catch { return [] }
                        })()}
                        onChange={(newFormats) => setSettings({ ...settings, bannerFormats: JSON.stringify(newFormats) })}
                    />
                </div>
                <div className="pt-4 flex justify-end">
                    <button
                        type="submit"
                        disabled={saving}
                        className="bg-white hover:bg-gray-100 text-black font-bold py-3 px-8 rounded-xl transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100 flex items-center gap-2"
                    >
                        {saving ? (
                            <>
                                <RotateCcw className="w-5 h-5 animate-spin" />
                                Salvando...
                            </>
                        ) : (
                            <>
                                <Save className="w-5 h-5" />
                                Salvar Alterações
                            </>
                        )}
                    </button>
                </div>
            </form >
        </div >
    )
}

function Toggle({ enabled, onChange }: { enabled: boolean, onChange: (v: boolean) => void }) {
    return (
        <button
            onClick={(e) => { e.preventDefault(); onChange(!enabled); }}
            className={`w-12 h-6 rounded-full p-1 transition-colors relative ${enabled ? 'bg-white/70' : 'bg-white/10'}`}
        >
            <div className={`w-4 h-4 rounded-full bg-white transition-all transform ${enabled ? 'translate-x-6' : 'translate-x-0'}`} />
        </button>
    )
}

import { Trash2, Plus } from 'lucide-react'

interface BannerFormat {
    id: string
    label: string
    width: number
    height: number
    selector: string
}

function BannerFormatManager({ formats, onChange }: { formats: BannerFormat[], onChange: (f: BannerFormat[]) => void }) {
    const [newFormat, setNewFormat] = useState<Partial<BannerFormat>>({ label: '', width: 300, height: 250, selector: '' })

    const addFormat = () => {
        if (!newFormat.label || !newFormat.selector) return
        const format: BannerFormat = {
            id: crypto.randomUUID(),
            label: newFormat.label,
            width: Number(newFormat.width),
            height: Number(newFormat.height),
            selector: newFormat.selector
        }
        onChange([...formats, format])
        setNewFormat({ label: '', width: 300, height: 250, selector: '' })
    }

    const removeFormat = (id: string) => {
        onChange(formats.filter(f => f.id !== id))
    }

    return (
        <div className="space-y-4">
            {/* List */}
            <div className="space-y-2">
                {formats.map(format => (
                    <div key={format.id} className="flex items-center gap-3 bg-white/5 p-3 rounded-xl border border-white/10">
                        <div className="flex-1">
                            <p className="font-bold text-white text-sm">{format.label}</p>
                            <p className="text-xs text-white/50">{format.width}x{format.height} • <code className="bg-black/30 px-1 rounded text-white/60">{format.selector}</code></p>
                        </div>
                        <button
                            type="button"
                            onClick={() => removeFormat(format.id)}
                            className="p-2 hover:bg-red-500/20 text-white/30 hover:text-red-400 rounded-lg transition-colors"
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>
                ))}
            </div>

            {/* Add New */}
            <div className="grid grid-cols-12 gap-2 bg-black/20 p-4 rounded-xl border border-white/5">
                <div className="col-span-3">
                    <label className="text-[10px] uppercase font-bold text-white/30">Nome</label>
                    <input
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm text-white"
                        placeholder="Ex: Billboard"
                        value={newFormat.label}
                        onChange={e => setNewFormat({ ...newFormat, label: e.target.value })}
                    />
                </div>
                <div className="col-span-2">
                    <label className="text-[10px] uppercase font-bold text-white/30">Largura</label>
                    <input
                        type="number"
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm text-white"
                        value={newFormat.width}
                        onChange={e => setNewFormat({ ...newFormat, width: Number(e.target.value) })}
                    />
                </div>
                <div className="col-span-2">
                    <label className="text-[10px] uppercase font-bold text-white/30">Altura</label>
                    <input
                        type="number"
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm text-white"
                        value={newFormat.height}
                        onChange={e => setNewFormat({ ...newFormat, height: Number(e.target.value) })}
                    />
                </div>
                <div className="col-span-4">
                    <label className="text-[10px] uppercase font-bold text-white/30">Seletor (CSS ou XPath)</label>
                    <input
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm text-white font-mono"
                        placeholder="#id ou //div[@id='...']"
                        value={newFormat.selector}
                        onChange={e => setNewFormat({ ...newFormat, selector: e.target.value })}
                    />
                </div>
                <div className="col-span-1 flex items-end">
                    <button
                        type="button"
                        onClick={addFormat}
                        disabled={!newFormat.label || !newFormat.selector}
                        className="w-full h-[30px] bg-white hover:bg-gray-100 text-black rounded-lg flex items-center justify-center disabled:opacity-50 transition-colors"
                    >
                        <Plus size={16} />
                    </button>
                </div>
            </div>
        </div>
    )
}
