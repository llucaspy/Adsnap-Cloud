'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Clock3, FileArchive, Mail, RefreshCw, Send, Settings2, XCircle } from 'lucide-react'
import {
    queueGovernmentReportManual,
    updateGovernmentReportSettings,
} from '@/app/admin/government-report-actions'

interface ReportDispatch {
    id: string
    status: string
    triggerMode: string
    lastSentAt: string | null
    errorMessage: string | null
    attachmentCount: number
    attachmentBytes: number
    attempts: number
}

interface GovernmentCampaign {
    pi: string
    client: string
    agency: string
    campaignName: string
    flightStart: string | null
    flightEnd: string | null
    formats: string[]
    printCount: number
    dispatch: ReportDispatch | null
}

interface Props {
    initialData: {
        settings: {
            recipients: string[]
            autoSend: boolean
            dispatchTime: string
        }
        campaigns: GovernmentCampaign[]
    }
}

function formatDate(value: string | null) {
    if (!value) return '-'
    return new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    }).format(new Date(value))
}

function formatBytes(value: number) {
    if (!value) return '0 MB'
    return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function StatusBadge({ dispatch }: { dispatch: ReportDispatch | null }) {
    const status = dispatch?.status || 'NOT_SENT'
    const styles: Record<string, { label: string; icon: typeof Clock3; className: string }> = {
        NOT_SENT: { label: 'Não enviado', icon: Clock3, className: 'border-white/10 bg-white/[0.04] text-white/40' },
        QUEUED_AUTO: { label: 'Na fila', icon: Clock3, className: 'border-amber-500/20 bg-amber-500/10 text-amber-400' },
        QUEUED_MANUAL: { label: 'Na fila', icon: Clock3, className: 'border-amber-500/20 bg-amber-500/10 text-amber-400' },
        PROCESSING: { label: 'Anexando', icon: RefreshCw, className: 'border-blue-500/20 bg-blue-500/10 text-blue-400' },
        SENT: { label: 'Enviado', icon: CheckCircle2, className: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400' },
        FAILED: { label: 'Falhou', icon: XCircle, className: 'border-red-500/20 bg-red-500/10 text-red-400' },
    }
    const config = styles[status] || styles.NOT_SENT
    const Icon = config.icon

    return (
        <span className={`inline-flex min-w-[104px] items-center justify-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${config.className}`}>
            <Icon size={12} className={status === 'PROCESSING' ? 'animate-spin' : ''} />
            {config.label}
        </span>
    )
}

export function GovernmentReportAdmin({ initialData }: Props) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [recipientsText, setRecipientsText] = useState(initialData.settings.recipients.join('\n'))
    const [autoSend, setAutoSend] = useState(initialData.settings.autoSend)
    const [dispatchTime, setDispatchTime] = useState(initialData.settings.dispatchTime)
    const [campaigns, setCampaigns] = useState(initialData.campaigns)
    const [busyPi, setBusyPi] = useState<string | null>(null)
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

    useEffect(() => {
        setCampaigns(initialData.campaigns)
    }, [initialData.campaigns])

    const recipients = useMemo(() => recipientsText
        .split(/[,;\n]/)
        .map(item => item.trim())
        .filter(Boolean), [recipientsText])

    const showFeedback = (type: 'success' | 'error', message: string) => {
        setFeedback({ type, message })
        window.setTimeout(() => setFeedback(null), 5000)
    }

    const saveSettings = () => {
        startTransition(async () => {
            try {
                await updateGovernmentReportSettings({ recipients, autoSend, dispatchTime })
                showFeedback('success', 'Configuração salva')
                router.refresh()
            } catch (error) {
                showFeedback('error', error instanceof Error ? error.message : 'Falha ao salvar')
            }
        })
    }

    const sendNow = (campaign: GovernmentCampaign) => {
        const destination = recipients.join(', ')
        if (!window.confirm(`Enviar agora os prints da PI ${campaign.pi} para ${destination}?`)) return

        setBusyPi(campaign.pi)
        startTransition(async () => {
            try {
                const result = await queueGovernmentReportManual(campaign.pi)
                if (!result.success) throw new Error(result.error || 'Falha ao enfileirar')
                setCampaigns(current => current.map(item => item.pi === campaign.pi
                    ? {
                        ...item,
                        dispatch: item.dispatch
                            ? { ...item.dispatch, status: 'QUEUED_MANUAL', errorMessage: null }
                            : {
                                id: '', status: 'QUEUED_MANUAL', triggerMode: 'MANUAL', lastSentAt: null,
                                errorMessage: null, attachmentCount: 0, attachmentBytes: 0, attempts: 0,
                            },
                    }
                    : item))
                showFeedback('success', result.message || 'Relatório enfileirado')
                router.refresh()
            } catch (error) {
                showFeedback('error', error instanceof Error ? error.message : 'Falha ao enfileirar')
            } finally {
                setBusyPi(null)
            }
        })
    }

    return (
        <section className="space-y-6 page-enter">
            <header className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04]">
                        <Mail size={18} className="text-white/70" />
                    </div>
                    <h2 className="text-2xl font-semibold text-white">Relatórios de Governo Federal</h2>
                </div>
                <p className="text-sm text-white/40">Envios finais com os prints da campanha em arquivo ZIP.</p>
            </header>

            {feedback && (
                <div className={`rounded-lg border px-4 py-3 text-sm font-medium ${feedback.type === 'success'
                    ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                    : 'border-red-500/20 bg-red-500/10 text-red-400'}`}>
                    {feedback.message}
                </div>
            )}

            <div className="grid gap-6 border-y border-white/8 py-6 lg:grid-cols-[minmax(0,1fr)_220px_180px]">
                <div className="space-y-2">
                    <label htmlFor="government-report-recipients" className="text-xs font-semibold text-white/60">
                        Destinatários fixos
                    </label>
                    <textarea
                        id="government-report-recipients"
                        rows={3}
                        value={recipientsText}
                        onChange={event => setRecipientsText(event.target.value)}
                        className="w-full resize-none rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2.5 font-mono text-sm text-white outline-none transition-colors focus:border-[#7c3aed]"
                    />
                </div>

                <div className="space-y-2">
                    <label htmlFor="government-report-time" className="text-xs font-semibold text-white/60">
                        Horário do dia seguinte
                    </label>
                    <input
                        id="government-report-time"
                        type="time"
                        value={dispatchTime}
                        onChange={event => setDispatchTime(event.target.value)}
                        className="h-11 w-full rounded-lg border border-white/15 bg-white/[0.04] px-3 text-sm text-white outline-none transition-colors focus:border-[#7c3aed]"
                    />
                </div>

                <div className="flex flex-col justify-end gap-3">
                    <label className="flex h-11 cursor-pointer items-center justify-between rounded-lg border border-white/10 bg-white/[0.04] px-3">
                        <span className="text-sm font-medium text-white/70">Automático</span>
                        <input
                            type="checkbox"
                            checked={autoSend}
                            onChange={event => setAutoSend(event.target.checked)}
                            className="h-4 w-4 accent-[#7c3aed]"
                        />
                    </label>
                    <button
                        type="button"
                        onClick={saveSettings}
                        disabled={isPending}
                        className="flex h-11 items-center justify-center gap-2 rounded-lg bg-[#7c3aed] px-4 text-sm font-medium text-white transition-all hover:-translate-y-px hover:bg-[#6d28d9] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <Settings2 size={16} />
                        Salvar configuração
                    </button>
                </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-white/8 bg-[#141414]">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[920px] border-collapse text-left">
                        <thead className="bg-white/[0.025]">
                            <tr className="border-b border-white/8 text-[11px] font-semibold text-white/35">
                                <th className="px-4 py-3">Campanha</th>
                                <th className="px-4 py-3">Veiculação</th>
                                <th className="px-4 py-3 text-center">Prints</th>
                                <th className="px-4 py-3 text-center">Status</th>
                                <th className="px-4 py-3 text-right">Ação</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/8">
                            {campaigns.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-white/35">
                                        Nenhuma campanha de Governo Federal com data final cadastrada.
                                    </td>
                                </tr>
                            ) : campaigns.map(campaign => {
                                const dispatch = campaign.dispatch
                                const processing = ['PROCESSING', 'QUEUED_AUTO', 'QUEUED_MANUAL'].includes(dispatch?.status || '')
                                const isBusy = busyPi === campaign.pi

                                return (
                                    <tr key={campaign.pi} className="transition-colors hover:bg-white/[0.025]">
                                        <td className="px-4 py-4">
                                            <div className="max-w-[360px]">
                                                <p className="truncate text-sm font-semibold text-white">{campaign.client}</p>
                                                <p className="mt-1 truncate text-xs text-white/40">
                                                    {campaign.campaignName || 'Sem nome'} · PI {campaign.pi} · {campaign.formats.length} formato(s)
                                                </p>
                                                {dispatch?.errorMessage && (
                                                    <p className="mt-1 max-w-[360px] truncate text-xs text-red-400" title={dispatch.errorMessage}>
                                                        {dispatch.errorMessage}
                                                    </p>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-4 text-xs text-white/50">
                                            {formatDate(campaign.flightStart)} a {formatDate(campaign.flightEnd)}
                                        </td>
                                        <td className="px-4 py-4 text-center">
                                            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-white/70">
                                                <FileArchive size={14} />
                                                {campaign.printCount}
                                            </span>
                                            {dispatch && dispatch.attachmentBytes > 0 && (
                                                <p className="mt-1 text-[10px] text-white/30">{formatBytes(dispatch.attachmentBytes)}</p>
                                            )}
                                        </td>
                                        <td className="px-4 py-4 text-center">
                                            <StatusBadge dispatch={dispatch} />
                                            {dispatch?.lastSentAt && (
                                                <p className="mt-1.5 text-[10px] text-white/30">{formatDate(dispatch.lastSentAt)}</p>
                                            )}
                                        </td>
                                        <td className="px-4 py-4 text-right">
                                            <button
                                                type="button"
                                                onClick={() => sendNow(campaign)}
                                                disabled={campaign.printCount === 0 || processing || isBusy}
                                                title={campaign.printCount === 0 ? 'Campanha sem prints disponíveis' : 'Enviar relatório agora'}
                                                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/[0.04] px-3 text-xs font-medium text-white/70 transition-all hover:border-[#7c3aed] hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                                            >
                                                {isBusy ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                                                {dispatch?.status === 'SENT' ? 'Reenviar' : 'Enviar agora'}
                                            </button>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </section>
    )
}
