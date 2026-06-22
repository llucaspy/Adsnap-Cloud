'use client'

import {
    queueGovernmentBookDayEmail,
    queueGovernmentReportManual,
} from '@/app/admin/government-report-actions'
import { LoaderCircle, Mail, RotateCcw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

type BookEmailButtonProps = {
    pi: string
    initialStatus?: string | null
    reportDate?: string
}

export function BookEmailButton({ pi, initialStatus, reportDate }: BookEmailButtonProps) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [status, setStatus] = useState(initialStatus || '')
    const [message, setMessage] = useState('')

    const isQueued = ['QUEUED_MANUAL', 'PROCESSING'].includes(status)
    const wasSent = status === 'SENT'

    function sendBook() {
        setMessage('')
        startTransition(async () => {
            try {
                const result = reportDate
                    ? await queueGovernmentBookDayEmail(pi, reportDate)
                    : await queueGovernmentReportManual(pi)
                if (!result.success) {
                    setMessage(result.error || 'Nao foi possivel enfileirar o book')
                    return
                }

                setStatus('QUEUED_MANUAL')
                setMessage(result.message || 'Book enfileirado para envio')
                router.refresh()
            } catch (error) {
                setMessage(error instanceof Error ? error.message : 'Falha ao solicitar o envio')
            }
        })
    }

    const Icon = isPending || isQueued ? LoaderCircle : wasSent ? RotateCcw : Mail
    const label = isPending
        ? 'Enfileirando...'
        : isQueued
            ? 'Envio na fila'
            : wasSent
                ? reportDate ? 'Reenviar prints do dia' : 'Reenviar book completo'
                : reportDate ? 'Enviar prints do dia' : 'Enviar book completo'

    return (
        <div className="flex min-w-[220px] flex-col items-end gap-2">
            <button
                type="button"
                onClick={sendBook}
                disabled={isPending || isQueued}
                title={reportDate ? `Enviar somente os prints de ${reportDate}` : 'Enviar o book completo em arquivo ZIP'}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#7c3aed] px-5 py-2.5 text-sm font-medium text-white transition-[background,transform,opacity] duration-200 hover:-translate-y-px hover:bg-[#6d28d9] active:bg-[#5b21b6] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
            >
                <Icon size={18} className={isPending || isQueued ? 'animate-spin' : ''} />
                {label}
            </button>
            {message && (
                <p
                    role="status"
                    className={`max-w-[320px] text-right text-xs leading-5 ${status === 'QUEUED_MANUAL' ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}
                >
                    {message}
                </p>
            )}
        </div>
    )
}
