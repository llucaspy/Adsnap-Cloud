'use client'

import React, { useState, useEffect } from 'react'
import { Settings as SettingsIcon, Save, RotateCcw, Globe, Gauge, Cpu, Layers, Send, MessageCircle, Trash2, Plus } from 'lucide-react'
import { getSettings, updateSettings, testTelegramNotification } from '@/app/actions'

/* ─── tokens ─────────────────────────────────────── */
const C = {
    bg: '#faf9f7',
    surface: '#f3f0ea',
    card: '#ede9e1',
    border: '#e8e5df',
    text: '#1c1917',
    muted: '#a89f8c',
    dim: '#d4cfc7',
}

/* ─── shared helpers ──────────────────────────────── */
const inputClass = {
    width: '100%',
    background: '#faf9f7',
    border: `0.5px solid ${C.border}`,
    borderRadius: 6,
    padding: '10px 14px',
    color: C.text,
    fontSize: 13,
    fontFamily: 'var(--font-body)',
    outline: 'none',
    transition: 'border-color 0.2s',
}

const panelStyle = {
    background: '#faf9f7',
    border: `0.5px solid ${C.border}`,
    borderRadius: 8,
    padding: 28,
    marginBottom: 0,
}

const labelStyle = {
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.12em',
    color: C.muted,
    display: 'block',
    marginBottom: 6,
}

const hintStyle = { fontSize: 11, color: C.dim, marginTop: 4, fontStyle: 'italic' as const }

export function SettingsView() {
    const [settings, setSettings] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState('')

    useEffect(() => {
        getSettings().then(data => { setSettings(data); setLoading(false) })
    }, [])

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)
        setMessage('')
        try {
            await updateSettings(settings)
            setMessage('Configurações salvas com sucesso!')
            setTimeout(() => setMessage(''), 3000)
        } catch {
            setMessage('Erro ao salvar configurações.')
        } finally {
            setSaving(false)
        }
    }

    if (loading) return (
        <div style={{ padding: 40, textAlign: 'center', color: C.muted, fontSize: 13 }}>
            Carregando configurações…
        </div>
    )

    return (
        <div style={{ maxWidth: 800, margin: '0 auto', paddingBottom: 80 }}>
            {/* Header */}
            <div style={{ marginBottom: 32, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <SettingsIcon size={20} style={{ color: C.muted }} />
                        <h1 style={{ fontSize: 28, fontWeight: 800, color: C.text, letterSpacing: '-0.5px', fontFamily: 'var(--font-display)' }}>
                            Configurações
                        </h1>
                    </div>
                    <p style={{ fontSize: 13, color: C.muted }}>Parâmetros do motor Nexus e integrações externas.</p>
                </div>
                {message && (
                    <div style={{ padding: '8px 14px', background: '#ede9e1', border: `0.5px solid ${C.border}`, color: C.text, fontSize: 12, fontWeight: 600, borderRadius: 6 }}>
                        {message}
                    </div>
                )}
            </div>

            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Nexus Core */}
                <section style={panelStyle}>
                    <SectionTitle icon={Cpu} label="Nexus Core" />
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20, marginTop: 20 }}>
                        <Field label="Máximo de Retentativas" hint="Tentativas de recaptura em caso de falha.">
                            <input style={inputClass} type="number" value={settings.nexusMaxRetries}
                                onChange={e => setSettings({ ...settings, nexusMaxRetries: parseInt(e.target.value) })} />
                        </Field>
                        <Field label="Timeout de Navegação (ms)" hint="Tempo limite para carregar o site alvo.">
                            <input style={inputClass} type="number" value={settings.nexusTimeout}
                                onChange={e => setSettings({ ...settings, nexusTimeout: parseInt(e.target.value) })} />
                        </Field>
                        <Field label="Delay de Estabilização (ms)" hint="Aguardar layout antes do print.">
                            <input style={inputClass} type="number" value={settings.nexusDelay}
                                onChange={e => setSettings({ ...settings, nexusDelay: parseInt(e.target.value) })} />
                        </Field>
                        <Field label="Polling de Atividade (ms)">
                            <input style={inputClass} type="number" value={settings.feedPollingRate}
                                onChange={e => setSettings({ ...settings, feedPollingRate: parseInt(e.target.value) })} />
                        </Field>
                    </div>
                </section>

                {/* Storage Monitoring */}
                <section style={panelStyle}>
                    <SectionTitle icon={Gauge} label="Monitoramento de Armazenamento" />
                    <div style={{ marginTop: 20 }}>
                        <Field label={`Frequência de Verificação — ${settings.storageCheckFrequency || 24}h`}
                            hint="Intervalo para verificar uso do Supabase e disparar alertas. 24h = Diário | 168h = Semanal">
                            <input
                                type="range" min="1" max="168" step="1"
                                value={settings.storageCheckFrequency || 24}
                                onChange={e => setSettings({ ...settings, storageCheckFrequency: parseInt(e.target.value) })}
                                style={{ width: '100%', accentColor: C.text, cursor: 'pointer' }}
                            />
                        </Field>
                    </div>
                </section>

                {/* Integrações */}
                <section style={panelStyle}>
                    <SectionTitle icon={Globe} label="Integrações" />
                    <div style={{ marginTop: 20 }}>
                        <Field label="Webhook Alerta (Discord/Slack)">
                            <input style={inputClass} type="text" placeholder="https://hooks.slack.com/services/..."
                                value={settings.webhookUrl || ''}
                                onChange={e => setSettings({ ...settings, webhookUrl: e.target.value })} />
                        </Field>
                    </div>
                </section>

                {/* Telegram */}
                <section style={panelStyle}>
                    <SectionTitle icon={MessageCircle} label="Telegram Bot" badge="Gratuito" />
                    <p style={{ fontSize: 13, color: C.muted, marginTop: 4, marginBottom: 20 }}>
                        Receba alertas no Telegram quando houver erros de armazenamento, quarentena ou falhas críticas.
                    </p>
                    <Field label="Chat ID do Telegram"
                        hint={<>Para obter: envie uma mensagem ao bot e acesse <code style={{ background: C.card, padding: '1px 4px', borderRadius: 3, fontSize: 10 }}>https://api.telegram.org/bot{'{TOKEN}'}/getUpdates</code></>}>
                        <input style={{ ...inputClass, fontFamily: 'monospace' }} type="text" placeholder="Ex: 123456789"
                            value={settings.telegramChatId || ''}
                            onChange={e => setSettings({ ...settings, telegramChatId: e.target.value })} />
                    </Field>
                    <div style={{ marginTop: 12 }}>
                        <TelegramTestButton chatId={settings.telegramChatId} />
                    </div>
                </section>

                {/* Banner Formats */}
                <section style={panelStyle}>
                    <SectionTitle icon={Layers} label="Formatos & Seletores" />
                    <p style={{ fontSize: 13, color: C.muted, marginTop: 4, marginBottom: 20 }}>
                        Defina os formatos de banner e seus seletores CSS. O Nexus usa o seletor exato para capturar o anúncio.
                    </p>
                    <BannerFormatManager
                        formats={(() => { try { return JSON.parse(settings.bannerFormats || '[]') } catch { return [] } })()}
                        onChange={newFormats => setSettings({ ...settings, bannerFormats: JSON.stringify(newFormats) })}
                    />
                </section>

                <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 8 }}>
                    <button type="submit" disabled={saving} className="btn-primary"
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 28px', opacity: saving ? 0.6 : 1 }}>
                        {saving ? <><RotateCcw size={16} className="animate-spin" /> Salvando…</> : <><Save size={16} /> Salvar Alterações</>}
                    </button>
                </div>
            </form>
        </div>
    )
}

function SectionTitle({ icon: Icon, label, badge }: { icon: any, label: string, badge?: string }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon size={16} style={{ color: C.muted }} />
            <h2 style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{label}</h2>
            {badge && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', background: '#d1fae5', color: '#065f46', borderRadius: 999, border: '0.5px solid #6ee7b7' }}>
                    {badge}
                </span>
            )}
        </div>
    )
}

function Field({ label, hint, children }: { label: string, hint?: any, children: React.ReactNode }) {
    return (
        <div>
            <label style={labelStyle}>{label}</label>
            {children}
            {hint && <p style={hintStyle}>{hint}</p>}
        </div>
    )
}

function Toggle({ enabled, onChange }: { enabled: boolean, onChange: (v: boolean) => void }) {
    return (
        <button type="button" onClick={() => onChange(!enabled)}
            style={{
                width: 44, height: 24, borderRadius: 12, padding: 3, cursor: 'pointer', border: 'none',
                background: enabled ? C.text : C.border,
                transition: 'background 0.2s', position: 'relative',
            }}>
            <div style={{
                width: 18, height: 18, borderRadius: '50%', background: '#faf9f7',
                transition: 'transform 0.2s',
                transform: `translateX(${enabled ? 20 : 0}px)`,
            }} />
        </button>
    )
}

function TelegramTestButton({ chatId }: { chatId?: string }) {
    const [testing, setTesting] = useState(false)
    const [result, setResult] = useState<'success' | 'error' | null>(null)

    const handleTest = async () => {
        setTesting(true)
        setResult(null)
        try {
            const res = await testTelegramNotification()
            setResult(res.success ? 'success' : 'error')
        } catch { setResult('error') } finally {
            setTesting(false)
            setTimeout(() => setResult(null), 4000)
        }
    }

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button type="button" onClick={handleTest} disabled={testing || !chatId}
                style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 14px', background: '#eff6ff', color: '#2563eb',
                    border: '0.5px solid #bfdbfe', borderRadius: 6,
                    fontSize: 12, fontWeight: 600, cursor: chatId ? 'pointer' : 'not-allowed',
                    opacity: !chatId ? 0.5 : 1,
                }}>
                {testing ? <><RotateCcw size={14} className="animate-spin" /> Enviando…</> : <><Send size={14} /> Testar Notificação</>}
            </button>
            {result === 'success' && <span style={{ fontSize: 12, color: '#22c55e', fontWeight: 600 }}>✓ Mensagem enviada!</span>}
            {result === 'error' && <span style={{ fontSize: 12, color: '#ef4444', fontWeight: 600 }}>✗ Falha. Verifique Token e Chat ID.</span>}
            {!chatId && <span style={{ fontSize: 11, color: C.dim }}>Insira o Chat ID primeiro</span>}
        </div>
    )
}

interface BannerFormat { id: string; label: string; width: number; height: number; selector: string }

function BannerFormatManager({ formats, onChange }: { formats: BannerFormat[], onChange: (f: BannerFormat[]) => void }) {
    const [newFormat, setNewFormat] = useState<Partial<BannerFormat>>({ label: '', width: 300, height: 250, selector: '' })

    const addFormat = () => {
        if (!newFormat.label || !newFormat.selector) return
        onChange([...formats, { id: crypto.randomUUID(), label: newFormat.label!, width: Number(newFormat.width), height: Number(newFormat.height), selector: newFormat.selector! }])
        setNewFormat({ label: '', width: 300, height: 250, selector: '' })
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {formats.map(f => (
                <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f3f0ea', padding: '10px 14px', borderRadius: 6, border: `0.5px solid ${C.border}` }}>
                    <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{f.label}</p>
                        <p style={{ fontSize: 11, color: C.muted }}>{f.width}×{f.height} • <code style={{ background: C.card, padding: '1px 4px', borderRadius: 3 }}>{f.selector}</code></p>
                    </div>
                    <button type="button" onClick={() => onChange(formats.filter(x => x.id !== f.id))}
                        style={{ padding: 6, background: 'none', border: 'none', cursor: 'pointer', color: C.dim, borderRadius: 4 }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                        onMouseLeave={e => (e.currentTarget.style.color = C.dim)}>
                        <Trash2 size={14} />
                    </button>
                </div>
            ))}
            <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr 4fr auto', gap: 8, background: C.card, padding: 14, borderRadius: 6, border: `0.5px solid ${C.border}` }}>
                {[
                    { key: 'label', placeholder: 'Billboard', label: 'Nome', type: 'text' },
                    { key: 'width', placeholder: '300', label: 'Largura', type: 'number' },
                    { key: 'height', placeholder: '250', label: 'Altura', type: 'number' },
                    { key: 'selector', placeholder: "#id ou //div[@id='...']", label: 'Seletor', type: 'text' },
                ].map(({ key, placeholder, label, type }) => (
                    <div key={key}>
                        <label style={labelStyle}>{label}</label>
                        <input type={type} placeholder={placeholder} value={(newFormat as any)[key]}
                            onChange={e => setNewFormat({ ...newFormat, [key]: e.target.value })}
                            style={{ ...inputClass, fontFamily: key === 'selector' ? 'monospace' : 'inherit', fontSize: 12 }} />
                    </div>
                ))}
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button type="button" onClick={addFormat} disabled={!newFormat.label || !newFormat.selector}
                        style={{ width: 36, height: 36, borderRadius: 6, background: C.text, color: '#faf9f7', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Plus size={16} />
                    </button>
                </div>
            </div>
        </div>
    )
}
