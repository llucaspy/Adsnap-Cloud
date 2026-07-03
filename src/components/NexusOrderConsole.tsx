'use client'

import { FormEvent, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import {
    AlertTriangle,
    ArrowUp,
    Bot,
    CheckCircle2,
    Clock3,
    ExternalLink,
    FileArchive,
    Loader2,
    MessageSquare,
    RefreshCw,
    Sparkles,
    User,
    Zap,
} from 'lucide-react'
import {
    getNexusOrderJobs,
    submitNexusAssistantMessage,
    type NexusAssistantResponse,
} from '@/app/nexus/actions'

type NexusOrderJob = Awaited<ReturnType<typeof getNexusOrderJobs>>[number]

type ChatMessage = {
    id: string
    role: 'assistant' | 'user'
    text: string
    tone?: NexusAssistantResponse['tone']
    actions?: NexusAssistantResponse['actions']
    cards?: NexusAssistantResponse['cards']
}

const quickActions = [
    { label: 'Cadastrar order', command: 'Cadastrar order GAM: ' },
    { label: 'Prints geral', command: 'Disparar prints geral' },
    { label: 'Capturar PI', command: 'Capturar PI ' },
    { label: 'Baixar prints', command: 'Baixar prints PI ' },
]

const statusMap: Record<string, { label: string; color: string; icon: typeof Clock3 }> = {
    JOB_GAM_PENDING: { label: 'Fila', color: '#f59e0b', icon: Clock3 },
    JOB_GAM_RUNNING: { label: 'Rodando', color: '#93c5fd', icon: Loader2 },
    JOB_GAM_REVIEW: { label: 'Revisao', color: '#22c55e', icon: CheckCircle2 },
    JOB_GAM_ERROR: { label: 'Erro', color: '#ef4444', icon: AlertTriangle },
    JOB_GAM_CANCELLED: { label: 'Cancelado', color: '#a3a3a3', icon: Clock3 },
}

function newId() {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function buildWelcome(): ChatMessage {
    return {
        id: 'welcome',
        role: 'assistant',
        tone: 'info',
        text: 'Sou o Nexus. Pode falar comigo em linguagem natural: eu cadastro orders do GAM, disparo capturas, encontro campanhas e preparo downloads de prints.',
        actions: quickActions,
    }
}

function JobBadge({ level }: { level: string }) {
    const status = statusMap[level] || statusMap.JOB_GAM_PENDING
    const Icon = status.icon

    return (
        <span
            className="inline-flex items-center gap-1.5 px-2 py-1 text-[10px] font-black uppercase tracking-wider"
            style={{ color: status.color, background: 'rgba(255,255,255,0.06)', borderRadius: '999px' }}
        >
            <Icon size={11} className={level === 'JOB_GAM_RUNNING' ? 'animate-spin' : ''} />
            {status.label}
        </span>
    )
}

function MessageBubble({
    message,
    onCommand,
}: {
    message: ChatMessage
    onCommand: (command: string, mode?: 'prefill' | 'send') => void
}) {
    const isUser = message.role === 'user'

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
        >
            {!isUser && (
                <div className="w-9 h-9 shrink-0 flex items-center justify-center" style={{ background: '#1a1a1a', color: '#e5e5e5', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px' }}>
                    <Bot size={17} />
                </div>
            )}

            <div className={`max-w-[820px] min-w-0 ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-3`}>
                <div
                    className="px-4 py-3 text-sm leading-6"
                    style={{
                        background: isUser ? '#e5e5e5' : '#141414',
                        color: isUser ? '#0f0f0f' : '#e5e5e5',
                        border: isUser ? '1px solid #e5e5e5' : '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '8px',
                    }}
                >
                    {message.text}
                </div>

                {message.cards && message.cards.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 w-full">
                        {message.cards.map((card, index) => {
                            const content = (
                                <div
                                    className="p-3 text-left transition-colors hover:bg-white/[0.07]"
                                    style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px' }}
                                >
                                    <p className="text-sm font-black truncate" style={{ color: '#f5f5f5' }}>{card.title}</p>
                                    {card.description && <p className="mt-1 text-xs truncate" style={{ color: '#a3a3a3' }}>{card.description}</p>}
                                    {card.meta && <p className="mt-2 text-[11px] leading-4" style={{ color: '#737373' }}>{card.meta}</p>}
                                </div>
                            )

                            if (card.href) {
                                return (
                                    <Link key={`${card.title}-${index}`} href={card.href}>
                                        {content}
                                    </Link>
                                )
                            }

                            return (
                                <button key={`${card.title}-${index}`} type="button" onClick={() => card.command && onCommand(card.command, 'send')}>
                                    {content}
                                </button>
                            )
                        })}
                    </div>
                )}

                {message.actions && message.actions.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {message.actions.map((action, index) => {
                            const isPrimary = action.variant === 'primary'
                            const isDanger = action.variant === 'danger'
                            const style = {
                                background: isPrimary ? '#e5e5e5' : isDanger ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.06)',
                                color: isPrimary ? '#0f0f0f' : isDanger ? '#ef4444' : '#d4d4d4',
                                border: isPrimary ? '1px solid #e5e5e5' : '1px solid rgba(255,255,255,0.08)',
                                borderRadius: '8px',
                            }

                            if (action.href) {
                                return (
                                    <Link key={`${action.label}-${index}`} href={action.href} className="h-9 px-3 inline-flex items-center gap-2 text-xs font-black" style={style}>
                                        {action.label}
                                        <ExternalLink size={13} />
                                    </Link>
                                )
                            }

                            return (
                                <button
                                    key={`${action.label}-${index}`}
                                    type="button"
                                    onClick={() => action.command && onCommand(action.command, action.command.endsWith(' ') || action.command.endsWith(': ') ? 'prefill' : 'send')}
                                    className="h-9 px-3 inline-flex items-center gap-2 text-xs font-black"
                                    style={style}
                                >
                                    {action.label}
                                </button>
                            )
                        })}
                    </div>
                )}
            </div>

            {isUser && (
                <div className="w-9 h-9 shrink-0 flex items-center justify-center" style={{ background: '#e5e5e5', color: '#0f0f0f', borderRadius: '8px' }}>
                    <User size={16} />
                </div>
            )}
        </motion.div>
    )
}

function RecentJobs({ jobs, onRefresh, isRefreshing }: {
    jobs: NexusOrderJob[]
    onRefresh: () => void
    isRefreshing: boolean
}) {
    const metrics = useMemo(() => ({
        pending: jobs.filter(job => job.level === 'JOB_GAM_PENDING').length,
        running: jobs.filter(job => job.level === 'JOB_GAM_RUNNING').length,
        review: jobs.filter(job => job.level === 'JOB_GAM_REVIEW').length,
        error: jobs.filter(job => job.level === 'JOB_GAM_ERROR').length,
    }), [jobs])

    return (
        <aside className="space-y-3">
            <div className="p-4" style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px' }}>
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: '#737373' }}>Pulso</p>
                        <p className="mt-1 text-sm font-black" style={{ color: '#e5e5e5' }}>Jobs GAM</p>
                    </div>
                    <button
                        type="button"
                        onClick={onRefresh}
                        className="w-9 h-9 flex items-center justify-center"
                        style={{ color: '#a3a3a3', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px' }}
                        title="Atualizar"
                    >
                        <RefreshCw size={15} className={isRefreshing ? 'animate-spin' : ''} />
                    </button>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-4">
                    {[
                        ['Fila', metrics.pending],
                        ['Exec.', metrics.running],
                        ['Rev.', metrics.review],
                        ['Erro', metrics.error],
                    ].map(([label, value]) => (
                        <div key={label} className="px-3 py-2" style={{ background: '#0f0f0f', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#737373' }}>{label}</p>
                            <p className="text-lg font-black" style={{ color: '#f5f5f5' }}>{value}</p>
                        </div>
                    ))}
                </div>
            </div>

            <div className="space-y-2">
                {jobs.slice(0, 7).map(job => (
                    <Link
                        key={job.id}
                        href={job.level === 'JOB_GAM_REVIEW' ? `/campaigns?jobId=${encodeURIComponent(job.id)}` : '/workers'}
                        className="block p-3 transition-colors hover:bg-white/[0.07]"
                        style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px' }}
                    >
                        <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-black truncate" style={{ color: '#e5e5e5' }}>Order {job.orderId || 'GAM'}</p>
                            <JobBadge level={job.level} />
                        </div>
                        <p className="mt-2 text-[11px] truncate" style={{ color: '#737373' }}>{job.client || job.message}</p>
                    </Link>
                ))}

                {jobs.length === 0 && (
                    <div className="p-5 text-center" style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px' }}>
                        <FileArchive size={20} className="mx-auto" style={{ color: '#737373' }} />
                        <p className="mt-2 text-xs font-bold" style={{ color: '#a3a3a3' }}>Sem jobs recentes</p>
                    </div>
                )}
            </div>
        </aside>
    )
}

export function NexusOrderConsole({ initialJobs }: { initialJobs: NexusOrderJob[] }) {
    const [jobs, setJobs] = useState(initialJobs)
    const [messages, setMessages] = useState<ChatMessage[]>([buildWelcome()])
    const [input, setInput] = useState('')
    const [isPending, startTransition] = useTransition()
    const [isRefreshing, setIsRefreshing] = useState(false)
    const bottomRef = useRef<HTMLDivElement | null>(null)

    async function refreshJobs() {
        setIsRefreshing(true)
        try {
            setJobs(await getNexusOrderJobs())
        } finally {
            setIsRefreshing(false)
        }
    }

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }, [messages, isPending])

    useEffect(() => {
        const interval = window.setInterval(() => {
            refreshJobs().catch(() => null)
        }, 9000)
        return () => window.clearInterval(interval)
    }, [])

    function sendMessage(rawMessage?: string) {
        const content = (rawMessage ?? input).trim()
        if (!content || isPending) return

        setInput('')
        setMessages(current => [
            ...current,
            { id: newId(), role: 'user', text: content },
        ])

        startTransition(async () => {
            try {
                const response = await submitNexusAssistantMessage(content)
                setMessages(current => [
                    ...current,
                    { id: newId(), role: 'assistant', ...response },
                ])
                await refreshJobs()
            } catch (error) {
                setMessages(current => [
                    ...current,
                    {
                        id: newId(),
                        role: 'assistant',
                        tone: 'error',
                        text: error instanceof Error ? error.message : 'Nao consegui executar essa acao agora.',
                    },
                ])
            }
        })
    }

    function handleCommand(command: string, mode: 'prefill' | 'send' = 'send') {
        if (mode === 'prefill') {
            setInput(command)
            return
        }
        sendMessage(command)
    }

    function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        sendMessage()
    }

    return (
        <div className="space-y-5">
            <motion.header
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col lg:flex-row lg:items-end justify-between gap-4"
            >
                <div>
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em]" style={{ color: '#e5e5e5', background: 'rgba(255,255,255,0.08)', borderRadius: '999px' }}>
                        <Sparkles size={13} />
                        Nexus Assistant
                    </div>
                    <h1 className="mt-4 text-3xl md:text-5xl font-black tracking-tight leading-none" style={{ color: '#ffffff' }}>
                        Comande o worker por chat.
                    </h1>
                </div>
            </motion.header>

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4">
                <section className="min-h-[680px] flex flex-col overflow-hidden" style={{ background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px' }}>
                    <div className="px-4 py-3 flex items-center justify-between gap-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', background: '#141414' }}>
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 flex items-center justify-center" style={{ background: '#e5e5e5', color: '#0f0f0f', borderRadius: '8px' }}>
                                <MessageSquare size={17} />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-black truncate" style={{ color: '#f5f5f5' }}>Nexus</p>
                                <p className="text-[11px] truncate" style={{ color: '#737373' }}>Orders, capturas, workers e books</p>
                            </div>
                        </div>
                        <div className="hidden sm:flex gap-2">
                            {quickActions.slice(0, 3).map(action => (
                                <button
                                    key={action.label}
                                    type="button"
                                    onClick={() => handleCommand(action.command, action.command.endsWith(' ') || action.command.endsWith(': ') ? 'prefill' : 'send')}
                                    className="h-9 px-3 inline-flex items-center gap-2 text-xs font-black"
                                    style={{ color: '#d4d4d4', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px' }}
                                >
                                    {action.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5">
                        <AnimatePresence initial={false}>
                            {messages.map(message => (
                                <MessageBubble key={message.id} message={message} onCommand={handleCommand} />
                            ))}
                        </AnimatePresence>

                        {isPending && (
                            <div className="flex items-center gap-3 pl-12">
                                <Loader2 size={16} className="animate-spin" style={{ color: '#a3a3a3' }} />
                                <span className="text-xs font-semibold" style={{ color: '#737373' }}>Nexus executando...</span>
                            </div>
                        )}
                        <div ref={bottomRef} />
                    </div>

                    <form onSubmit={handleSubmit} className="p-4" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', background: '#141414' }}>
                        <div className="flex items-end gap-2">
                            <textarea
                                value={input}
                                onChange={event => setInput(event.target.value)}
                                onKeyDown={event => {
                                    if (event.key === 'Enter' && !event.shiftKey) {
                                        event.preventDefault()
                                        sendMessage()
                                    }
                                }}
                                placeholder="Ex.: cadastre essa order..., dispare prints geral, capture PI 402716, baixe prints PI 402716"
                                rows={1}
                                className="min-h-12 max-h-32 flex-1 resize-none px-4 py-3 outline-none text-sm"
                                style={{ background: '#0f0f0f', color: '#e5e5e5', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '8px' }}
                            />
                            <button
                                type="submit"
                                disabled={isPending || !input.trim()}
                                className="w-12 h-12 shrink-0 inline-flex items-center justify-center disabled:opacity-40"
                                style={{ background: '#e5e5e5', color: '#0f0f0f', borderRadius: '8px' }}
                                title="Enviar"
                            >
                                {isPending ? <Loader2 size={18} className="animate-spin" /> : <ArrowUp size={18} />}
                            </button>
                        </div>
                    </form>
                </section>

                <div className="space-y-4">
                    <div className="p-4" style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px' }}>
                        <div className="flex items-center gap-2">
                            <Zap size={16} style={{ color: '#e5e5e5' }} />
                            <p className="text-sm font-black" style={{ color: '#e5e5e5' }}>Acoes rapidas</p>
                        </div>
                        <div className="grid grid-cols-1 gap-2 mt-4">
                            {quickActions.map(action => (
                                <button
                                    key={action.label}
                                    type="button"
                                    onClick={() => handleCommand(action.command, action.command.endsWith(' ') || action.command.endsWith(': ') ? 'prefill' : 'send')}
                                    className="h-10 px-3 text-left text-xs font-black transition-colors hover:bg-white/[0.07]"
                                    style={{ color: '#d4d4d4', background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px' }}
                                >
                                    {action.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <RecentJobs jobs={jobs} onRefresh={() => refreshJobs()} isRefreshing={isRefreshing} />
                </div>
            </div>
        </div>
    )
}
