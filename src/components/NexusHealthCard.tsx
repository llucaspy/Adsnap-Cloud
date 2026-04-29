'use client'

import React, { useState } from 'react'
import { 
    Brain, 
    Cpu, 
    ShieldAlert, 
    CheckCircle2, 
    XCircle, 
    Activity, 
    RefreshCw, 
    Zap,
    ExternalLink,
    AlertCircle
} from 'lucide-react'
import { testNexusConnection } from '@/app/actions'

interface NexusHealthCardProps {
    data: {
        totalMessages: number
        errors24h: number
        lastMessageAt: Date | null
        recentErrors: any[]
    }
    gemini: {
        isActive: boolean
        isRateLimited: boolean
        error?: string | null
        retryAfter?: string | null
    }
    onRefreshRequest: () => void
}

export function NexusHealthCard({ data, gemini, onRefreshRequest }: NexusHealthCardProps) {
    const [testing, setTesting] = useState(false)
    const [testResult, setTestResult] = useState<any>(null)

    const handleTest = async () => {
        setTesting(true)
        setTestResult(null)
        try {
            const result = await testNexusConnection()
            setTestResult(result)
            if (result.success) onRefreshRequest()
        } catch (error) {
            setTestResult({ success: false, message: 'Erro ao disparar teste' })
        } finally {
            setTesting(false)
        }
    }

    const status = gemini.isActive && !gemini.isRateLimited && data.errors24h === 0 
        ? 'healthy' 
        : (gemini.isRateLimited || data.errors24h > 0) ? 'warning' : 'critical'

    return (
        <div className="glass group rounded-[32px] overflow-hidden border border-white/5 hover:border-white/10 transition-all flex flex-col h-full">
            {/* Header Section */}
            <div className={`p-4 border-b border-white/5 bg-linear-to-br ${
                status === 'healthy' ? 'from-emerald-500/10 to-teal-500/5' : 
                status === 'warning' ? 'from-amber-500/10 to-orange-500/5' : 
                'from-rose-500/10 to-red-500/5'
            }`}>
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                        <div className={`p-2 rounded-xl ${
                            status === 'healthy' ? 'bg-emerald-500/20 text-emerald-400' :
                            status === 'warning' ? 'bg-amber-500/20 text-amber-400' :
                            'bg-rose-500/20 text-rose-400'
                        }`}>
                            <Brain size={18} className={status === 'healthy' ? 'animate-pulse' : ''} />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-white tracking-tighter uppercase leading-none">Nexus AI Core</h3>
                            <p className="text-[8px] font-bold text-white/30 tracking-widest uppercase mt-1">Status do Sistema</p>
                        </div>
                    </div>
                    <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[8px] font-black uppercase border shrink-0 ${
                        status === 'healthy' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                        status === 'warning' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                        'bg-rose-500/10 text-rose-400 border-rose-500/20'
                    }`}>
                        {status === 'healthy' ? <CheckCircle2 size={10} /> : status === 'warning' ? <ShieldAlert size={10} /> : <XCircle size={10} />}
                        {status === 'healthy' ? 'OK' : status === 'warning' ? 'ATENÇÃO' : 'CRÍTICO'}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white/5 rounded-xl p-2 border border-white/5">
                        <p className="text-[8px] font-bold text-white/30 mb-0.5">MENSAGENS</p>
                        <p className="text-lg font-black text-white">{data.totalMessages}</p>
                    </div>
                    <div className="bg-white/5 rounded-xl p-2 border border-white/5">
                        <p className="text-[8px] font-bold text-white/30 mb-0.5">ERROS (24H)</p>
                        <p className={`text-lg font-black ${data.errors24h > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                            {data.errors24h}
                        </p>
                    </div>
                </div>
            </div>

            {/* AI Status Detail */}
            <div className="p-4 space-y-4 flex-1">
                <div>
                    <div className="flex items-center justify-between mb-3 text-[10px] font-black text-white/30 uppercase tracking-widest">
                        <span>Status Gemini API</span>
                        <Cpu size={12} />
                    </div>
                    <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                        {gemini.isRateLimited ? (
                            <div className="flex items-start gap-3">
                                <Zap className="text-amber-400 w-5 h-5 shrink-0 animate-pulse" />
                                <div>
                                    <p className="text-sm font-bold text-amber-400">Quota Excedida (429)</p>
                                    <p className="text-xs text-white/40 mt-1">Limite do plano gratuito atingido. {gemini.retryAfter ? `Reset em ${gemini.retryAfter}` : 'Aguarde alguns segundos.'}</p>
                                </div>
                            </div>
                        ) : gemini.isActive ? (
                            <div className="flex items-center gap-3">
                                <Activity className="text-emerald-400 w-5 h-5" />
                                <div>
                                    <p className="text-sm font-bold text-white">Conexão Estável</p>
                                    <p className="text-xs text-white/40 mt-0.5">Key válida • Google AI Studio</p>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-start gap-3 text-rose-400">
                                <XCircle className="w-5 h-5 shrink-0" />
                                <div>
                                    <p className="text-sm font-bold">Erro de Configuração</p>
                                    <p className="text-xs text-rose-400/60 mt-1">{gemini.error || 'Falha na conexão com os servidores do Google.'}</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Recent Errors Section */}
                {data.recentErrors.length > 0 && (
                    <div>
                        <h4 className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                             <AlertCircle size={10} /> Logs recentes
                        </h4>
                        <div className="space-y-1.5">
                            {data.recentErrors.slice(0, 2).map((err, i) => (
                                <div key={i} className="text-[10px] p-2 rounded-lg bg-rose-500/5 border border-rose-500/10 text-white/50 font-mono">
                                    <p className="truncate">{err.content?.replace(/⚠️ Erro: /g, '')}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Actions Section */}
                <div className="pt-2 mt-auto">
                    <button
                        onClick={handleTest}
                        disabled={testing}
                        className={`w-full py-2.5 px-4 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 ${
                            testing ? 'bg-white/5 text-white/30' : 'bg-accent text-white hover:bg-accent/80 shadow-lg shadow-accent/10'
                        }`}
                    >
                        {testing ? <RefreshCw className="animate-spin" size={12} /> : <Zap size={12} />}
                        {testing ? 'Diagnosticando...' : 'Testar Conexão'}
                    </button>

                    {testResult && (
                        <div className={`mt-4 p-4 rounded-2xl border text-xs animate-fade-in ${
                            testResult.success ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                        }`}>
                            <div className="flex items-center justify-between mb-1">
                                <span className="font-black uppercase">Resultado do Teste</span>
                                <span>{testResult.latency}ms</span>
                            </div>
                            <p className="text-white/60 mb-2">{testResult.message?.substring(0, 80)}...</p>
                            <div className="flex items-center gap-2 text-[10px] font-black opacity-40">
                                <span>MODEL: {testResult.model}</span>
                                <span>STATUS: {testResult.status}</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
