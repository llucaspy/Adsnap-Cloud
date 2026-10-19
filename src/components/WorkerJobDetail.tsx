import Link from 'next/link'
import { describeCaptureFailure, type CaptureAttemptEvent } from '@/lib/captureFailure'
import { RetryQuarantinedCapture } from './RetryQuarantinedCapture'

export type WorkerJobDiagnostic = {
    id: string
    campaignId: string
    campaignName: string
    client: string
    pi: string
    device: string
    formatLabel: string
    status: string
    campaignStatus: string
    runId: string | null
    attempts: number
    maxAttempts: number | null
    scheduledFor: string | null
    startedAt: string | null
    finishedAt: string | null
    lockedUntil: string | null
    lastError: string | null
    isLegacy: boolean
    attemptEvents?: (CaptureAttemptEvent & { at: string })[]
    pageAddress?: string
    captureDelaySeconds?: number
    canRetry?: boolean
    telegramStatus?: string
    logs: { id: string; level: string; message: string; details: string | null; createdAt: string }[]
}

function clock(value: string | null) {
    return value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'America/Sao_Paulo' }).format(new Date(value)) : '—'
}

const card = { border: '1px solid #343434', borderRadius: 12, padding: 18, background: '#191919' }

export function WorkerJobDetail({ item }: { item: WorkerJobDiagnostic }) {
    return <main style={{ color: '#f5f5f5', maxWidth: 1100, margin: '0 auto', padding: '16px 0 40px' }}>
        <div style={{ display: 'flex', gap: 24, marginBottom: 22 }}><Link href="/quarantine" style={{ color: '#d4d4d4' }}>← Quarentena e falhas</Link><Link href="/workers" style={{ color: '#d4d4d4' }}>Workers</Link></div>
        <p style={{ color: '#a3a3a3', fontSize: 12 }}>DIAGNÓSTICO DA CAPTURA · HORÁRIO DE BRASÍLIA</p>
        <h1 style={{ fontSize: 'clamp(26px, 4vw, 40px)', margin: '10px 0' }}>{item.client}</h1>
        <p style={{ color: '#d4d4d4' }}>PI {item.pi} · {item.campaignName} · {item.formatLabel} · {item.device}</p>
        <p style={{ color: '#a3a3a3', overflowWrap: 'anywhere', fontSize: 12 }}>{item.isLegacy ? 'Campanha legada' : 'Tarefa'}: {item.id}</p>
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, margin: '24px 0' }}>
            {[
                ['Estado da tarefa', item.status], ['Estado da campanha', item.campaignStatus],
                ['Tentativas', `${item.attempts}${item.maxAttempts ? ` de ${item.maxAttempts}` : ''}`],
                ['Agendada para', clock(item.scheduledFor)], ['Início', clock(item.startedAt)],
                ['Fim', clock(item.finishedAt)], ['Reserva até', clock(item.lockedUntil)],
                ['Execução', item.runId || (item.attempts > 0 ? 'Sem reserva ativa' : 'Não iniciada')],
            ].map(([label, value]) => <div key={label} style={card}><p style={{ color: '#a3a3a3', margin: '0 0 10px', fontSize: 12 }}>{label}</p><strong style={{ overflowWrap: 'anywhere', fontSize: 14 }}>{value}</strong></div>)}
        </section>
        {item.lastError && <section style={{ ...card, borderColor: '#b45353', marginBottom: 24 }}>
            <h2 style={{ fontSize: 18, marginTop: 0 }}>Motivo registrado</h2>
            <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: '#fecaca', lineHeight: 1.6 }}>{item.lastError}</p>
            <p style={{ lineHeight: 1.6 }}>{describeCaptureFailure(item.lastError).category}: {describeCaptureFailure(item.lastError).suggestion}</p>
            <p style={{ color: '#a3a3a3', fontSize: 12 }}>Esta classificação é uma orientação baseada no erro registrado; confirme a causa nos eventos.</p>
        </section>}
        {item.pageAddress && <section style={{ ...card, marginBottom: 24 }}><h2 style={{ fontSize: 18, marginTop: 0 }}>Contexto e notificação</h2>
            <p style={{ overflowWrap: 'anywhere', lineHeight: 1.6 }}>Página: {item.pageAddress}</p>
            <p>Atraso configurado: {item.captureDelaySeconds}s</p>
            <p style={{ color: '#a3a3a3', lineHeight: 1.6 }}>A página, o formato e o dispositivo mostram a configuração atual da campanha. Parâmetros privados do endereço são omitidos.</p>
            <p style={{ lineHeight: 1.6 }}>Telegram: {item.telegramStatus}</p>
            {item.canRetry && <RetryQuarantinedCapture jobId={item.id} />}
        </section>}
        {item.attemptEvents && <section style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 22 }}>Histórico das tentativas</h2>
            {item.attemptEvents.length === 0 ? <p style={{ ...card, color: '#a3a3a3' }}>Esta tarefa não possui eventos de tentativa individualizados. Consulte os registros antigos abaixo.</p> : <div style={{ display: 'grid', gap: 10 }}>{item.attemptEvents.map((event, index) => <article key={`${event.attempt}-${event.phase}-${index}`} style={card}>
                <strong>Tentativa {event.attempt} · {({ STARTED: 'Iniciada', SUCCESS: 'Concluída', RETRY: 'Voltou à fila', FAILED: 'Tentativas esgotadas', QUARANTINE: 'Quarentena', UNCONFIRMED: 'Resultado não confirmado' })[event.phase]}</strong>
                <p style={{ color: '#a3a3a3', fontSize: 12 }}>{clock(event.at)}{event.timeoutMs ? ` · Limite: ${Math.round(event.timeoutMs / 1000)}s` : ''}</p>
                {event.error && <p style={{ overflowWrap: 'anywhere', lineHeight: 1.6 }}>{event.error}</p>}
                <p style={{ color: '#a3a3a3', fontSize: 12, overflowWrap: 'anywhere' }}>Execução: {event.runId}</p>
            </article>)}</div>}
            <p style={{ color: '#a3a3a3', fontSize: 12, lineHeight: 1.6 }}>Uma tentativa sem evento de conclusão pode indicar interrupção do worker ou indisponibilidade do registro. Uma falha sem imagem não possui evidência visual para exibir.</p>
        </section>}
        <section>
            <h2 style={{ fontSize: 22 }}>Eventos da captura</h2>
            <p style={{ color: '#a3a3a3', lineHeight: 1.6 }}>{item.isLegacy ? 'Eventos recentes desta campanha. O registro legado não possui identidade de job.' : 'Eventos da campanha no intervalo desta tarefa. Registros antigos podem não identificar a tentativa individual.'} Mostrando até 100 eventos, do mais recente ao mais antigo.</p>
            {item.logs.length === 0 && <p style={card}>Nenhum evento persistido neste intervalo.</p>}
            <div style={{ display: 'grid', gap: 10 }}>
                {item.logs.map(log => <article key={log.id} style={card}>
                    <p style={{ color: '#a3a3a3', fontSize: 12, marginTop: 0 }}>{clock(log.createdAt)} · {log.level}</p>
                    <p style={{ lineHeight: 1.6, overflowWrap: 'anywhere', marginBottom: log.details ? 12 : 0 }}>{log.message}</p>
                    {log.details && <details><summary style={{ cursor: 'pointer', color: '#d4d4d4' }}>Detalhes técnicos</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 12, lineHeight: 1.6 }}>{log.details}</pre></details>}
                </article>)}
            </div>
        </section>
        <p style={{ color: '#a3a3a3', marginTop: 24, lineHeight: 1.6 }}>O estado técnico da tarefa não substitui a revisão da evidência. As capturas e montagens continuam disponíveis no Books.</p>
    </main>
}
