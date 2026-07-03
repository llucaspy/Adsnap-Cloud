'use client'

import { FormEvent, useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import {
    ArrowUp,
    Bot,
    ExternalLink,
    Loader2,
    Maximize2,
    MessageSquare,
    Minus,
    Rocket,
    Sparkles,
    X,
} from 'lucide-react'
import { submitNexusAssistantMessage, type NexusAssistantResponse } from '@/app/nexus/actions'

type FloatingMessage = {
    id: string
    role: 'assistant' | 'user'
    text: string
    tone?: NexusAssistantResponse['tone']
    actions?: NexusAssistantResponse['actions']
    cards?: NexusAssistantResponse['cards']
}

const quickActions = [
    { label: 'Order GAM', command: 'Cadastrar order GAM: ' },
    { label: 'Prints geral', command: 'Disparar prints geral' },
    { label: 'Capturar PI', command: 'Capturar PI ' },
    { label: 'Baixar ZIP', command: 'Baixar prints PI ' },
]

function newId() {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function initialMessage(): FloatingMessage {
    return {
        id: 'mission-start',
        role: 'assistant',
        tone: 'info',
        text: 'Nexus em orbita. Me diga o que devo executar: cadastrar order, disparar prints, capturar um PI ou preparar download.',
        actions: quickActions,
    }
}

function AstronautHelmet({ compact = false }: { compact?: boolean }) {
    const size = compact ? 44 : 56

    return (
        <div
            aria-hidden="true"
            className="relative shrink-0"
            style={{ width: size, height: size }}
        >
            <div
                className="absolute"
                style={{
                    inset: compact ? 5 : 6,
                    background: '#e5e5e5',
                    border: '1px solid rgba(255,255,255,0.16)',
                    borderRadius: '16px 16px 14px 14px',
                    boxShadow: 'rgba(0,0,0,0.30) 0px 8px 24px 0px',
                }}
            />
            <div
                className="absolute"
                style={{
                    left: compact ? 13 : 16,
                    top: compact ? 11 : 13,
                    width: compact ? 24 : 30,
                    height: compact ? 20 : 25,
                    background: '#0f0e17',
                    border: '2px solid #a3a3a3',
                    borderRadius: '55% 45% 42% 58%',
                    transform: 'rotate(-7deg)',
                    boxShadow: 'inset rgba(255,255,255,0.14) -8px -8px 18px',
                }}
            />
            <div
                className="absolute"
                style={{
                    left: compact ? 8 : 10,
                    top: compact ? 19 : 24,
                    width: compact ? 10 : 12,
                    height: compact ? 10 : 12,
                    border: '2px solid #737373',
                    background: '#f5f5f5',
                    borderRadius: '999px',
                }}
            />
            <div
                className="absolute"
                style={{
                    left: compact ? 13 : 16,
                    right: compact ? 9 : 12,
                    bottom: compact ? 8 : 10,
                    height: compact ? 6 : 7,
                    background: '#a3a3a3',
                    borderRadius: 8,
                    border: '1px solid #737373',
                }}
            />
            <motion.div
                className="absolute"
                style={{
                    right: compact ? -1 : -2,
                    top: compact ? 0 : -1,
                    width: compact ? 18 : 20,
                    height: compact ? 18 : 20,
                    border: '1px solid rgba(34,197,94,0.32)',
                    borderRadius: '999px',
                }}
                animate={{
                    scale: [1, 1.16, 1],
                    opacity: [0.72, 1, 0.72],
                }}
                transition={{
                    duration: 2.4,
                    repeat: Infinity,
                    ease: [0.16, 1, 0.3, 1],
                }}
            />
            <motion.div
                className="absolute"
                style={{
                    right: compact ? 3 : 2,
                    top: compact ? 4 : 3,
                    width: compact ? 10 : 12,
                    height: compact ? 10 : 12,
                    background: '#22c55e',
                    border: '2px solid #0f0f0f',
                    borderRadius: '999px',
                    boxShadow: 'rgba(34,197,94,0.32) 0px 0px 14px 2px',
                }}
                animate={{
                    boxShadow: [
                        'rgba(34,197,94,0.18) 0px 0px 8px 1px',
                        'rgba(34,197,94,0.36) 0px 0px 18px 3px',
                        'rgba(34,197,94,0.18) 0px 0px 8px 1px',
                    ],
                }}
                transition={{
                    duration: 2.4,
                    repeat: Infinity,
                    ease: [0.16, 1, 0.3, 1],
                }}
            />
        </div>
    )
}

function MissionAction({
    action,
    onCommand,
}: {
    action: NonNullable<NexusAssistantResponse['actions']>[number]
    onCommand: (command: string, mode?: 'prefill' | 'send') => void
}) {
    const isPrimary = action.variant === 'primary'
    const isDanger = action.variant === 'danger'
    const style = {
        background: isPrimary ? '#e5e5e5' : isDanger ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.06)',
        color: isPrimary ? '#0f0f0f' : isDanger ? '#ef4444' : '#e5e5e5',
        border: isPrimary ? '1px solid #e5e5e5' : '1px solid rgba(255,255,255,0.08)',
        borderRadius: 8,
    }

    if (action.href) {
        return (
            <Link href={action.href} className="h-9 px-3 inline-flex items-center gap-2 text-xs font-semibold transition-transform hover:-translate-y-0.5" style={style}>
                {action.label}
                <ExternalLink size={13} />
            </Link>
        )
    }

    return (
        <button
            type="button"
            onClick={() => action.command && onCommand(action.command, action.command.endsWith(' ') || action.command.endsWith(': ') ? 'prefill' : 'send')}
            className="h-9 px-3 inline-flex items-center gap-2 text-xs font-semibold transition-transform hover:-translate-y-0.5"
            style={style}
        >
            {action.label}
        </button>
    )
}

function MissionMessage({
    message,
    onCommand,
}: {
    message: FloatingMessage
    onCommand: (command: string, mode?: 'prefill' | 'send') => void
}) {
    const isUser = message.role === 'user'

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 12, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
        >
            {!isUser && (
                <div className="w-8 h-8 shrink-0 flex items-center justify-center" style={{ background: '#1a1a1a', color: '#e5e5e5', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }}>
                    <Bot size={15} />
                </div>
            )}
            <div className={`max-w-[86%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-2`}>
                <div
                    className="px-3 py-2.5 text-sm leading-5"
                    style={{
                        background: isUser ? '#e5e5e5' : 'rgba(255,255,255,0.05)',
                        color: isUser ? '#0f0f0f' : '#e5e5e5',
                        border: isUser ? '1px solid #e5e5e5' : '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 12,
                    }}
                >
                    {message.text}
                </div>

                {message.cards && message.cards.length > 0 && (
                    <div className="grid grid-cols-1 gap-2 w-full">
                        {message.cards.slice(0, 4).map((card, index) => {
                            const content = (
                                <div className="p-3 text-left transition-transform hover:-translate-y-0.5" style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 }}>
                                    <p className="text-xs font-semibold truncate" style={{ color: '#ffffff' }}>{card.title}</p>
                                    {card.description && <p className="mt-1 text-[11px] truncate" style={{ color: '#a3a3a3' }}>{card.description}</p>}
                                    {card.meta && <p className="mt-2 text-[10px] leading-4" style={{ color: '#737373' }}>{card.meta}</p>}
                                </div>
                            )

                            if (card.href) {
                                return <Link key={`${card.title}-${index}`} href={card.href}>{content}</Link>
                            }
                            return <button key={`${card.title}-${index}`} type="button" onClick={() => card.command && onCommand(card.command, 'send')}>{content}</button>
                        })}
                    </div>
                )}

                {message.actions && message.actions.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {message.actions.map((action, index) => (
                            <MissionAction key={`${action.label}-${index}`} action={action} onCommand={onCommand} />
                        ))}
                    </div>
                )}
            </div>
        </motion.div>
    )
}

export function NexusFloatingChat() {
    const pathname = usePathname()
    const isLoginPage = pathname?.startsWith('/login')
    const [isOpen, setIsOpen] = useState(false)
    const [messages, setMessages] = useState<FloatingMessage[]>([initialMessage()])
    const [input, setInput] = useState('')
    const [isPending, startTransition] = useTransition()
    const bottomRef = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }, [messages, isPending, isOpen])

    function sendMessage(rawMessage?: string) {
        const content = (rawMessage ?? input).trim()
        if (!content || isPending) return

        setInput('')
        setMessages(current => [...current, { id: newId(), role: 'user', text: content }])

        if (isLoginPage) {
            setMessages(current => [
                ...current,
                {
                    id: newId(),
                    role: 'assistant',
                    tone: 'warning',
                    text: 'Estou em stand-by na orbita. Entre na central para eu operar campanhas, workers, orders e downloads com seguranca.',
                    actions: [{ label: 'Entrar na central', href: '/login', variant: 'primary' }],
                },
            ])
            return
        }

        startTransition(async () => {
            try {
                const response = await submitNexusAssistantMessage(content)
                setMessages(current => [...current, { id: newId(), role: 'assistant', ...response }])
            } catch (error) {
                setMessages(current => [
                    ...current,
                    {
                        id: newId(),
                        role: 'assistant',
                        tone: 'error',
                        text: error instanceof Error ? error.message : 'Nao consegui executar essa missao agora.',
                    },
                ])
            }
        })
    }

    function handleCommand(command: string, mode: 'prefill' | 'send' = 'send') {
        setIsOpen(true)
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
        <div className="fixed bottom-5 right-5 sm:bottom-6 sm:right-6" style={{ zIndex: 2147483000 }}>
            <AnimatePresence>
                {isOpen && (
                    <motion.section
                        initial={{ opacity: 0, y: 20, scale: 0.96, filter: 'blur(8px)' }}
                        animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                        exit={{ opacity: 0, y: 16, scale: 0.97, filter: 'blur(6px)' }}
                        transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
                        className="fixed left-3 right-3 bottom-24 sm:left-auto sm:right-6 sm:bottom-24 sm:w-[520px] lg:w-[560px] h-[min(760px,calc(100vh-96px))] overflow-hidden"
                        style={{
                            background: '#0f0f0f',
                            border: '1px solid rgba(255,255,255,0.16)',
                            borderRadius: 20,
                            boxShadow: 'rgba(0,0,0,0.40) 0px 24px 64px -8px',
                            zIndex: 2147483000,
                        }}
                    >
                        <div
                            className="absolute inset-0 pointer-events-none opacity-60"
                            style={{
                                backgroundImage: 'radial-gradient(circle at 14px 18px, rgba(255,255,255,0.22) 1px, transparent 1px), radial-gradient(circle at 86px 54px, rgba(255,255,255,0.14) 1px, transparent 1px)',
                                backgroundSize: '120px 96px',
                            }}
                        />

                        <div className="relative h-full flex flex-col">
                            <header className="p-5 flex items-center justify-between gap-3" style={{ background: 'rgba(20,20,20,0.86)', backdropFilter: 'blur(16px) saturate(180%)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                <div className="flex items-center gap-3 min-w-0">
                                    <AstronautHelmet compact />
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="text-sm font-semibold truncate" style={{ color: '#ffffff' }}>Nexus Astronauta</p>
                                            <span className="px-2 py-0.5 text-[10px] font-semibold" style={{ color: '#22c55e', background: 'rgba(34,197,94,0.12)', borderRadius: 999 }}>online</span>
                                        </div>
                                        <p className="text-[11px] truncate" style={{ color: '#a3a3a3' }}>Central orbital do worker</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Link href="/nexus" className="w-8 h-8 flex items-center justify-center" style={{ color: '#a3a3a3', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }} title="Abrir Nexus">
                                        <Maximize2 size={14} />
                                    </Link>
                                    <button type="button" onClick={() => setIsOpen(false)} className="w-8 h-8 flex items-center justify-center" style={{ color: '#a3a3a3', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }} title="Minimizar">
                                        <Minus size={14} />
                                    </button>
                                </div>
                            </header>

                            <div className="relative flex-1 overflow-y-auto p-5 space-y-4">
                                <AnimatePresence initial={false}>
                                    {messages.map(message => (
                                        <MissionMessage key={message.id} message={message} onCommand={handleCommand} />
                                    ))}
                                </AnimatePresence>
                                {isPending && (
                                    <div className="flex items-center gap-2 pl-11">
                                        <Loader2 size={15} className="animate-spin" style={{ color: '#e5e5e5' }} />
                                        <span className="text-[11px] font-semibold" style={{ color: '#a3a3a3' }}>Calculando rota...</span>
                                    </div>
                                )}
                                <div ref={bottomRef} />
                            </div>

                            <div className="relative px-5 pb-3">
                                <div className="flex gap-2 overflow-x-auto pb-2">
                                    {quickActions.map(action => (
                                        <button
                                            key={action.label}
                                            type="button"
                                            onClick={() => handleCommand(action.command, action.command.endsWith(' ') || action.command.endsWith(': ') ? 'prefill' : 'send')}
                                            className="h-8 px-3 shrink-0 text-[11px] font-semibold transition-transform hover:-translate-y-0.5"
                                            style={{ color: '#e5e5e5', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }}
                                        >
                                            {action.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <form onSubmit={handleSubmit} className="relative p-5 pt-0" style={{ background: 'rgba(15,15,15,0.88)', backdropFilter: 'blur(16px) saturate(180%)' }}>
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
                                        rows={1}
                                        placeholder="Diga a missao para o Nexus..."
                                        className="min-h-11 max-h-28 flex-1 resize-none px-3 py-3 outline-none text-sm"
                                        style={{ background: 'rgba(255,255,255,0.04)', color: '#e5e5e5', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 8 }}
                                    />
                                    <button
                                        type="submit"
                                        disabled={isPending || !input.trim()}
                                        className="w-11 h-11 shrink-0 flex items-center justify-center disabled:opacity-40 transition-transform hover:-translate-y-0.5"
                                        style={{ background: '#e5e5e5', color: '#0f0f0f', border: '1px solid #e5e5e5', borderRadius: 8 }}
                                        title="Enviar missao"
                                    >
                                        {isPending ? <Loader2 size={17} className="animate-spin" /> : <ArrowUp size={18} />}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </motion.section>
                )}
            </AnimatePresence>

            <motion.button
                type="button"
                onClick={() => setIsOpen(current => !current)}
                initial={{ opacity: 0, y: 16, filter: 'blur(8px)' }}
                animate={{
                    opacity: 1,
                    y: 0,
                    filter: 'blur(0px)',
                    boxShadow: [
                        'rgba(0,0,0,0.30) 0px 8px 24px 0px, rgba(255,255,255,0.04) 0px 0px 0px 0px',
                        'rgba(0,0,0,0.34) 0px 12px 30px 0px, rgba(255,255,255,0.10) 0px 0px 0px 4px',
                        'rgba(0,0,0,0.30) 0px 8px 24px 0px, rgba(255,255,255,0.04) 0px 0px 0px 0px',
                    ],
                }}
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.97 }}
                transition={{
                    opacity: { duration: 0.42, ease: [0.16, 1, 0.3, 1] },
                    filter: { duration: 0.42, ease: [0.16, 1, 0.3, 1] },
                    y: { duration: 0.42, ease: [0.16, 1, 0.3, 1] },
                    boxShadow: { duration: 3.4, repeat: Infinity, ease: 'easeInOut' },
                }}
                className="relative w-16 h-16 sm:w-[72px] sm:h-[72px] flex items-center justify-center"
                style={{
                    background: '#141414',
                    border: '1px solid rgba(255,255,255,0.16)',
                    borderRadius: 20,
                }}
                aria-label={isOpen ? 'Fechar chat Nexus' : 'Abrir chat Nexus'}
            >
                <motion.span
                    aria-hidden="true"
                    className="absolute"
                    style={{
                        inset: -4,
                        border: '1px solid rgba(255,255,255,0.14)',
                        borderRadius: 24,
                    }}
                    animate={{
                        scale: [0.96, 1.06, 0.96],
                        opacity: [0.22, 0.58, 0.22],
                    }}
                    transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
                />
                <motion.span
                    aria-hidden="true"
                    className="absolute"
                    style={{
                        inset: 7,
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 16,
                    }}
                    animate={{ rotate: [0, 360] }}
                    transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
                />
                <span className="absolute -top-2 -left-2 w-7 h-7 flex items-center justify-center" style={{ background: '#e5e5e5', color: '#0f0f0f', borderRadius: 8, border: '1px solid rgba(255,255,255,0.16)' }}>
                    {isOpen ? <X size={15} /> : <Rocket size={15} />}
                </span>
                <AstronautHelmet />
                <span className="absolute -bottom-1 -right-1 w-7 h-7 flex items-center justify-center" style={{ background: '#1a1a1a', color: '#e5e5e5', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 8 }}>
                    <MessageSquare size={14} />
                </span>
                {!isOpen && (
                    <span className="absolute right-1 top-1">
                        <Sparkles size={13} style={{ color: '#e5e5e5' }} />
                    </span>
                )}
            </motion.button>
        </div>
    )
}
