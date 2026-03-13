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
    const [diagType, setDiagType] = useState<'notif' | 'conn' | 'backup' | null>(null)
    const [testResult, setTestResult] = useState<{ success: boolean; message: string; details?: any } | null>(null)

    const handleTestNotification = async () => {
        setTesting(true)
        setDiagType('notif')
        setTestResult(null)
        try {
            const res = await testTelegramNotification()
            if (res.success) {
                setTestResult({ success: true, message: 'Notificação enviada!' })
            } else {
                setTestResult({ success: false, message: 'Falha no envio.' })
            }
        } catch (error) {
            setTestResult({ success: false, message: 'Erro de sistema.' })
        } finally {
            setTesting(false)
        }
    }

    const handleTestConnection = async () => {
        setTesting(true)
        setDiagType('conn')
        setTestResult(null)
        try {
            const { testTelegramConnection } = await import('@/app/actions')
            const res = await testTelegramConnection()
            setTestResult({
                success: res.success,
                message: res.message || (res as any).error || 'Teste concluído',
                details: (res as any).bot
            })
        } catch (error) {
            setTestResult({ success: false, message: 'Erro na conexão.' })
        } finally {
            setTesting(false)
        }
    }

    const handleSimulateBackup = async () => {
        setTesting(true)
        setDiagType('backup')
        setTestResult(null)
        try {
            const { simulateMonthlyCleanup } = await import('@/app/actions')
            const res = await simulateMonthlyCleanup()
            setTestResult({
                success: res.success,
                message: res.message || (res as any).error || 'Simulação concluída',
                details: res.success ? { month: (res as any).month, count: (res as any).count } : undefined
            })
        } catch (error) {
            setTestResult({ success: false, message: 'Erro na simulação.' })
        } finally {
            setTesting(false)
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
                <div className="p-4 rounded-2xl bg-white/3 border border-white/5">
                    <div className="flex items-center gap-2 mb-2 text-white/40">
                        <Zap size={14} />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Identidade</span>
                    </div>
                    <p className="text-sm font-medium text-white">
                        {botInfo?.first_name || 'N/A'} 
                        <span className="text-white/30 ml-2">@{botInfo?.username || 'desconhecido'}</span>
                    </p>
                </div>

                <div className="p-4 rounded-2xl bg-white/3 border border-white/5">
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
            <div className="p-4 rounded-2xl bg-white/3 border border-white/5 space-y-3">
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
                <p className="text-[10px] font-mono text-white/40 break-all bg-black/20 p-2 rounded-lg border border-white/5">
                    {webhook?.url || 'Nenhum webhook registrado'}
                </p>
            </div>

            {/* Diagnostic Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                    onClick={handleTestConnection}
                    disabled={testing}
                    className="py-3 px-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-[9px] font-black uppercase tracking-widest text-white transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                    {testing && diagType === 'conn' ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />}
                    Testar Conexão
                </button>
                <button
                    onClick={handleTestNotification}
                    disabled={testing || !isConnected || !chatIdConfigured}
                    className="py-3 px-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-[9px] font-black uppercase tracking-widest text-white transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                    {testing && diagType === 'notif' ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                    Testar Alerta
                </button>
                <button
                    onClick={handleSimulateBackup}
                    disabled={testing}
                    className="py-3 px-4 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-2xl text-[9px] font-black uppercase tracking-widest text-blue-400 transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                    {testing && diagType === 'backup' ? <Loader2 size={12} className="animate-spin text-blue-400" /> : <Zap size={12} />}
                    Simular Backup
                </button>
            </div>

            {/* Detailed Result View */}
            {testResult && (
                <div className={`p-4 rounded-2x border animate-in fade-in slide-in-from-top-4 duration-300 ${testResult.success ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/5 border-rose-500/20 text-rose-400'}`}>
                    <div className="flex items-start gap-4">
                        <div className="mt-1">
                            {testResult.success ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                        </div>
                        <div className="flex-1">
                            <p className="text-[10px] font-black uppercase tracking-widest mb-1">Resultado do Teste</p>
                            <p className="text-xs font-bold text-white/80">{testResult.message}</p>
                            {testResult.details && (
                                <pre className="mt-3 p-3 bg-black/40 rounded-xl text-[9px] font-mono border border-white/5 overflow-x-auto text-white/50">
                                    {JSON.stringify(testResult.details, null, 2)}
                                </pre>
                            )}
                        </div>
                        <button 
                            onClick={() => setTestResult(null)}
                            className="text-white/20 hover:text-white/40 transition-colors"
                        >
                            <XCircle size={14} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
