'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Zap, MessageSquare, X, Mail, Trash2, ExternalLink, Search, Camera, Download } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { processNexusCommand } from '../app/aiActions'
import { NexusRegistrationPreview } from './NexusRegistrationPreview'

import { NexusSmallCore } from './NexusCore'
import * as brain from '../lib/nexusBrain'

// Define the Message type properly
export type Message = {
    role: 'assistant' | 'user'
    content: string
    type?: 'status' | 'action'
    success?: boolean
    data?: unknown
}

// Minimal type for campaign to avoid any
interface ParsedCampaign {
    pi: string
    client: string
    campaignName?: string
    [key: string]: unknown
}

export function NexusChat() {
    const [isOpen, setIsOpen] = useState(false)
    const [input, setInput] = useState('')
    const [messages, setMessages] = useState<Message[]>([
        { role: 'assistant', content: 'Nexus inicializado. Estou pronto para processar suas demandas.' }
    ])
    const [isTyping, setIsTyping] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)

    const [isGlobalPolling, setIsGlobalPolling] = useState(false)
    const hasShownFinalMessage = useRef(false)
    const [pendingCampaigns, setPendingCampaigns] = useState<Partial<ParsedCampaign>[]>([])
    const [showPreview, setShowPreview] = useState(false)
    const [queueStatus, setQueueStatus] = useState<{ client: string, status: string, count: number } | null>(null)
    const [logs, setLogs] = useState<brain.LogEntry[]>([])
    const [showLogs, setShowLogs] = useState(false)
    const [emailToast, setEmailToast] = useState<{ from: string, subject: string, threadId: string } | null>(null)
    const lastEmailAlertIdRef = useRef<string | null>(null)


    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [messages, isTyping])

    // Email Alert Toast Polling
    useEffect(() => {
        const checkEmailAlerts = async () => {
            try {
                const { getNexusActivity } = await import('@/app/actions')
                const data = await getNexusActivity()
                if (!Array.isArray(data)) return
                
                const latestEmail = data.find(d => d.type === 'EMAIL_ALERT')
                if (latestEmail && latestEmail.id !== lastEmailAlertIdRef.current) {
                    lastEmailAlertIdRef.current = latestEmail.id
                    try {
                        const details = JSON.parse(latestEmail.details || '{}')
                        setEmailToast({
                            from: details.from || 'Remetente desconhecido',
                            subject: details.subject || 'Sem assunto',
                            threadId: details.threadId || ''
                        })
                        // Auto-dismiss after 15 seconds
                        setTimeout(() => setEmailToast(null), 15000)
                    } catch { /* ignore parse errors */ }
                }
            } catch (err) {
                console.error('Email alert poll error:', err)
            }
        }

        checkEmailAlerts()
        const interval = setInterval(checkEmailAlerts, 10000)
        return () => clearInterval(interval)
    }, [])

    // Global Capture Polling & Speech Bubble Logic
    useEffect(() => {
        const checkQueue = async () => {
            try {
                const { getQueueStatus } = await import('@/app/actions')
                const currentQueue = await getQueueStatus()

                if (currentQueue.length > 0) {
                    const processing = currentQueue.find((c: { status: string, client?: string }) => c.status === 'PROCESSING') || currentQueue[0]
                    setQueueStatus({
                        client: processing.client || 'Campanha',
                        status: processing.status,
                        count: currentQueue.length
                    })

                    if (!isGlobalPolling) setIsGlobalPolling(true)
                } else {
                    if (isGlobalPolling && !hasShownFinalMessage.current) {
                        hasShownFinalMessage.current = true
                        setMessages(prev => [...prev, {
                            role: 'assistant',
                            content: '✨ Protocolo global finalizado! Todas as campanhas foram capturadas.',
                            type: 'action',
                            success: true
                        }])
                        setIsGlobalPolling(false)
                    }
                    setQueueStatus(null)
                }
            } catch (error) {
                console.error('Nexus polling error:', error)
            }
        }

        const interval = setInterval(checkQueue, 4000)
        return () => clearInterval(interval)
    }, [isGlobalPolling])

    // =====================================================
    // CRON TRIGGER: Polls /api/cron/process every minute
    // This ensures scheduled campaigns are triggered globally
    // while ANY page is open.
    // =====================================================
    useEffect(() => {
        const fetchLogs = async () => {
            try {
                const { getNexusActivity } = await import('@/app/actions')
                const data = await getNexusActivity()
                if (Array.isArray(data)) {
                    // Adapt the data format if necessary or update the rendering
                    setLogs(data.map(d => ({
                        message: d.message,
                        level: d.type,
                        createdAt: d.timestamp
                    })).reverse()) // Most recent at the top for the chat terminal
                }
            } catch (err) {
                console.error('Failed to fetch nexus logs:', err)
            }
        }

        fetchLogs()
        const interval = setInterval(fetchLogs, 3000)
        return () => clearInterval(interval)
    }, [])

    const handleSend = async (customPrompt?: string) => {
        const userMsg = (customPrompt || input).trim()
        if (!userMsg) return

        if (!customPrompt) setInput('')
        setMessages(prev => [...prev, { role: 'user', content: userMsg }])
        setIsTyping(true)

        console.log('[Nexus UI] handleSend iniciado:', userMsg)

        const cleanup = () => {
            console.log('[Nexus UI] Cleanup - resetando isTyping')
            setIsTyping(false)
        }

        const safetyTimer = setTimeout(cleanup, 60000)

        try {
            console.log('[Nexus UI] Chamando processNexusCommand:', userMsg)
            
            const timeoutPromise = new Promise<any>((_, reject) => 
                setTimeout(() => reject(new Error('Timeout')), 60000)
            )
            
            const response = await Promise.race([
                processNexusCommand(userMsg),
                timeoutPromise
            ])
            
            clearTimeout(safetyTimer)
            console.log('[Nexus UI] Resposta recebida:', JSON.stringify(response))

            if (!response) {
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: '⚠️ O núcleo neural não respondeu. Tente novamente.',
                    success: false
                }])
                cleanup()
                return
            }

            if (response.actionPerformed === 'REGISTRATION_PREVIEW' && response.data) {
                setPendingCampaigns(response.data)
                setShowPreview(true)
            }

            if (response.actionPerformed === 'DOWNLOAD_ZIP' && response.data?.date) {
                window.location.href = `/api/books/download?date=${response.data.date}`
            }

            setMessages(prev => [...prev, {
                role: 'assistant',
                content: response.message || 'Resposta vazia do Nexus.',
                type: response.actionPerformed ? 'action' : 'status',
                success: response.success,
                data: response.data
            }])

            if (response.actionPerformed === 'CAPTURE_ALL' && response.success) {
                hasShownFinalMessage.current = false
                setIsGlobalPolling(true)
            }
        } catch (error) {
            clearTimeout(safetyTimer)
            console.error('[Nexus UI] Erro:', error)
            setMessages(prev => [...prev, { 
                role: 'assistant', 
                content: error instanceof Error && error.message === 'Timeout' 
                    ? '⏳ O servidor está demorando demais. Tente novamente.' 
                    : '⚠️ Erro de comunicação com o Nexus. Tente novamente.', 
                success: false 
            }])
        } finally {
            clearTimeout(safetyTimer)
            cleanup()
        }
    }

    const quickActions = [
        { icon: Camera, label: "Tirar Print Geral", cmd: "Capturar tudo" },
        { icon: Download, label: "Baixar Prints de Hoje", cmd: "Baixar todos os prints de hoje" },
        { icon: Search, label: "Status do Sistema", cmd: "Como estão as campanhas?" }
    ]

    return (
        <>
            {/* Email Toast Notification */}
            {emailToast && (
                <div className="fixed top-6 right-6 z-80 animate-in slide-in-from-top-4 fade-in duration-500 max-w-sm">
                    <div className="bg-black/95 border border-white/20 rounded-2xl p-4 shadow-[0_20px_60px_rgba(0,0,0,0.8)] backdrop-blur-xl">
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center shrink-0">
                                <Mail size={18} className="text-indigo-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Novo E-mail</p>
                                <p className="text-white text-xs font-bold truncate">{emailToast.from.replace(/<.*>/, '').trim()}</p>
                                <p className="text-white/50 text-[11px] font-medium truncate mt-0.5">{emailToast.subject}</p>
                            </div>
                            <button onClick={() => setEmailToast(null)} className="text-white/30 hover:text-white transition-colors shrink-0">
                                <X size={14} />
                            </button>
                        </div>
                        <div className="flex gap-2 mt-3">
                            <a
                                href={`https://mail.google.com/mail/u/0/#all/${emailToast.threadId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 text-center text-[9px] font-black text-indigo-400 hover:text-indigo-300 uppercase tracking-widest py-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/20 transition-all"
                            >
                                Abrir no Gmail
                            </a>
                            <button
                                onClick={() => setEmailToast(null)}
                                className="text-[9px] font-black text-white/30 uppercase tracking-widest py-2 px-3 rounded-lg hover:text-white/60 transition-all"
                            >
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Comic Speech Bubble */}
            {queueStatus && !isOpen && (
                <div
                    className="fixed bottom-32 right-8 z-70 animate-in zoom-in slide-in-from-bottom-2 duration-300"
                >
                    <div className="relative bg-white border-4 border-black rounded-4xl px-6 py-4 shadow-[8px_8px_0px_rgba(0,0,0,1)] max-w-[280px]">
                        {/* Tail */}
                        <div className="absolute -bottom-[14px] right-6 w-0 h-0 border-l-12 border-l-transparent border-r-12 border-r-transparent border-t-14 border-t-black" />
                        <div className="absolute -bottom-[8px] right-[26px] w-0 h-0 border-l-10 border-l-transparent border-r-10 border-r-transparent border-t-12 border-t-white" />

                        <div className="space-y-1">
                            <p className="text-black font-black text-xs uppercase tracking-tight leading-tight">
                                {queueStatus.status === 'PROCESSING'
                                    ? `Capturando: ${queueStatus.client}...`
                                    : `Iniciando lote...`}
                            </p>
                            <p className="text-black/60 font-black text-[10px] uppercase tracking-widest">
                                {queueStatus.count > 1
                                    ? `Restam ${queueStatus.count} na fila!`
                                    : `Última da fila!`}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* The Orb */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`fixed bottom-8 right-8 z-60 w-16 h-16 rounded-full flex items-center justify-center transition-all duration-700 hover:scale-110 group ${isOpen ? 'rotate-90' : ''}`}
                style={{
                    background: isTyping ? 'rgba(255,255,255,0.12)' : 'rgba(10, 10, 10, 0.5)',
                    boxShadow: isTyping ? '0 0 50px rgba(255,255,255,0.2)' : '0 20px 40px rgba(0,0,0,0.5)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    backdropFilter: 'blur(20px)'
                }}
            >
                {isOpen ? (
                    <X size={28} className="text-white relative z-10" />
                ) : (
                    <NexusSmallCore isTyping={isTyping} />
                )}
            </button>

            {isOpen && (
                <div className="fixed inset-0 z-60 animate-in fade-in duration-300 pointer-events-none">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm pointer-events-auto" onClick={() => setIsOpen(false)} />
                </div>
            )}

            {/* Chat Window */}
            <div
                className={`fixed bottom-6 right-6 z-60 flex flex-col transition-all duration-500 ease-out h-[600px] w-full max-w-[420px] shadow-[0_32px_80px_rgba(0,0,0,0.6)] border border-white/10 ${
                    isOpen ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-12 opacity-0 scale-95 pointer-events-none'
                }`}
                style={{
                    background: 'linear-gradient(135deg, rgba(8, 8, 14, 0.99) 0%, rgba(12, 12, 20, 0.98) 100%)',
                }}
            >
                {/* Visual Header / Brand Area */}
                <div className="p-4 flex items-center justify-between bg-white/2 border-b border-white/5">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white/3 border border-white/10 flex items-center justify-center relative group overflow-hidden">
                            <NexusSmallCore isTyping={isTyping || isGlobalPolling} />
                        </div>
                        <div>
                            <h3 className="font-black text-white text-base tracking-tighter" style={{ fontFamily: 'var(--font-display)' }}>Nexus AI</h3>
                            <div className="flex items-center gap-1.5">
                                <span className={`h-1 w-1 rounded-full ${isTyping || isGlobalPolling ? 'bg-white/70 animate-pulse' : 'bg-white/20'}`} />
                                <span className="text-[8px] font-black text-white/40 uppercase tracking-widest">
                                    {isTyping ? 'Analisando...' : isGlobalPolling ? 'Global Link' : 'Online'}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowLogs(!showLogs)}
                            className={`w-10 h-10 rounded-xl transition-all flex items-center justify-center border ${showLogs ? 'bg-white/10 border-white/30 text-white' : 'bg-white/5 border-white/10 text-white/20 hover:text-white'}`}
                        >
                            <MessageSquare size={16} />
                        </button>
                        <button
                            onClick={() => setMessages([messages[0]])}
                            className="w-10 h-10 rounded-xl bg-white/5 hover:bg-red-500/20 text-white/20 hover:text-red-400 transition-all border border-white/10 flex items-center justify-center"
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>
                </div>

                {/* Messages Area */}
                <div ref={scrollRef} className="flex-1 overflow-auto p-4 space-y-4 nexus-scrollbar scroll-smooth">
                    {showLogs ? (
                        <div className="space-y-3 animate-in fade-in duration-500">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-black text-white/50 uppercase tracking-widest">Logs do Nexus</span>
                                <span className="h-1.5 w-1.5 rounded-full bg-white/50 animate-pulse" />
                            </div>
                            {logs.length === 0 ? (
                                <div className="text-[10px] text-white/20 font-medium italic py-10 text-center">Nenhum evento registrado...</div>
                            ) : (
                                logs.map((log, i) => (
                                    <div key={i} className="font-mono text-[9px] border-l border-white/10 pl-3 py-1">
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <span className={`text-[8px] font-bold ${
                                                log.level === 'SUCCESS' ? 'text-green-400' : 
                                                log.level === 'ERROR' ? 'text-red-400' : 
                                                log.level === 'EMAIL_ALERT' ? 'text-indigo-400' :
                                                'text-white/50'
                                            }`}>
                                                [{log.level}]
                                            </span>
                                            <span className="text-white/20">{new Date(log.createdAt).toLocaleTimeString()}</span>
                                        </div>
                                        <div className="flex items-start gap-2">
                                            {log.level === 'EMAIL_ALERT' && <Mail size={12} className="text-indigo-400 mt-1 shrink-0" />}
                                            <div className="flex-1 min-w-0">
                                                <p className={`text-white/60 leading-relaxed font-medium ${log.level === 'EMAIL_ALERT' ? 'text-indigo-100/80' : ''}`}>{log.message}</p>
                                                {log.level === 'EMAIL_ALERT' && log.details && (() => {
                                                    try {
                                                        const details = JSON.parse(log.details)
                                                        return (
                                                            <div className="mt-2 p-2 rounded-lg bg-white/5 border border-white/10 space-y-1">
                                                                <div className="text-[10px] text-white/40 italic line-clamp-2">&quot;{details.snippet}&quot;</div>
                                                                <a 
                                                                    href={`https://mail.google.com/mail/u/0/#all/${details.threadId}`} 
                                                                    target="_blank" 
                                                                    rel="noopener noreferrer"
                                                                    className="flex items-center gap-1 text-[9px] font-black text-indigo-400 hover:text-indigo-300 transition-colors uppercase tracking-widest mt-1"
                                                                >
                                                                    Responder <ExternalLink size={8} />
                                                                </a>
                                                            </div>
                                                        )
                                                    } catch { return null }
                                                })()}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    ) : (
                        messages.map((msg, i) => (
                            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-4 duration-500`}>
                                <div className={`max-w-[85%] relative ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                                    <div
                                        className={`p-4 rounded-2xl text-[13px] leading-relaxed transition-all shadow-xl ${msg.role === 'user'
                                            ? 'bg-white text-black rounded-tr-none font-medium'
                                            : 'bg-white/5 text-white/95 rounded-tl-none border border-white/10'
                                            }`}
                                    >
                                        {msg.role === 'user' ? (
                                            msg.content
                                        ) : (
                                            <ReactMarkdown 
                                                remarkPlugins={[remarkGfm]}
                                                components={{
                                                    p: (props) => <p className="mb-3 last:mb-0" {...props} />,
                                                    h3: (props) => <h3 className="text-[11px] font-black text-white/40 uppercase tracking-[0.2em] mb-4 mt-6 first:mt-2 border-b border-white/5 pb-2" {...props} />,
                                                    ul: (props) => <ul className="space-y-2 mb-4 list-none" {...props} />,
                                                    ol: (props) => <ol className="space-y-2 mb-4 list-decimal pl-4" {...props} />,
                                                    li: (props) => (
                                                        <li className="flex items-start gap-2.5" {...props}>
                                                            {/* Custom bullet for UL */}
                                                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500/50 mt-2 shrink-0" />
                                                            <span className="flex-1">{props.children}</span>
                                                        </li>
                                                    ),
                                                    strong: (props) => <strong className="font-black text-white" {...props} />,
                                                    blockquote: (props) => <blockquote className="border-l-2 border-white/20 pl-3 italic text-white/50 my-3" {...props} />,
                                                    table: (props) => <div className="overflow-x-auto my-4"><table className="w-full text-left border-collapse border border-white/10 rounded-lg overflow-hidden" {...props} /></div>,
                                                    th: (props) => <th className="bg-white/10 p-2 text-[10px] font-black uppercase tracking-widest border border-white/10" {...props} />,
                                                    td: (props) => <td className="p-2 border border-white/10 text-[11px]" {...props} />,
                                                }}
                                            >
                                                {msg.content}
                                            </ReactMarkdown>
                                        )}

                                        {msg.type === 'action' && (
                                            <div className="mt-4 pt-3 border-t border-white/5 flex items-center gap-2 text-[9px] font-black text-indigo-400 uppercase tracking-[0.2em]">
                                                <Zap size={10} className="animate-pulse" />
                                                Transmissão Concluída
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <span className="text-[7px] font-black text-white/10 uppercase tracking-widest mt-1.5 block">
                                    {msg.role === 'user' ? 'Usuário' : 'Nexus'}
                                </span>
                            </div>
                        ))
                    )}
                    {isTyping && !showLogs && (
                        <div className="flex justify-start">
                            <div className="bg-white/5 p-3 rounded-xl rounded-tl-none border border-white/10 flex flex-col gap-2">
                                <div className="flex items-center gap-2.5">
                                    <div className="flex gap-1">
                                        <div className="w-1 h-1 bg-white/60 rounded-full" style={{ animation: 'bounce 1s infinite 0ms' }} />
                                        <div className="w-1 h-1 bg-white/60 rounded-full" style={{ animation: 'bounce 1s infinite 150ms' }} />
                                        <div className="w-1 h-1 bg-white/60 rounded-full" style={{ animation: 'bounce 1s infinite 300ms' }} />
                                    </div>
                                    <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em]">Nexus está pensando...</span>
                                </div>
                                {/* Progress visualizer */}
                                <div className="w-full h-[1px] bg-white/5 overflow-hidden">
                                     <div className="h-full bg-white/20 animate-[progress_30s_linear_infinite]" />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Quick Actions Panel */}
                <div className="px-4 py-3 bg-white/1 border-t border-white/5">
                    <span className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-2 block">Ações Rápidas</span>
                    <div className="flex flex-wrap gap-1.5">
                        {quickActions.map((action, i) => (
                            <button
                                key={i}
                                onClick={() => handleSend(action.cmd)}
                                className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[9px] font-bold text-white/40 hover:text-white hover:bg-white/8 hover:border-white/20 transition-all flex items-center gap-1.5 group"
                            >
                                <action.icon size={10} className="group-hover:text-white transition-colors" />
                                {action.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Input Area */}
                <div className="p-4 pt-1">
                    <div className="relative group">
                        <input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                            placeholder="Comando..."
                            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 pr-14 text-xs text-white outline-none focus:bg-white/8 focus:border-white/30 transition-all font-medium placeholder:text-white/10"
                        />
                        <button
                            onClick={() => handleSend()}
                            disabled={!input.trim()}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-lg bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-xl disabled:opacity-20 disabled:grayscale"
                        >
                            <Send size={16} />
                        </button>
                    </div>
                    <p className="text-[8px] text-white/10 mt-2 text-center uppercase tracking-widest font-bold">Nexus v2.0</p>
                </div>
            </div>

            {showPreview && (
                <NexusRegistrationPreview
                    campaigns={pendingCampaigns}
                    onClose={() => setShowPreview(false)}
                    onConfirm={(count) => {
                        setShowPreview(false)
                        setMessages(prev => [...prev, {
                            role: 'assistant',
                            content: `✨ Excelente! Cadastro de ${count} ${count === 1 ? 'campanha' : 'campanhas'} realizado com sucesso. Elas já estão prontas no monitoramento.`,
                            type: 'action',
                            success: true
                        }])
                    }}
                />
            )}
        </>
    )
}
