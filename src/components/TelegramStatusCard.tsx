'use client'

import React, { useState } from 'react'
import { 
    Send, 
    CheckCircle2, 
    XCircle, 
    Zap, 
    ShieldCheck, 
    MessageSquare,
    Loader2
} from 'lucide-react'
import { testTelegramNotification } from '@/app/actions'

interface TelegramStatusCardProps {
    data: {
        isConnected: boolean;
        botInfo: any;
        webhook: any;
        chatIdConfigured: boolean;
    }
}

export function TelegramStatusCard({ data }: TelegramStatusCardProps) {
    const [testing, setTesting] = useState(false)
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

    const handleTest = async () => {
        setTesting(true)
        setTestResult(null)
        try {
            const res = await testTelegramNotification()
            if (res.success) {
                setTestResult({ success: true, message: 'Notificação enviada com sucesso!' })
            } else {
                setTestResult({ success: false, message: 'Falha ao enviar. Verifique o Chat ID.' })
            }
        } catch (error) {
            setTestResult({ success: false, message: 'Erro ao processar o teste.' })
        } finally {
            setTesting(false)
            // Clear message after 5s
            setTimeout(() => setTestResult(null), 5000)
        }
    }

    const { isConnected, botInfo, webhook, chatIdConfigured } = data

    return (
        <div className="glass group rounded-[32px] p-8 border border-white/5 hover:border-white/10 transition-all flex flex-col gap-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className={`p-4 rounded-2xl ${isConnected ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'} border`}>
                        <Send size={24} className={isConnected ? 'animate-pulse' : ''} />
                    </div>
                    <div>
                        <h3 className="text-xl font-black text-white tracking-tighter">Telegram Bot</h3>
                        <p className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">Integração Nexus</p>
                    </div>
                </div>
                <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-black uppercase border ${isConnected ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
                    {isConnected ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                    {isConnected ? 'Conectado' : 'Desconectado'}
                </div>
            </div>

            {/* Info Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                    <div className="flex items-center gap-2 mb-2 text-white/40">
                        <Zap size={14} />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Identidade</span>
                    </div>
                    <p className="text-sm font-medium text-white">
                        {botInfo?.first_name || 'N/A'} 
                        <span className="text-white/30 ml-2">@{botInfo?.username || 'desconhecido'}</span>
                    </p>
                </div>

                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                    <div className="flex items-center gap-2 mb-2 text-white/40">
                        <ShieldCheck size={14} />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Configuração</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${chatIdConfigured ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-rose-500'}`} />
                        <p className="text-sm font-medium text-white">
                            {chatIdConfigured ? 'Chat ID Configurado' : 'Aguardando Chat ID'}
                        </p>
                    </div>
                </div>
            </div>

            {/* Webhook Status */}
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 space-y-3">
                <div className="flex items-center justify-between text-white/40">
                    <div className="flex items-center gap-2">
                        <MessageSquare size={14} />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Webhook Endpoint</span>
                    </div>
                    {webhook?.pending_update_count > 0 && (
                        <span className="text-[10px] font-black bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-md">
                            {webhook.pending_update_count} Pendentes
                        </span>
                    )}
                </div>
                <p className="text-xs font-mono text-white/40 break-all bg-black/20 p-2 rounded-lg border border-white/5">
                    {webhook?.url || 'Nenhum webhook registrado'}
                </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2">
                <button
                    onClick={handleTest}
                    disabled={testing || !isConnected || !chatIdConfigured}
                    className="flex-1 py-4 bg-white/[0.05] hover:bg-white/[0.1] disabled:opacity-30 disabled:hover:bg-white/[0.05] border border-white/10 rounded-2xl text-xs font-black uppercase tracking-widest text-white transition-all active:scale-95 flex items-center justify-center gap-2 group"
                >
                    {testing ? <Loader2 size={16} className="animate-spin text-blue-400" /> : <Send size={16} className="group-hover:translate-y-[-2px] group-hover:translate-x-[2px] transition-transform" />}
                    Disparar Teste
                </button>
            </div>

            {/* Toast Result */}
            {testResult && (
                <div className={`p-4 rounded-xl text-[10px] font-bold uppercase tracking-widest text-center animate-fade-in ${testResult.success ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
                    {testResult.message}
                </div>
            )}
        </div>
    )
}
