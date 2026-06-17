'use client'

import { useMemo, useState } from 'react'
import { CalendarDays, Download } from 'lucide-react'

interface PrintRangeDownloadProps {
    minDate?: string
    maxDate?: string
    totalPrints: number
}

export function PrintRangeDownload({ minDate, maxDate, totalPrints }: PrintRangeDownloadProps) {
    const [startDate, setStartDate] = useState(maxDate ?? '')
    const [endDate, setEndDate] = useState(maxDate ?? '')

    const validationMessage = useMemo(() => {
        if (!startDate || !endDate) return 'Selecione as duas datas'
        if (startDate > endDate) return 'Intervalo inválido'
        return ''
    }, [startDate, endDate])

    const downloadUrl = useMemo(() => {
        if (validationMessage) return '#'

        const params = new URLSearchParams({
            startDate,
            endDate
        })

        return `/api/books/download?${params.toString()}`
    }, [endDate, startDate, validationMessage])

    const isDisabled = Boolean(validationMessage) || totalPrints === 0

    return (
        <section className="mb-10 rounded-[12px] border border-white/8 bg-white/[0.04] p-4 md:p-6 shadow-[rgba(0,0,0,0.30)_0px_8px_24px_0px] backdrop-blur-[16px]">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div className="min-w-0">
                    <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-[8px] border border-white/8 bg-[#7c3aed1a] text-[#7c3aed]">
                        <CalendarDays size={18} />
                    </div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-white/30">
                        Exportação
                    </p>
                    <h2 className="mt-2 text-[22px] font-semibold leading-[1.3] text-white">
                        Prints por período
                    </h2>
                </div>

                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                    <label className="grid gap-2">
                        <span className="text-[13px] font-semibold uppercase tracking-[0.18em] text-white/35">
                            De
                        </span>
                        <input
                            type="date"
                            value={startDate}
                            min={minDate}
                            max={maxDate}
                            onChange={(event) => setStartDate(event.target.value)}
                            className="h-11 rounded-[8px] border border-white/16 bg-white/[0.04] px-3 text-[14px] font-medium text-[#e5e5e5] outline-none transition-colors focus:border-[#7c3aed]"
                        />
                    </label>

                    <label className="grid gap-2">
                        <span className="text-[13px] font-semibold uppercase tracking-[0.18em] text-white/35">
                            Até
                        </span>
                        <input
                            type="date"
                            value={endDate}
                            min={minDate}
                            max={maxDate}
                            onChange={(event) => setEndDate(event.target.value)}
                            className="h-11 rounded-[8px] border border-white/16 bg-white/[0.04] px-3 text-[14px] font-medium text-[#e5e5e5] outline-none transition-colors focus:border-[#7c3aed]"
                        />
                    </label>

                    <a
                        href={isDisabled ? undefined : downloadUrl}
                        aria-disabled={isDisabled}
                        onClick={(event) => {
                            if (isDisabled) event.preventDefault()
                        }}
                        className={`inline-flex h-11 items-center justify-center gap-2 rounded-[8px] px-5 text-[14px] font-medium leading-[1.3] transition-all ${
                            isDisabled
                                ? 'cursor-not-allowed border border-white/8 bg-white/[0.03] text-white/25'
                                : 'bg-[#7c3aed] text-white hover:-translate-y-px hover:bg-[#6d28d9] active:bg-[#5b21b6]'
                        }`}
                    >
                        <Download size={16} />
                        Baixar ZIP
                    </a>
                </div>
            </div>

            {validationMessage && totalPrints > 0 && (
                <p className="mt-3 text-[13px] font-medium text-[#f59e0b]">
                    {validationMessage}
                </p>
            )}
        </section>
    )
}
