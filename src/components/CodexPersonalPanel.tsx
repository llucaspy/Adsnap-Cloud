'use client'

import { useEffect, useRef, useState } from 'react'

const BRIDGE = 'http://127.0.0.1:47831'
const STORAGE = 'adsnap-codex-personal-v1'
type LocalSession = { token: string; id?: string; mode: 'read' | 'edit' }
type AgentEvent = { sequence: number; type: string; text?: string; status?: string; approvalId?: string }
type ChatEntry = { id: string; role: 'user' | 'assistant'; text: string }

async function request<T>(token: string, path: string, data?: object, signal?: AbortSignal): Promise<T> {
    const response = await fetch(`${BRIDGE}${path}`, {
        method: data ? 'POST' : 'GET', credentials: 'omit', cache: 'no-store',
        headers: { Authorization: `Bearer ${token}`, ...(data ? { 'Content-Type': 'application/json' } : {}) },
        body: data ? JSON.stringify(data) : undefined, signal: signal || AbortSignal.timeout(45000),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Não foi possível acessar o Codex pessoal.')
    return result as T
}

export function CodexPersonalPanel() {
    const [local, setLocal] = useState<LocalSession | null>(null)
    const [plan, setPlan] = useState('')
    const [connected, setConnected] = useState(false)
    const [mode, setMode] = useState<'read' | 'edit'>('read')
    const [entries, setEntries] = useState<ChatEntry[]>([])
    const [approvals, setApprovals] = useState<AgentEvent[]>([])
    const [input, setInput] = useState('')
    const [busy, setBusy] = useState(false)
    const [sending, setSending] = useState(false)
    const [error, setError] = useState('')
    const [progress, setProgress] = useState('')
    const end = useRef<HTMLDivElement>(null)

    function save(value: LocalSession | null) {
        if (value) sessionStorage.setItem(STORAGE, JSON.stringify(value))
        else sessionStorage.removeItem(STORAGE)
        setLocal(value)
    }

    useEffect(() => {
        let active = true
        async function restore() {
            let value: LocalSession | null = null
            try { value = JSON.parse(sessionStorage.getItem(STORAGE) || 'null') } catch { /* invalid local state */ }
            const hash = new URLSearchParams(window.location.hash.slice(1))
            const token = hash.get('codex-pair')
            if (token && /^[a-f0-9]{64}$/.test(token)) {
                value = value?.token === token ? value : { token, mode: 'read' }
                hash.delete('codex-pair')
                window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search + (hash.size ? `#${hash}` : ''))
                sessionStorage.setItem(STORAGE, JSON.stringify(value))
            }
            if (!value || !/^[a-f0-9]{64}$/.test(value.token)) return
            try {
                const status = await request<{ plan: string }>(value.token, '/status')
                if (active) { setLocal(value); setMode(value.mode); setPlan(status.plan); setConnected(true); setError('') }
            } catch {
                if (active) { setLocal(value); setMode(value.mode); setConnected(false); setError('Não foi possível conectar ao computador. Inicie o conector, permita o acesso à rede local no navegador e conecte novamente.') }
            }
        }
        void restore()
        return () => { active = false }
    }, [])

    useEffect(() => {
        if (!local?.id) return
        const controller = new AbortController()
        let timer: ReturnType<typeof setTimeout>
        let after = 0
        async function poll() {
            try {
                const result = await request<{ events: AgentEvent[]; busy: boolean }>(local!.token, `/sessions/${local!.id}/events?after=${after}`, undefined, controller.signal)
                if (controller.signal.aborted) return
                setConnected(true)
                for (const event of result.events) {
                    after = Math.max(after, event.sequence)
                    if (event.type === 'user') setEntries(current => [...current, { id: `event-${event.sequence}`, role: 'user', text: event.text || '' }])
                    if (event.type === 'message') setEntries(current => [...current, { id: `event-${event.sequence}`, role: 'assistant', text: event.text || '' }])
                    if (event.type === 'approval') setApprovals(current => [...current, event])
                    if (event.type === 'approvalResolved') setApprovals(current => current.filter(a => a.approvalId !== event.approvalId))
                    if (event.type === 'progress') setProgress(event.text || '')
                    if (event.type === 'error') setError(event.text || 'Conector encerrado.')
                    if (event.type === 'done') {
                        setProgress(event.status === 'interrupted' ? 'Tarefa interrompida.' : 'Tarefa encerrada.')
                        setApprovals([])
                        if (event.status === 'failed') setError(event.text || 'A tarefa falhou.')
                    }
                }
                setBusy(result.busy)
                timer = setTimeout(poll, result.busy ? 1200 : 4000)
            } catch {
                if (!controller.signal.aborted) { setConnected(false); setError('A conexão caiu. A tarefa pode continuar no computador. Reconecte para conferir antes de reenviar.') }
            }
        }
        void poll()
        return () => { controller.abort(); clearTimeout(timer) }
    }, [local])

    useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [entries, progress, approvals])

    async function send() {
        if (!local || !connected || busy || sending || !input.trim()) return
        const text = input.trim()
        setInput(''); setError(''); setSending(true)
        try {
            let session = local
            if (!session.id) {
                const created = await request<{ id: string }>(local.token, '/sessions', { mode })
                session = { ...local, id: created.id, mode }
                save(session)
            }
            await request(session.token, `/sessions/${session.id}/messages`, { text })
            setBusy(true)
            setProgress('Codex está trabalhando na cópia local…')
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Falha ao enviar. Confira a tarefa antes de reenviar.')
        } finally { setSending(false) }
    }

    async function decide(approval: AgentEvent, decision: 'accept' | 'decline') {
        if (!local?.id) return
        try {
            await request(local.token, `/sessions/${local.id}/approvals`, { approvalId: approval.approvalId, decision })
            setApprovals(current => current.filter(a => a.approvalId !== approval.approvalId))
        } catch (cause) { setError(cause instanceof Error ? cause.message : 'Autorização expirada.') }
    }

    async function interrupt() {
        if (!local?.id) return
        try { await request(local.token, `/sessions/${local.id}/interrupt`, {}) }
        catch { setError('Não foi possível confirmar a interrupção. Confira o conector neste computador.') }
    }

    async function reconnect() {
        if (!local) { window.open(BRIDGE, '_blank', 'noopener,noreferrer'); return }
        setSending(true)
        try {
            const status = await request<{ plan: string }>(local.token, '/status')
            setPlan(status.plan); setConnected(true); setError(''); setEntries([]); setApprovals([]); setLocal({ ...local })
        } catch { setConnected(false); setError('Conector indisponível ou pareamento expirado. Abra o conector e faça um novo pareamento.'); save(null) }
        finally { setSending(false) }
    }

    return <div className="flex flex-col flex-1 min-h-0 text-neutral-200">
        <div className="px-5 py-3 border-b border-white/10 text-xs space-y-2">
            <p>{local ? connected ? `Computador conectado · ChatGPT ${plan || '—'}` : 'Conexão com o computador interrompida' : 'Conecte o Codex do seu computador para conversar sobre o código do Adsnap.'}</p>
            <p className="text-neutral-400">Uso pessoal · consome os limites do seu plano · código local · sem publicação automática.</p>
            <div className="flex gap-3 flex-wrap items-center">
                <button type="button" onClick={reconnect} disabled={sending} className="underline disabled:opacity-50">{local ? 'Reconectar' : 'Conectar computador'}</button>
                {local && <button type="button" onClick={() => { save(null); setConnected(false); setEntries([]); setApprovals([]); setPlan(''); setBusy(false) }} disabled={busy || sending} className="underline disabled:opacity-50">Desconectar</button>}
                {local && !local.id && <label>Permissão <select aria-label="Permissão do Codex pessoal" value={mode} onChange={e => setMode(e.target.value as 'read' | 'edit')} className="bg-neutral-900 border border-white/20 rounded px-2 py-1"><option value="read">Consultar código</option><option value="edit">Editar cópia local</option></select></label>}
                {local?.id && !busy && !sending && <button type="button" className="underline" onClick={() => { save({ token: local.token, mode }); setEntries([]); setApprovals([]); setProgress('') }}>Nova conversa</button>}
            </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-3" aria-live="polite">
            {!entries.length && <p className="text-sm text-neutral-400">Experimente: “Explique como o worker trata uma captura que falhou”. Esta versão consulta o repositório; ainda não consulta campanhas nem logs de produção.</p>}
            {entries.map(entry => <div key={entry.id} className={`p-3 rounded-lg whitespace-pre-wrap break-words text-sm ${entry.role === 'user' ? 'bg-neutral-700 ml-6' : 'bg-white/5 mr-3'}`}>{entry.text}</div>)}
            {approvals.map(approval => <div key={approval.approvalId} className="p-3 border border-amber-400/40 rounded-lg text-xs space-y-2"><p>O Codex solicita autorização para esta operação:</p><pre className="whitespace-pre-wrap break-words">{approval.text}</pre><div className="flex gap-4"><button type="button" onClick={() => decide(approval, 'accept')} className="underline">Autorizar uma vez</button><button type="button" onClick={() => decide(approval, 'decline')} className="underline">Recusar</button></div></div>)}
            {progress && <p className="text-xs text-neutral-400" role="status">{progress}</p>}
            {error && <p className="text-sm text-amber-300" role="alert">{error}</p>}
            <div ref={end} />
        </div>
        <form className="p-5 pt-2 space-y-2" onSubmit={event => { event.preventDefault(); void send() }}>
            <label className="sr-only" htmlFor="codex-personal-message">Mensagem para o Codex pessoal</label>
            <textarea id="codex-personal-message" value={input} maxLength={16000} onChange={event => setInput(event.target.value)} disabled={!local || !connected || busy || sending} placeholder="Pergunte sobre o Adsnap…" className="w-full resize-none rounded-lg p-3 bg-white/5 border border-white/20 text-sm disabled:opacity-50" rows={2} />
            <div className="flex justify-end gap-3">{busy && <button type="button" onClick={interrupt} className="text-sm underline">Interromper</button>}<button type="submit" disabled={!local || !connected || busy || sending || !input.trim()} className="rounded-lg bg-neutral-200 text-neutral-900 px-4 py-2 text-sm disabled:opacity-40">{busy || sending ? 'Trabalhando…' : 'Enviar ao Codex'}</button></div>
        </form>
    </div>
}
