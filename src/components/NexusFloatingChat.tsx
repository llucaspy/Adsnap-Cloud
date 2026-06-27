'use client'

import { FormEvent, useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import {
    ArrowUp,
    ExternalLink,
    Loader2,
    Maximize2,
    MessageCircle,
    MessageSquare,
    Minus,
    Trash2,
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
    { label: 'Capturar PI', command: 'Capturar PI' },
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
        text: 'Nexus pronto. Envie uma acao: cadastrar order, disparar prints, capturar um PI ou preparar download.',
        actions: quickActions,
    }
}

function NexusChatMark({ compact = false }: { compact?: boolean }) {
    const size = compact ? 40 : 52
    const iconSize = compact ? 18 : 22

    return (
        <div
            aria-hidden="true"
            className="relative shrink-0"
            style={{ width: size, height: size }}
        >
            <motion.div
                className="absolute"
                style={{
                    inset: 0,
                    background: '#141414',
                    border: '1px solid rgba(255,255,255,0.16)',
                    borderRadius: compact ? 12 : 16,
                    boxShadow: 'rgba(0,0,0,0.30) 0px 8px 24px 0px',
                }}
                animate={{
                    borderColor: [
                        'rgba(255,255,255,0.12)',
                        'rgba(255,255,255,0.22)',
                        'rgba(255,255,255,0.12)',
                    ],
                }}
                transition={{
                    duration: 3.2,
                    repeat: Infinity,
                    ease: [0.16, 1, 0.3, 1],
                }}
            />
            <div className="absolute inset-0 flex items-center justify-center" style={{ color: '#e5e5e5' }}>
                <MessageCircle size={iconSize} strokeWidth={1.9} />
            </div>
            <motion.div
                className="absolute"
                style={{
                    right: compact ? -4 : -5,
                    top: compact ? -4 : -5,
                    width: compact ? 16 : 18,
                    height: compact ? 16 : 18,
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
                    right: compact ? 0 : -1,
                    top: compact ? 0 : -1,
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
                    <MessageSquare size={15} />
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
                    text: 'Estou em modo leitura. Entre na central para operar campanhas, workers, orders e downloads com seguranca.',
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
                        text: error instanceof Error ? error.message : 'Nao consegui executar essa acao agora.',
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

    function clearConversation() {
        setInput('')
        setMessages([initialMessage()])
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
                        className="fixed left-3 right-3 bottom-24 sm:left-auto sm:right-6 sm:bottom-24 sm:w-[620px] lg:w-[680px] h-[min(820px,calc(100vh-120px))] overflow-hidden"
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
                                    <NexusChatMark compact />
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="text-sm font-semibold truncate" style={{ color: '#ffffff' }}>Nexus</p>
                                            <span className="px-2 py-0.5 text-[10px] font-semibold" style={{ color: '#22c55e', background: 'rgba(34,197,94,0.12)', borderRadius: 999 }}>online</span>
                                        </div>
                                        <p className="text-[11px] truncate" style={{ color: '#a3a3a3' }}>Central de operacao</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button type="button" onClick={clearConversation} className="w-8 h-8 flex items-center justify-center" style={{ color: '#a3a3a3', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }} title="Limpar conversa" aria-label="Limpar conversa">
                                        <Trash2 size={14} />
                                    </button>
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
                                        <span className="text-[11px] font-semibold" style={{ color: '#a3a3a3' }}>Processando...</span>
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
                                        placeholder="Digite uma acao para o Nexus..."
                                        className="min-h-11 max-h-28 flex-1 resize-none px-3 py-3 outline-none text-sm"
                                        style={{ background: 'rgba(255,255,255,0.04)', color: '#e5e5e5', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 8 }}
                                    />
                                    <button
                                        type="submit"
                                        disabled={isPending || !input.trim()}
                                        className="w-11 h-11 shrink-0 flex items-center justify-center disabled:opacity-40 transition-transform hover:-translate-y-0.5"
                                        style={{ background: '#e5e5e5', color: '#0f0f0f', border: '1px solid #e5e5e5', borderRadius: 8 }}
                                        title="Enviar acao"
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
                        'rgba(0,0,0,0.34) 0px 12px 30px 0px, rgba(255,255,255,0.08) 0px 0px 0px 3px',
                        'rgba(0,0,0,0.30) 0px 8px 24px 0px, rgba(255,255,255,0.04) 0px 0px 0px 0px',
                    ],
                }}
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.97 }}
                transition={{
                    opacity: { duration: 0.42, ease: [0.16, 1, 0.3, 1] },
                    filter: { duration: 0.42, ease: [0.16, 1, 0.3, 1] },
                    y: { duration: 0.42, ease: [0.16, 1, 0.3, 1] },
                    boxShadow: { duration: 3.4, repeat: Infinity, ease: [0.16, 1, 0.3, 1] },
                }}
                className="relative w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center"
                style={{
                    background: '#141414',
                    border: '1px solid rgba(255,255,255,0.16)',
                    borderRadius: 16,
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
                    transition={{ duration: 3.4, repeat: Infinity, ease: [0.16, 1, 0.3, 1] }}
                />
                <span className="absolute -top-1.5 -left-1.5 w-6 h-6 flex items-center justify-center" style={{ background: '#e5e5e5', color: '#0f0f0f', borderRadius: 8, border: '1px solid rgba(255,255,255,0.16)' }}>
                    {isOpen ? <X size={13} /> : <MessageSquare size={13} />}
                </span>
                <NexusChatMark />
            </motion.button>
        </div>
    )
}
