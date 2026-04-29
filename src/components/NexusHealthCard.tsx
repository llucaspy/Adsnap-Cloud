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
        <div className="glass group rounded-[32px] overflow-hidden border border-white/5 hover:border-white/10 transition-all">
            {/* Header Section */}
            <div className={`p-6 border-b border-white/5 bg-linear-to-br ${
                status === 'healthy' ? 'from-emerald-500/10 to-teal-500/5' : 
                status === 'warning' ? 'from-amber-500/10 to-orange-500/5' : 
                'from-rose-500/10 to-red-500/5'
            }`}>
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className={`p-3 rounded-2xl ${
                            status === 'healthy' ? 'bg-emerald-500/20 text-emerald-400' :
                            status === 'warning' ? 'bg-amber-500/20 text-amber-400' :
                            'bg-rose-500/20 text-rose-400'
                        }`}>
                            <Brain size={24} className={status === 'healthy' ? 'animate-pulse' : ''} />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-white tracking-tighter uppercase">Nexus AI Core</h3>
                            <p className="text-[10px] font-bold text-white/40 tracking-widest uppercase">Saúde Neural do Sistema</p>
                        </div>
                    </div>
                    <div className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[10px] font-black uppercase border shrink-0 ${
                        status === 'healthy' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                        status === 'warning' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                        'bg-rose-500/10 text-rose-400 border-rose-500/20'
                    }`}>
                        {status === 'healthy' ? <CheckCircle2 size={12} /> : status === 'warning' ? <ShieldAlert size={12} /> : <XCircle size={12} />}
                        {status === 'healthy' ? 'Operacional' : status === 'warning' ? 'Degradado' : 'Crítico'}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/5 rounded-2xl p-3 border border-white/5">
                        <p className="text-[10px] font-bold text-white/30 mb-1">MENSAGENS (24H)</p>
                        <p className="text-2xl font-black text-white">{data.totalMessages}</p>
                    </div>
                    <div className="bg-white/5 rounded-2xl p-3 border border-white/5">
                        <p className="text-[10px] font-bold text-white/30 mb-1">ERROS (24H)</p>
                        <p className={`text-2xl font-black ${data.errors24h > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                            {data.errors24h}
                        </p>
                    </div>
                </div>
            </div>

            {/* AI Status Detail */}
            <div className="p-6 space-y-6">
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
                    <div className="animate-fade-in-up">
                        <h4 className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-3 flex items-center gap-2">
                             <AlertCircle size={12} /> Últimos Erros Logados
                        </h4>
                        <div className="space-y-2">
                            {data.recentErrors.map((err, i) => (
                                <div key={i} className="text-xs p-3 rounded-xl bg-rose-500/5 border border-rose-500/10 text-white/60 font-mono overflow-hidden">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-[10px] text-rose-400/60">{new Date(err.createdAt).toLocaleTimeString()}</span>
                                        <span className="text-[10px] font-black text-white/20 uppercase">{err.metadata?.model || 'none'}</span>
                                    </div>
                                    <p className="truncate">{err.content?.replace(/⚠️ Erro: /g, '')}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Actions Section */}
                <div className="pt-2">
                    <button
                        onClick={handleTest}
                        disabled={testing}
                        className={`w-full py-4 px-6 rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50 ${
                            testing ? 'bg-white/5 text-white/30' : 'bg-accent text-white hover:bg-accent/80'
                        }`}
                    >
                        {testing ? <RefreshCw className="animate-spin" size={16} /> : <Zap size={16} />}
                        {testing ? 'Diagnosticando...' : 'Testar Conexão Nexus'}
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
