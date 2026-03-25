'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Zap, X, Mail, Trash2, Camera, Download, Search } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { processNexusCommand } from '../app/aiActions'
import { NexusRegistrationPreview } from './NexusRegistrationPreview'
import { NexusDeleteWizard } from './NexusDeleteWizard'
import { MermaidChart, NexusDataChart } from './NexusChatComponents'

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
    const chatRef = useRef<HTMLDivElement>(null)
    const toggleRef = useRef<HTMLButtonElement>(null)

    const [isGlobalPolling, setIsGlobalPolling] = useState(false)
    const hasShownFinalMessage = useRef(false)
    const [pendingCampaigns, setPendingCampaigns] = useState<Partial<ParsedCampaign>[]>([])
    const [showPreview, setShowPreview] = useState(false)
    const [deleteData, setDeleteData] = useState<any>(null)
    const [showDeleteWizard, setShowDeleteWizard] = useState(false)
    const [queueStatus, setQueueStatus] = useState<{ client: string, status: string, count: number } | null>(null)
    const [logs, setLogs] = useState<brain.LogEntry[]>([])
    const [showLogs, setShowLogs] = useState(false)
    const [emailToast, setEmailToast] = useState<{ from: string, subject: string, threadId: string } | null>(null)
    const lastEmailAlertIdRef = useRef<string | null>(null)
    
    // Click outside to close
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (isOpen && 
                chatRef.current && 
                !chatRef.current.contains(event.target as Node) &&
                toggleRef.current &&
                !toggleRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [isOpen])


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

        const safetyTimer = setTimeout(cleanup, 100000)

        try {
            console.log('[Nexus UI] Chamando processNexusCommand:', userMsg)
            
            const timeoutPromise = new Promise<any>((_, reject) => 
                setTimeout(() => reject(new Error('Timeout')), 100000)
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

            if (response.actionPerformed === 'DELETE_WIZARD' && response.data) {
                setDeleteData(response.data as any[])
                setShowDeleteWizard(true)
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

            {/* The Orb */}
            <button
                ref={toggleRef}
                onClick={() => setIsOpen(!isOpen)}
                className={`fixed bottom-8 right-8 z-[9999] w-16 h-16 rounded-full flex items-center justify-center transition-all duration-700 hover:scale-110 group ${isOpen ? 'rotate-90' : ''}`}
                style={{
                    background: isTyping ? 'rgba(255,255,255,0.15)' : 'rgba(255, 255, 255, 0.05)',
                    boxShadow: isTyping ? '0 0 40px rgba(99, 102, 241, 0.3)' : '0 20px 40px rgba(0,0,0,0.4)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    backdropFilter: 'blur(16px)'
                }}
            >
                {isOpen ? (
                    <X size={24} className="text-white/80" />
                ) : (
                    <div className="relative">
                        <NexusSmallCore isTyping={isTyping} />
                        {queueStatus && (
                            <div className="absolute -top-1 -right-1 w-3 h-3 bg-indigo-500 rounded-full animate-pulse border-2 border-black" />
                        )}
                    </div>
                )}
            </button>

            {/* Chat Window */}
            <div
                ref={chatRef}
                className={`fixed bottom-6 right-6 z-[9999] flex flex-col transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] h-[700px] w-[900px] max-w-[calc(100vw-3rem)] max-h-[calc(100vh-6rem)] overflow-hidden shadow-[0_40px_100px_-20px_rgba(0,0,0,0.7)] border border-white/10 rounded-[32px] ${
                    isOpen ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-12 opacity-0 scale-95 pointer-events-none'
                }`}
                style={{
                    background: 'rgba(10, 10, 15, 0.85)',
                    backdropFilter: 'blur(30px)',
                }}
            >
                {/* Header */}
                <div className="p-6 flex items-center justify-between border-b border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center relative overflow-hidden group">
                           <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                           <NexusSmallCore isTyping={isTyping || isGlobalPolling} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="font-black text-white text-lg tracking-tight">Nexus AI</h3>
                                <span className="px-1.5 py-0.5 rounded-md bg-white/5 border border-white/10 text-[8px] font-black text-white/30 uppercase tracking-widest">v2.5 Alpha</span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                                <div className={`h-1.5 w-1.5 rounded-full ${isTyping || isGlobalPolling ? 'bg-indigo-400 animate-pulse shadow-[0_0_8px_rgba(129,140,248,0.5)]' : 'bg-white/20'}`} />
                                <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest leading-none">
                                    {isTyping ? 'Neural Processing...' : isGlobalPolling ? 'Global Sync Active' : 'Nexus Core Online'}
                                </span>
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setShowLogs(!showLogs)}
                            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${showLogs ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:bg-white/10'}`}
                        >
                            {showLogs ? 'View Chat' : 'System Logs'}
                        </button>
                        <button
                            onClick={() => setMessages([messages[0]])}
                            className="w-10 h-10 rounded-xl bg-white/5 hover:bg-red-500/10 text-white/20 hover:text-red-400 transition-all border border-white/10 flex items-center justify-center"
                            title="Clear History"
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>
                </div>

                {/* Messages Area */}
                <div ref={scrollRef} className="flex-1 overflow-auto p-8 space-y-10 scroll-smooth nexus-scrollbar relative">
                    {/* Background Glow */}
                    <div className="absolute top-1/4 left-1/4 w-1/2 h-1/2 bg-indigo-500/5 blur-[120px] pointer-events-none" />
                    
                    {showLogs ? (
                        <div className="space-y-4 animate-in fade-in duration-700 relative z-10">
                            {logs.length === 0 ? (
                                <div className="text-[10px] text-white/20 font-black uppercase tracking-[0.3em] py-20 text-center">No active signals...</div>
                            ) : (
                                logs.map((log, i) => (
                                    <div key={i} className="group flex gap-4 font-mono text-[10px] border-b border-white/[0.02] pb-4 last:border-0">
                                        <span className="text-white/20 whitespace-nowrap">{new Date(log.createdAt).toLocaleTimeString()}</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={`font-black tracking-widest ${
                                                    log.level === 'SUCCESS' ? 'text-green-400' : 
                                                    log.level === 'ERROR' ? 'text-red-400' : 'text-indigo-400'
                                                }`}>[{log.level}]</span>
                                            </div>
                                            <p className="text-white/60 leading-relaxed break-words">{log.message}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    ) : (
                        messages.map((msg, i) => (
                            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-8 duration-700 relative z-10`}>
                                <div className={`max-w-[88%] lg:max-w-[80%] flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                    <span className="text-[8px] font-black text-white/10 uppercase tracking-[0.4em] mb-2 px-1">
                                        {msg.role === 'user' ? 'Human Protocol' : 'Nexus Intelligence'}
                                    </span>
                                    
                                    <div
                                        className={`group relative p-6 rounded-[28px] text-[15px] leading-relaxed transition-all break-words overflow-hidden ${
                                            msg.role === 'user'
                                            ? 'bg-white text-black font-bold rounded-tr-none shadow-[10px_20px_50px_rgba(255,255,255,0.1)]'
                                            : 'bg-white/[0.03] text-white/90 rounded-tl-none border border-white/10 shadow-[0_20px_40px_rgba(0,0,0,0.3)]'
                                        }`}
                                    >
                                        {/* Glass highlight */}
                                        {msg.role !== 'user' && (
                                            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.05] via-transparent to-transparent pointer-events-none" />
                                        )}

                                        {msg.role === 'user' ? (
                                            msg.content
                                        ) : (
                                            <div className="space-y-4 w-full overflow-hidden">
                                                <ReactMarkdown 
                                                    remarkPlugins={[remarkGfm]}
                                                    components={{
                                                        p: (props) => <p className="mb-4 last:mb-0 leading-[1.7]" {...props} />,
                                                        h1: (props) => <h1 className="text-xl font-black text-white mb-6 border-b border-white/10 pb-2" {...props} />,
                                                        h2: (props) => <h2 className="text-lg font-black text-white mb-4 mt-8" {...props} />,
                                                        h3: (props) => <h3 className="text-[11px] font-black text-white/30 uppercase tracking-[0.25em] mb-4 mt-8 pb-1 border-b border-white/5" {...props} />,
                                                        ul: (props) => <ul className="space-y-3 mb-6 list-none" {...props} />,
                                                        ol: (props) => <ol className="space-y-3 mb-6 list-decimal pl-5 marker:text-indigo-400 marker:font-black" {...props} />,
                                                        li: (props) => (
                                                            <li className="flex items-start gap-3 group/li" {...props}>
                                                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500/40 mt-2.5 shrink-0 group-hover/li:bg-indigo-400 transition-colors" />
                                                                <span className="flex-1">{props.children}</span>
                                                            </li>
                                                        ),
                                                        strong: (props) => <strong className="font-black text-white" {...props} />,
                                                        blockquote: (props) => <blockquote className="border-l-4 border-indigo-500/40 bg-white/[0.02] pl-6 py-4 italic text-white/70 my-6 rounded-r-2xl" {...props} />,
                                                        code: ({ node, inline, className, children, ...props }: any) => {
                                                            const match = /language-(\w+)/.exec(className || '')
                                                            if (!inline && match && match[1] === 'mermaid') {
                                                                return <MermaidChart chart={String(children).replace(/\n$/, '')} />
                                                            }
                                                            return <code className={`${className} bg-white/5 px-1.5 py-0.5 rounded-md font-mono text-[13px] border border-white/10`} {...props}>{children}</code>
                                                        },
                                                        table: (props) => (
                                                            <div className="my-8 rounded-2xl border border-white/10 bg-black/40 overflow-hidden shadow-2xl">
                                                                <div className="overflow-x-auto overflow-y-hidden max-w-full">
                                                                    <table className="w-full text-left border-collapse" {...props} />
                                                                </div>
                                                            </div>
                                                        ),
                                                        th: (props) => <th className="bg-white/[0.05] p-4 text-[10px] font-black uppercase tracking-widest border-b border-white/10 text-white/40" {...props} />,
                                                        td: (props) => <td className="p-4 border-b border-white/[0.03] text-[12px] text-white/80" {...props} />,
                                                    }}
                                                >
                                                    {msg.content}
                                                </ReactMarkdown>

                                                {/* Specialized Data Visualizer */}
                                                {(msg.data as any)?.chartData && (
                                                    <NexusDataChart chartData={(msg.data as any).chartData} />
                                                )}
                                            </div>
                                        )}

                                        {msg.type === 'action' && (
                                            <div className="mt-6 pt-5 border-t border-white/5 flex items-center gap-3">
                                                <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse shadow-[0_0_10px_rgba(99,102,241,0.8)]" />
                                                <span className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.3em]">Protocol Executed</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                    
                    {isTyping && !showLogs && (
                        <div className="flex justify-start animate-in fade-in duration-500">
                           <div className="flex flex-col gap-2">
                                <span className="text-[8px] font-black text-white/10 uppercase tracking-[0.4em] mb-2 px-1">Processing Signal</span>
                                <div className="bg-white/[0.02] border border-white/10 p-4 rounded-2xl rounded-tl-none flex items-center gap-4">
                                    <div className="flex gap-1.5">
                                        <div className="w-1.5 h-1.5 bg-indigo-400/60 rounded-full animate-bounce [animation-delay:-0.3s]" />
                                        <div className="w-1.5 h-1.5 bg-indigo-400/60 rounded-full animate-bounce [animation-delay:-0.15s]" />
                                        <div className="w-1.5 h-1.5 bg-indigo-400/60 rounded-full animate-bounce" />
                                    </div>
                                    <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">Nexus is Synthesizing...</span>
                                </div>
                           </div>
                        </div>
                    )}
                </div>

                {/* Quick Actions Panel */}
                {!showLogs && (
                    <div className="px-8 py-4 bg-white/[0.01] border-t border-white/5">
                        <div className="flex flex-wrap gap-2">
                            {quickActions.map((action, i) => (
                                <button
                                    key={i}
                                    onClick={() => handleSend(action.cmd)}
                                    className="px-4 py-2 rounded-xl bg-white/[0.03] border border-white/10 text-[10px] font-bold text-white/40 hover:text-white hover:bg-indigo-500/20 hover:border-indigo-500/40 transition-all flex items-center gap-2 group"
                                >
                                    <action.icon size={12} className="group-hover:text-indigo-300 transition-colors" />
                                    {action.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Input Area */}
                <div className="p-8 pt-2">
                    <div className="relative group">
                        <div className="absolute inset-0 bg-indigo-500/5 blur-xl group-focus-within:bg-indigo-500/10 transition-all rounded-3xl" />
                        <input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
                            placeholder="Connect to Nexus Core..."
                            className="relative w-full bg-white/[0.05] border border-white/10 rounded-[22px] p-4 pr-16 text-sm text-white outline-none focus:bg-white/[0.08] focus:border-indigo-500/40 transition-all font-medium placeholder:text-white/10"
                        />
                        <button
                            onClick={() => handleSend()}
                            disabled={!input.trim()}
                            className="absolute right-2 top-1/2 -translate-y-1/2 w-12 h-12 rounded-[18px] bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-2xl disabled:opacity-20 disabled:grayscale"
                        >
                            <Send size={20} />
                        </button>
                    </div>
                    <div className="mt-4 flex items-center justify-between px-2">
                        <p className="text-[8px] text-white/5 uppercase tracking-[0.5em] font-black">Adsnap Cloud Nexus — Security Protocol Active</p>
                        <Zap size={10} className="text-white/5" />
                    </div>
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

            {showDeleteWizard && (
                <NexusDeleteWizard
                    data={deleteData}
                    onClose={() => setShowDeleteWizard(false)}
                    onConfirm={(message) => {
                        setShowDeleteWizard(false)
                        setMessages(prev => [...prev, {
                            role: 'assistant',
                            content: message,
                            type: 'action',
                            success: true
                        }])
                    }}
                />
            )}
        </>
    )
}
