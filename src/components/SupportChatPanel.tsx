'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'

type Action = { id: string; type: string; status: string; payload: { reason?: string }; result?: { queued?: number; success?: number; failed?: number; pis?: string[] } }
type Turn = { id: string; requestId?: string; userText: string; assistantText: string; status: string; actions: Action[] }
type Conversation = { id: string; title: string; turns: Turn[] }
type Summary = { id: string; title: string }
type Executor = { online: boolean; state: string }
type Outgoing = { conversationId: string; requestId: string; text: string; state: 'sending' | 'received' | 'unconfirmed'; id?: string }
async function api<T>(path: string, body?: object, signal?: AbortSignal): Promise<T> {
    const timeout = AbortSignal.timeout(25000)
    const response = await fetch(`/api/support${path}`, { method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, signal: signal ? AbortSignal.any([signal, timeout]) : timeout })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Não foi possível acessar o atendimento.')
    return result as T
}

const actionLabels: Record<string, string> = { RETRY_CAPTURE: 'Reprocessar capturas', VERIFIED_PREVIEW: 'Autorizar prévias modificadas', TECHNICAL_REVIEW: 'Registrar análise técnica' }
const stateLabels: Record<string, string> = { PENDING: 'Aguardando sua confirmação', QUEUED: 'Acompanhando a fila de capturas', SUCCESS: 'Capturas concluídas', FAILED: 'Há falhas; solicite um novo diagnóstico', REVIEW_REQUIRED: 'Ocorrência interna registrada · restrita ao erro informado', ANALYZING: 'Ocorrência em análise interna', INTERNAL_REVIEW: 'Análise interna registrada · requer validação técnica', VALIDATION_REQUIRED: 'Correção interna preparada · aguardando validação' }

export function SupportChatPanel() {
    const [summaries, setSummaries] = useState<Summary[]>([])
    const [selected, setSelected] = useState('')
    const [conversation, setConversation] = useState<Conversation | null>(null)
    const [executor, setExecutor] = useState<Executor>({ online: false, state: 'OFFLINE' })
    const [available, setAvailable] = useState(false)
    const [initializing, setInitializing] = useState(true)
    const [input, setInput] = useState('')
    const [sending, setSending] = useState(false)
    const [error, setError] = useState('')
    const [acting, setActing] = useState('')
    const [refresh, setRefresh] = useState(0)
    const [outgoing, setOutgoing] = useState<Outgoing | null>(null)
    const pending = useRef<Outgoing | null>(null)
    const sendingRef = useRef(false)
    const initialized = useRef(false)
    const end = useRef<HTMLDivElement>(null)
    const composer = useRef<HTMLTextAreaElement>(null)
    const busy = !!conversation?.turns.some(t => ['QUEUED', 'RUNNING'].includes(t.status))
    const lastTurnStatus = conversation?.turns.at(-1)?.status
    const outgoingVisible = outgoing && !conversation?.turns.some(t => t.id === outgoing.id || t.requestId === outgoing.requestId)
    const waitingForReceipt = !!outgoingVisible
    const loadingConversation = !!selected && conversation?.id !== selected

    useEffect(() => {
        const controller = new AbortController()
        async function load() {
            try {
                const data = await api<{ conversations: Summary[]; executor: Executor }>('', undefined, controller.signal)
                setSummaries(data.conversations); setExecutor(data.executor); setAvailable(true)
                if (!initialized.current) { initialized.current = true; if (data.conversations.length) setSelected(data.conversations[0].id) }
            } catch (cause) { if (!controller.signal.aborted) { setAvailable(false); setError(cause instanceof Error ? cause.message : 'Atendimento indisponível.') } }
            finally { if (!controller.signal.aborted) setInitializing(false) }
        }
        void load()
        return () => controller.abort()
    }, [refresh])

    useEffect(() => {
        if (!selected) return
        const controller = new AbortController()
        let timer: ReturnType<typeof setTimeout>
        async function poll() {
            try {
                const result = await api<{ conversation: Conversation; executor: Executor }>(`/${selected}`, undefined, controller.signal)
                if (controller.signal.aborted) return
                setConversation(result.conversation); setExecutor(result.executor); setAvailable(true)
                if (pending.current && result.conversation.turns.some(t => t.requestId === pending.current?.requestId)) {
                    pending.current = null; setError('')
                }
                const active = result.conversation.turns.some(t => ['QUEUED', 'RUNNING'].includes(t.status)) || result.conversation.turns.some(t => t.actions.some(a => a.status === 'QUEUED'))
                timer = setTimeout(poll, document.visibilityState === 'hidden' || !result.executor.online ? 15000 : active ? 3000 : 30000)
            } catch (cause) {
                if (!controller.signal.aborted) { setAvailable(false); setError(cause instanceof Error ? cause.message : 'A conexão caiu. O histórico permanece salvo.'); timer = setTimeout(poll, 10000) }
            }
        }
        void poll()
        return () => { controller.abort(); clearTimeout(timer) }
    }, [selected, refresh])

    useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [conversation?.turns.length, lastTurnStatus, outgoing?.requestId, outgoing?.state])

    async function send() {
        const text = input.trim()
        if (!available || !text || sendingRef.current || busy || waitingForReceipt || loadingConversation) return
        const message: Outgoing = { conversationId: selected, requestId: crypto.randomUUID(), text, state: 'sending' }
        pending.current = message
        setOutgoing(message); setInput('')
        composer.current?.focus()
        await deliver(message)
    }

    async function deliver(message: Outgoing) {
        if (sendingRef.current) return
        sendingRef.current = true
        setSending(true); setError(''); setOutgoing({ ...message, state: 'sending' })
        try {
            let id = message.conversationId
            if (!id) {
                const created = await api<Summary>('', { title: message.text.slice(0, 90) })
                id = created.id; setSelected(id); setSummaries(current => [created, ...current])
                message = { ...message, conversationId: id }
                pending.current = message
            }
            const received = await api<{ id: string; status: string }>(`/${id}`, { requestId: message.requestId, message: message.text })
            setOutgoing({ ...message, id: received.id, state: 'received' }); setRefresh(n => n + 1)
        } catch {
            setOutgoing({ ...message, state: 'unconfirmed' })
            if (pending.current?.requestId === message.requestId) setError('Não foi possível confirmar o envio. Sua mensagem está aqui; tente novamente sem duplicá-la.')
        }
        finally { sendingRef.current = false; setSending(false) }
    }
    async function confirm(actionId: string) {
        if (acting) return
        setActing(actionId); setError('')
        try { await api(`/actions/${actionId}`, {}); setRefresh(n => n + 1) }
        catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível confirmar a operação. Confira o histórico antes de repetir.') }
        finally { setActing('') }
    }

    return <div className="flex-1 min-h-0 flex flex-col text-neutral-200">
        <div className="px-5 py-3 border-b border-white/10 text-xs space-y-2">
            <p role="status" className="flex items-center gap-2">{initializing && <span aria-hidden="true" className="h-3 w-3 rounded-full border-2 border-neutral-500 border-t-white motion-safe:animate-spin" />}{initializing ? 'Iniciando agente… Você já pode escrever.' : !available ? 'Conexão indisponível · seu texto permanece aqui' : executor.state === 'LIMITED' ? 'Atendimento pausado pelo limite de uso' : executor.online ? 'Nexus conectado' : 'Nexus desconectado · mensagens aguardam na fila'}</p>
            <div className="flex items-center gap-3">
                <label className="sr-only" htmlFor="support-conversation">Conversa de atendimento</label>
                <select id="support-conversation" value={selected} disabled={sending || waitingForReceipt || initializing} onChange={e => { setSelected(e.target.value); setConversation(null); setOutgoing(null); pending.current = null; setError('') }} className="bg-neutral-900 border border-white/20 rounded p-1 max-w-[200px] min-w-0"><option value="">Nova conversa</option>{summaries.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select>
                <button type="button" onClick={() => { setError(''); setRefresh(n => n + 1) }} className="underline">Atualizar</button>
            </div>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0 p-5 space-y-3" aria-live="polite">
            {loadingConversation && <p role="status" className="text-xs text-neutral-400">Carregando histórico… Você já pode escrever.</p>}
            {!conversation?.turns.length && <p className="text-sm text-neutral-400">Sou Nexus, (estou em fase de teste...) Posso ajudar com perguntas sobre campanhas, cadastros, prints e tutoriais. Informe o PI ou descreva o que precisa; vou consultar os dados e orientar a solução. O histórico fica salvo na sua conta.</p>}
            {conversation?.turns.map(turn => <div key={turn.id} className="space-y-3">
                <div className="ml-6 bg-neutral-700 rounded-lg p-3 text-sm whitespace-pre-wrap break-words">{turn.userText}</div>
                {turn.assistantText && <div className="mr-3 bg-white/5 rounded-lg p-3 text-sm break-words"><ReactMarkdown skipHtml components={{
                    p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                    ul: ({ children }) => <ul className="list-disc pl-5 my-2">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal pl-5 my-2">{children}</ol>,
                    pre: ({ children }) => <pre className="whitespace-pre-wrap break-words text-xs bg-black/20 p-2 rounded my-2">{children}</pre>,
                    a: ({ href, children }) => href && /^\/(?:books|workers|campaigns|quarantine)(?:\/|[?#]|$)/.test(href) ? <Link href={href} className="underline">{children}</Link> : <span>{children}</span>,
                }}>{turn.assistantText}</ReactMarkdown></div>}
                {turn.status === 'QUEUED' && <p className="text-xs text-neutral-400">Mensagem recebida · aguardando atendimento</p>}
                {turn.status === 'RUNNING' && <p className="text-xs text-neutral-400">Nexus está analisando sua solicitação…</p>}
                {turn.actions.map(action => <div key={action.id} className="rounded-lg border border-white/20 p-3 space-y-2 text-xs">
                    <p className="font-semibold">{actionLabels[action.type] || 'Operação de atendimento'}</p>
                    <p className="whitespace-pre-wrap break-words">{action.payload.reason}</p>
                    {action.type === 'VERIFIED_PREVIEW' && <p className="text-amber-200">Gera prévias identificadas como modificadas. Elas não comprovam exibição observada no portal.</p>}
                    <p>{stateLabels[action.status] || action.status}</p>
                    {action.result?.queued !== undefined && <p>{action.result.success || 0}/{action.result.queued} concluídas · {action.result.failed || 0} falhas</p>}
                    {action.status === 'PENDING' && <button type="button" disabled={!!acting} onClick={() => confirm(action.id)} className="bg-neutral-200 text-neutral-900 px-3 py-2 rounded disabled:opacity-40">{acting === action.id ? 'Confirmando…' : actionLabels[action.type]}</button>}
                    {action.result?.pis?.map(pi => <Link key={pi} href={`/books/${encodeURIComponent(pi)}`} className="inline-block underline mr-3">Abrir book do PI {pi}</Link>)}
                </div>)}
            </div>)}
            {outgoingVisible && outgoing && <div className="space-y-2" data-testid="outgoing-message">
                <div className="ml-6 bg-neutral-700 rounded-lg p-3 text-sm whitespace-pre-wrap break-words">{outgoing.text}</div>
                <p role="status" className="text-xs text-neutral-400">{outgoing.state === 'sending' ? 'Enviando mensagem…' : outgoing.state === 'unconfirmed' ? 'Envio não confirmado · mensagem preservada' : 'Mensagem recebida · aguardando atendimento'}</p>
                {outgoing.state === 'unconfirmed' && <button type="button" onClick={() => void deliver(outgoing)} className="text-xs underline">Tentar enviar novamente</button>}
            </div>}
            {error && <p role="alert" className="text-sm text-amber-300">{error}</p>}
            <div ref={end} />
        </div>
        <form className="p-5 pt-2 space-y-2" onSubmit={event => { event.preventDefault(); void send() }}>
            <label htmlFor="support-message" className="sr-only">Mensagem para o suporte Adsnap</label>
            <textarea ref={composer} id="support-message" value={input} maxLength={6000} onChange={e => setInput(e.target.value)} rows={2} placeholder="Ex.: a campanha do PI 385592 está falhando…" className="w-full resize-none rounded-lg p-3 bg-white/5 border border-white/20 text-sm" />
            {(sending || busy || waitingForReceipt) && <p className="text-xs text-neutral-400">Você pode preparar a próxima mensagem enquanto aguarda.</p>}
            <div className="flex justify-end"><button type="submit" disabled={!available || loadingConversation || busy || sending || waitingForReceipt || !input.trim()} className="rounded-lg bg-neutral-200 text-neutral-900 px-4 py-2 text-sm disabled:opacity-40">{initializing ? 'Iniciando agente…' : sending ? 'Enviando…' : busy || waitingForReceipt ? 'Aguardando resposta…' : 'Enviar ao Nexus'}</button></div>
        </form>
    </div>
}
