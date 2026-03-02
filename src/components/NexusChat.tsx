'use client'

import { useState, useRef, useEffect } from 'react'
import { Sparkles, Send, X, Bot, User, MessageSquare, Zap, Search, Archive, RefreshCw, Trash2, Camera, Download } from 'lucide-react'

import { processNexusCommand } from '../app/aiActions'
import { NexusRegistrationPreview } from './NexusRegistrationPreview'

import { NexusSmallCore } from './NexusCore'

export function NexusChat() {
    const [isOpen, setIsOpen] = useState(false)
    const [input, setInput] = useState('')
    const [messages, setMessages] = useState<{ role: 'assistant' | 'user', content: string, type?: 'status' | 'action', success?: boolean, data?: any }[]>([
        { role: 'assistant', content: 'Nexus inicializado. Estou pronto para processar suas demandas.' }
    ])
    const [isTyping, setIsTyping] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)

    const [isGlobalPolling, setIsGlobalPolling] = useState(false)
    const [pendingCampaigns, setPendingCampaigns] = useState<any[]>([])
    const [showPreview, setShowPreview] = useState(false)
    const [queueStatus, setQueueStatus] = useState<{ client: string, status: string, count: number } | null>(null)
    const [logs, setLogs] = useState<any[]>([])
    const [showLogs, setShowLogs] = useState(false)


    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [messages, isTyping])

    // Global Capture Polling & Speech Bubble Logic
    useEffect(() => {
        const checkQueue = async () => {
            try {
                const { getQueueStatus } = await import('@/app/actions')
                const currentQueue = await getQueueStatus()

                if (currentQueue.length > 0) {
                    const processing = currentQueue.find((c: any) => c.status === 'PROCESSING') || currentQueue[0]
                    setQueueStatus({
                        client: processing.client || 'Campanha',
                        status: processing.status,
                        count: currentQueue.length
                    })

                    if (!isGlobalPolling) setIsGlobalPolling(true)
                } else {
                    if (isGlobalPolling) {
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

        try {
            const response = await processNexusCommand(userMsg)

            if (response.actionPerformed === 'REGISTRATION_PREVIEW' && response.data) {
                setPendingCampaigns(response.data)
                setShowPreview(true)
            }

            if (response.actionPerformed === 'DOWNLOAD_ZIP' && response.data?.date) {
                // Trigger download
                window.location.href = `/api/books/download?date=${response.data.date}`
            }

            setMessages(prev => [...prev, {
                role: 'assistant',
                content: response.message,
                type: response.actionPerformed ? 'action' : 'status',
                success: response.success,
                data: response.data
            }])

            if (response.actionPerformed === 'CAPTURE_ALL' && response.success) {
                setIsGlobalPolling(true)
            }
        } catch (error) {
            setMessages(prev => [...prev, { role: 'assistant', content: 'Erro no núcleo neural. Tente novamente.', success: false }])
        } finally {
            setIsTyping(false)
        }
    }

    const quickActions = [
        { icon: Camera, label: "Tirar Print Geral", cmd: "Capturar tudo" },
        { icon: Download, label: "Baixar Prints de Hoje", cmd: "Baixar todos os prints de hoje" },
        { icon: Search, label: "Status do Sistema", cmd: "Como estão as campanhas?" }
    ]

    return (
        <>
            {/* Comic Speech Bubble */}
            {queueStatus && !isOpen && (
                <div
                    className="fixed bottom-32 right-8 z-[70] animate-in zoom-in slide-in-from-bottom-2 duration-300"
                >
                    <div className="relative bg-white border-[4px] border-black rounded-[2rem] px-6 py-4 shadow-[8px_8px_0px_rgba(0,0,0,1)] max-w-[280px]">
                        {/* Tail */}
                        <div className="absolute -bottom-[14px] right-6 w-0 h-0 border-l-[12px] border-l-transparent border-r-[12px] border-r-transparent border-t-[14px] border-t-black" />
                        <div className="absolute -bottom-[8px] right-[26px] w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-t-[12px] border-t-white" />

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
                className={`fixed bottom-8 right-8 z-[60] w-16 h-16 rounded-full flex items-center justify-center transition-all duration-700 hover:scale-110 group ${isOpen ? 'rotate-90' : ''}`}
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

            {/* Chat Window */}
            <div
                className={`fixed bottom-28 right-8 z-[60] w-[350px] h-[520px] flex flex-col rounded-[24px] overflow-hidden transition-all duration-700 origin-bottom-right shadow-[0_30px_80px_rgba(0,0,0,0.8)] backdrop-blur-3xl border border-white/10 ${isOpen ? 'scale-100 opacity-100 translate-y-0' : 'scale-50 opacity-0 translate-y-10 pointer-events-none'}`}
                style={{
                    background: 'linear-gradient(135deg, rgba(10, 10, 18, 0.99) 0%, rgba(15, 15, 25, 0.98) 100%)',
                }}
            >
                {/* Visual Header / Brand Area */}
                <div className="p-4 flex items-center justify-between bg-white/[0.02] border-b border-white/5">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-center relative group overflow-hidden">
                            <NexusSmallCore isTyping={isTyping || isGlobalPolling} />
                        </div>
                        <div>
                            <h3 className="font-black text-white text-base tracking-tighter" style={{ fontFamily: 'var(--font-display)' }}>Nexus AI</h3>
                            <div className="flex items-center gap-1.5">
                                <span className={`h-1 w-1 rounded-full ${isTyping || isGlobalPolling ? 'bg-white/70 animate-pulse' : 'bg-white/20'}`} />
                                <span className="text-[8px] font-black text-white/40 uppercase tracking-widest">
                                    {isTyping ? 'Processando' : isGlobalPolling ? 'Global Link' : 'Online'}
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
                <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar relative">
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
                                            <span className={`text-[8px] font-bold ${log.level === 'SUCCESS' ? 'text-green-400' : log.level === 'ERROR' ? 'text-red-400' : 'text-white/50'}`}>
                                                [{log.level}]
                                            </span>
                                            <span className="text-white/20">{new Date(log.createdAt).toLocaleTimeString()}</span>
                                        </div>
                                        <p className="text-white/60 leading-relaxed font-medium">{log.message}</p>
                                    </div>
                                ))
                            )}
                        </div>
                    ) : (
                        messages.map((msg, i) => (
                            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-4 duration-500`}>
                                <div className={`max-w-[85%] relative ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                                    <div
                                        className={`p-3 rounded-xl text-[12px] font-medium leading-relaxed transition-all shadow-lg ${msg.role === 'user'
                                            ? 'bg-white text-black rounded-tr-none'
                                            : 'bg-white/5 text-white/90 rounded-tl-none border border-white/10'
                                            }`}
                                    >
                                        {msg.content}

                                        {msg.type === 'action' && (
                                            <div className="mt-2 pt-2 border-t border-white/5 flex items-center gap-1.5 text-[8px] font-black text-white/50 uppercase tracking-widest">
                                                <Zap size={8} className="animate-pulse" />
                                                Confirmado
                                            </div>
                                        )}
                                    </div>
                                    <span className="text-[7px] font-black text-white/10 uppercase tracking-widest mt-1.5 block">
                                        {msg.role === 'user' ? 'Usuário' : 'Nexus'}
                                    </span>
                                </div>
                            </div>
                        ))
                    )}
                    {isTyping && !showLogs && (
                        <div className="flex justify-start">
                            <div className="bg-white/5 p-3 rounded-xl rounded-tl-none border border-white/10 flex items-center gap-2.5">
                                <div className="flex gap-1">
                                    <div className="w-1 h-1 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <div className="w-1 h-1 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <div className="w-1 h-1 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                </div>
                                <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em]">Sincronizando...</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Quick Actions Panel */}
                <div className="px-4 py-3 bg-white/[0.01] border-t border-white/5">
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
                            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 pr-14 text-xs text-white outline-none focus:bg-white/[0.08] focus:border-white/30 transition-all font-medium placeholder:text-white/10"
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
