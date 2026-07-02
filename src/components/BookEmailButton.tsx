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
                    setStatus('FAILED')
                    setMessage(result.error || 'Nao foi possivel enviar o book')
                    return
                }

                setStatus('sent' in result && result.sent ? 'SENT' : 'PROCESSING')
                setMessage(result.message || 'Book enviado por e-mail')
                router.refresh()
            } catch (error) {
                setStatus('FAILED')
                setMessage(error instanceof Error ? error.message : 'Falha ao solicitar o envio')
            }
        })
    }

    const Icon = isPending || isQueued ? LoaderCircle : wasSent ? RotateCcw : Mail
    const label = isPending
        ? 'Enviando...'
        : isQueued
            ? 'Envio em andamento'
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
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#e5e5e5] px-5 py-2.5 text-sm font-medium text-[#0f0f0f] transition-[background,transform,opacity] duration-200 hover:-translate-y-px hover:bg-[#d4d4d4] active:bg-[#a3a3a3] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
            >
                <Icon size={18} className={isPending || isQueued ? 'animate-spin' : ''} />
                {label}
            </button>
            {message && (
                <p
                    role="status"
                    className={`max-w-[320px] text-right text-xs leading-5 ${status === 'FAILED' ? 'text-[#ef4444]' : 'text-[#22c55e]'}`}
                >
                    {message}
                </p>
            )}
        </div>
    )
}
