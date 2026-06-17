'use client'

import { useMemo, useState } from 'react'
import { AlertCircle, CalendarDays, CheckCircle2, Download, Loader2 } from 'lucide-react'

interface PrintRangeDownloadProps {
    minDate?: string
    maxDate?: string
    totalPrints: number
}

type ExportStatus = 'idle' | 'manifest' | 'downloading' | 'zipping' | 'done' | 'error'

type ManifestFile = {
    id: string
    url: string
    fallbackUrl: string
    zipPath: string
}

type ManifestResponse = {
    zipFilename: string
    count: number
    files: ManifestFile[]
}

const CONCURRENT_DOWNLOADS = 4

function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Nao foi possivel gerar o ZIP'
}

async function fetchFile(file: ManifestFile) {
    const urls = file.url === file.fallbackUrl ? [file.url] : [file.url, file.fallbackUrl]

    for (const url of urls) {
        try {
            const response = await fetch(url, { cache: 'no-store' })
            if (!response.ok) continue
            return await response.arrayBuffer()
        } catch {
            // Retry with the next URL, usually the local proxy.
        }
    }

    throw new Error(`Falha ao baixar ${file.id}`)
}

function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
}

export function PrintRangeDownload({ minDate, maxDate, totalPrints }: PrintRangeDownloadProps) {
    const [startDate, setStartDate] = useState(maxDate ?? '')
    const [endDate, setEndDate] = useState(maxDate ?? '')
    const [status, setStatus] = useState<ExportStatus>('idle')
    const [downloadedFiles, setDownloadedFiles] = useState(0)
    const [totalFiles, setTotalFiles] = useState(0)
    const [zipProgress, setZipProgress] = useState(0)
    const [errorMessage, setErrorMessage] = useState('')

    const validationMessage = useMemo(() => {
        if (!startDate || !endDate) return 'Selecione as duas datas'
        if (startDate > endDate) return 'Intervalo invalido'
        return ''
    }, [startDate, endDate])

    const isBusy = status === 'manifest' || status === 'downloading' || status === 'zipping'
    const isDisabled = Boolean(validationMessage) || totalPrints === 0 || isBusy
    const progressPercent = status === 'zipping'
        ? zipProgress
        : totalFiles > 0
            ? Math.round((downloadedFiles / totalFiles) * 100)
            : 0

    const statusLabel = useMemo(() => {
        if (status === 'manifest') return 'Preparando lista'
        if (status === 'downloading') return `Baixando ${downloadedFiles}/${totalFiles}`
        if (status === 'zipping') return `Compactando ${zipProgress}%`
        if (status === 'done') return 'ZIP gerado'
        if (status === 'error') return errorMessage
        return validationMessage
    }, [downloadedFiles, errorMessage, status, totalFiles, validationMessage, zipProgress])

    const handleDownload = async () => {
        if (isDisabled) return

        setStatus('manifest')
        setDownloadedFiles(0)
        setTotalFiles(0)
        setZipProgress(0)
        setErrorMessage('')

        try {
            const params = new URLSearchParams({ startDate, endDate })
            const manifestResponse = await fetch(`/api/books/download/manifest?${params.toString()}`, {
                cache: 'no-store'
            })
            const manifest = await manifestResponse.json() as ManifestResponse | { error?: string }

            if (!manifestResponse.ok) {
                throw new Error('error' in manifest && manifest.error ? manifest.error : 'Erro ao preparar lista de prints')
            }

            if (!('files' in manifest) || manifest.files.length === 0) {
                throw new Error('Nenhum print encontrado nesse periodo')
            }

            const files = manifest.files
            const { default: JSZip } = await import('jszip')
            const zip = new JSZip()
            const failures: string[] = []
            let cursor = 0
            let completed = 0

            setStatus('downloading')
            setTotalFiles(files.length)

            async function worker() {
                while (cursor < files.length) {
                    const file = files[cursor]
                    cursor += 1

                    try {
                        const content = await fetchFile(file)
                        zip.file(file.zipPath, content)
                    } catch {
                        failures.push(file.zipPath)
                    } finally {
                        completed += 1
                        setDownloadedFiles(completed)
                    }
                }
            }

            const workerCount = Math.min(CONCURRENT_DOWNLOADS, files.length)
            await Promise.all(Array.from({ length: workerCount }, () => worker()))

            if (failures.length === files.length) {
                throw new Error('Nenhum arquivo conseguiu ser baixado')
            }

            if (failures.length > 0) {
                zip.file('_falhas.txt', failures.join('\n'))
            }

            setStatus('zipping')
            const blob = await zip.generateAsync({ type: 'blob' }, (metadata) => {
                setZipProgress(Math.round(metadata.percent))
            })

            downloadBlob(blob, manifest.zipFilename)
            setStatus('done')
        } catch (error) {
            setErrorMessage(getErrorMessage(error))
            setStatus('error')
        }
    }

    return (
        <section className="mb-10 rounded-[12px] border border-white/8 bg-white/[0.04] p-4 md:p-6 shadow-[rgba(0,0,0,0.30)_0px_8px_24px_0px] backdrop-blur-[16px]">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div className="min-w-0">
                    <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-[8px] border border-white/8 bg-[#7c3aed1a] text-[#7c3aed]">
                        <CalendarDays size={18} />
                    </div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-white/30">
                        Exportacao
                    </p>
                    <h2 className="mt-2 text-[22px] font-semibold leading-[1.3] text-white">
                        Prints por periodo
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
                            disabled={isBusy}
                            className="h-11 rounded-[8px] border border-white/16 bg-white/[0.04] px-3 text-[14px] font-medium text-[#e5e5e5] outline-none transition-colors focus:border-[#7c3aed] disabled:cursor-not-allowed disabled:opacity-50"
                        />
                    </label>

                    <label className="grid gap-2">
                        <span className="text-[13px] font-semibold uppercase tracking-[0.18em] text-white/35">
                            Ate
                        </span>
                        <input
                            type="date"
                            value={endDate}
                            min={minDate}
                            max={maxDate}
                            onChange={(event) => setEndDate(event.target.value)}
                            disabled={isBusy}
                            className="h-11 rounded-[8px] border border-white/16 bg-white/[0.04] px-3 text-[14px] font-medium text-[#e5e5e5] outline-none transition-colors focus:border-[#7c3aed] disabled:cursor-not-allowed disabled:opacity-50"
                        />
                    </label>

                    <button
                        type="button"
                        disabled={isDisabled}
                        onClick={handleDownload}
                        className={`inline-flex h-11 items-center justify-center gap-2 rounded-[8px] px-5 text-[14px] font-medium leading-[1.3] transition-all ${
                            isDisabled
                                ? 'cursor-not-allowed border border-white/8 bg-white/[0.03] text-white/25'
                                : 'bg-[#7c3aed] text-white hover:-translate-y-px hover:bg-[#6d28d9] active:bg-[#5b21b6]'
                        }`}
                    >
                        {isBusy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                        Baixar ZIP
                    </button>
                </div>
            </div>

            {statusLabel && totalPrints > 0 && (
                <div className="mt-4">
                    <div className="flex items-center gap-2 text-[13px] font-medium text-white/45">
                        {status === 'done' && <CheckCircle2 size={15} className="text-[#22c55e]" />}
                        {status === 'error' && <AlertCircle size={15} className="text-[#ef4444]" />}
                        <span className={status === 'error' ? 'text-[#ef4444]' : status === 'done' ? 'text-[#22c55e]' : ''}>
                            {statusLabel}
                        </span>
                    </div>

                    {isBusy && (
                        <div className="mt-3 h-1.5 overflow-hidden rounded-[4px] bg-white/[0.06]">
                            <div
                                className="h-full rounded-[4px] bg-[#7c3aed] transition-all duration-300"
                                style={{ width: `${progressPercent}%` }}
                            />
                        </div>
                    )}
                </div>
            )}
        </section>
    )
}
