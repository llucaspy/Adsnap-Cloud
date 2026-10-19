'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { retryQuarantinedCapture } from '@/app/quarantine/actions'

export function RetryQuarantinedCapture({ jobId }: { jobId: string }) {
    const [pending, startTransition] = useTransition()
    const [message, setMessage] = useState('')
    const [queued, setQueued] = useState(false)
    const router = useRouter()
    return <div className="space-y-3">
        <button disabled={pending || queued} className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black disabled:opacity-50" onClick={() => startTransition(async () => {
            try { const result = await retryQuarantinedCapture(jobId); setQueued(true); setMessage(result.message); router.refresh() }
            catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível enfileirar a captura.') }
        })}>{pending ? 'Enfileirando…' : 'Reprocessar captura'}</button>
        <p role="status" className="text-sm text-neutral-300">{message || 'Cria uma nova tarefa e preserva esta ocorrência no histórico. Corrija a causa antes de tentar novamente.'}</p>
    </div>
}
