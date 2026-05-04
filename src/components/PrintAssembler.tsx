'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Upload, Download, ChevronRight, ChevronLeft, Check, Loader2, Plus, Trash2 } from 'lucide-react'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { getMontagemTemplates, type TemplateInfo } from '@/app/montagem/actions'

interface Position {
    x: number
    y: number
    width: number
    height: number
}

interface TemplateWithPosition {
    template: TemplateInfo
    position: Position | null
}

interface CreativeEntry {
    id: string
    file: File
    preview: string
    dateStart: string
    dateEnd: string
}

export default function PrintAssembler() {
    const [step, setStep] = useState(1)
    const [templates, setTemplates] = useState<TemplateInfo[]>([])
    const [selectedTemplates, setSelectedTemplates] = useState<TemplateWithPosition[]>([])
    const [loading, setLoading] = useState(true)
    const [dateStart, setDateStart] = useState('')
    const [dateEnd, setDateEnd] = useState('')

    // Múltiplos criativos com sub-períodos
    const [creatives, setCreatives] = useState<CreativeEntry[]>([])

    const [currentTemplateIdx, setCurrentTemplateIdx] = useState(0)
    const [isProcessing, setIsProcessing] = useState(false)
    const [progress, setProgress] = useState(0)
    const [progressText, setProgressText] = useState('')
    const [isDragging, setIsDragging] = useState(false)
    const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
    const [missingDays, setMissingDays] = useState<Record<string, string[]>>({})

    const canvasRef = useRef<HTMLCanvasElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [pendingCreativeIdx, setPendingCreativeIdx] = useState<number | null>(null)

    useEffect(() => {
        async function load() {
            try {
                const data = await getMontagemTemplates()
                setTemplates(data.templates)
            } catch (err) {
                console.error('Erro ao carregar templates:', err)
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [])

    const getDaysInRange = (start?: string, end?: string): string[] => {
        const s = start || dateStart
        const e = end || dateEnd
        if (!s || !e) return []
        const days: string[] = []
        const current = new Date(s + 'T12:00:00')
        const endDate = new Date(e + 'T12:00:00')
        while (current <= endDate) {
            days.push(current.toISOString().split('T')[0])
            current.setDate(current.getDate() + 1)
        }
        return days
    }

    useEffect(() => {
        if (step === 2 && dateStart && dateEnd && selectedTemplates.length > 0) {
            const days = getDaysInRange()
            const missing: Record<string, string[]> = {}
            for (const t of selectedTemplates) {
                const missingForTemplate = days.filter(d => !t.template.capturesByDate[d])
                if (missingForTemplate.length > 0) {
                    missing[t.template.campaignId] = missingForTemplate
                }
            }
            setMissingDays(missing)
        }
    }, [step, dateStart, dateEnd, selectedTemplates])

    // Buscar o criativo correto para um dia específico
    const getCreativeForDay = (day: string): CreativeEntry | null => {
        for (const c of creatives) {
            if (c.dateStart <= day && day <= c.dateEnd) return c
        }
        return null
    }

    // Canvas: preview do primeiro criativo disponível
    const firstCreativePreview = creatives.length > 0 ? creatives[0].preview : null

    const drawCanvas = useCallback(async () => {
        const canvas = canvasRef.current
        if (!canvas || selectedTemplates.length === 0) return
        const current = selectedTemplates[currentTemplateIdx]
        if (!current) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const img = new window.Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => {
            canvas.width = img.width
            canvas.height = img.height
            ctx.drawImage(img, 0, 0)

            if (current.position && firstCreativePreview) {
                const creative = new window.Image()
                creative.crossOrigin = 'anonymous'
                creative.onload = () => {
                    const p = current.position!
                    ctx.drawImage(creative, p.x, p.y, p.width, p.height)
                    ctx.strokeStyle = '#00ff88'
                    ctx.lineWidth = 2
                    ctx.setLineDash([5, 5])
                    ctx.strokeRect(p.x, p.y, p.width, p.height)
                    ctx.setLineDash([])
                }
                creative.src = firstCreativePreview
            } else if (current.position) {
                const p = current.position
                ctx.fillStyle = 'rgba(0, 255, 136, 0.15)'
                ctx.fillRect(p.x, p.y, p.width, p.height)
                ctx.strokeStyle = '#00ff88'
                ctx.lineWidth = 2
                ctx.strokeRect(p.x, p.y, p.width, p.height)
                ctx.fillStyle = '#00ff88'
                ctx.font = '14px Inter, sans-serif'
                ctx.fillText(`${p.width}x${p.height}`, p.x + 4, p.y + 18)
            }
        }
        img.src = current.template.latestScreenshot
    }, [selectedTemplates, currentTemplateIdx, firstCreativePreview])

    useEffect(() => {
        if (step === 4) drawCanvas()
    }, [step, currentTemplateIdx, selectedTemplates, drawCanvas])

    const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current
        if (!canvas) return { x: 0, y: 0 }
        const rect = canvas.getBoundingClientRect()
        const scaleX = canvas.width / rect.width
        const scaleY = canvas.height / rect.height
        return {
            x: Math.round((e.clientX - rect.left) * scaleX),
            y: Math.round((e.clientY - rect.top) * scaleY),
        }
    }

    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        setDragStart(getCanvasCoords(e))
        setIsDragging(true)
    }

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDragging || !dragStart) return
        const coords = getCanvasCoords(e)
        updateCurrentPosition({
            x: Math.min(dragStart.x, coords.x),
            y: Math.min(dragStart.y, coords.y),
            width: Math.abs(coords.x - dragStart.x),
            height: Math.abs(coords.y - dragStart.y),
        })
    }

    const handleMouseUp = () => {
        setIsDragging(false)
        setDragStart(null)
    }

    const updateCurrentPosition = (pos: Position) => {
        setSelectedTemplates(prev => {
            const next = [...prev]
            next[currentTemplateIdx] = { ...next[currentTemplateIdx], position: pos }
            return next
        })
    }

    const toggleTemplate = (t: TemplateInfo) => {
        setSelectedTemplates(prev => {
            const exists = prev.find(s => s.template.campaignId === t.campaignId)
            if (exists) return prev.filter(s => s.template.campaignId !== t.campaignId)
            return [...prev, { template: t, position: null }]
        })
    }

    const isSelected = (t: TemplateInfo) => selectedTemplates.some(s => s.template.campaignId === t.campaignId)

    // ============================================================
    //  CRIATIVOS — Múltiplos com sub-períodos
    // ============================================================
    const addCreativeSlot = () => {
        setCreatives(prev => [...prev, {
            id: crypto.randomUUID(),
            file: null as any,
            preview: '',
            dateStart: dateStart,
            dateEnd: dateEnd,
        }])
    }

    const removeCreative = (id: string) => {
        setCreatives(prev => prev.filter(c => c.id !== id))
    }

    const updateCreativeDates = (id: string, field: 'dateStart' | 'dateEnd', value: string) => {
        setCreatives(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c))
    }

    const handleCreativeFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file || pendingCreativeIdx === null) return

        const reader = new FileReader()
        reader.onload = (ev) => {
            const preview = ev.target?.result as string
            setCreatives(prev => {
                const next = [...prev]
                next[pendingCreativeIdx] = { ...next[pendingCreativeIdx], file, preview }
                return next
            })
        }
        reader.readAsDataURL(file)
        setPendingCreativeIdx(null)
        // Reset input
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    const triggerFileUpload = (idx: number) => {
        setPendingCreativeIdx(idx)
        fileInputRef.current?.click()
    }

    // Cobertura dos dias
    const getCoverage = () => {
        const days = getDaysInRange()
        const covered = days.filter(d => getCreativeForDay(d) !== null)
        return { total: days.length, covered: covered.length, uncovered: days.length - covered.length }
    }

    // ============================================================
    //  GERAR ZIP — Usa print do dia + criativo do dia
    // ============================================================
    const generateZip = async () => {
        if (creatives.length === 0 || selectedTemplates.length === 0) return
        setIsProcessing(true)
        setProgress(0)

        const zip = new JSZip()
        const days = getDaysInRange()

        let totalImages = 0
        let processed = 0
        let skipped = 0

        for (const tmplWithPos of selectedTemplates) {
            if (!tmplWithPos.position) continue
            for (const day of days) {
                if (tmplWithPos.template.capturesByDate[day] && getCreativeForDay(day)) totalImages++
            }
        }

        for (const tmplWithPos of selectedTemplates) {
            if (!tmplWithPos.position) continue

            const folderName = `${tmplWithPos.template.device}_${tmplWithPos.template.format.substring(0, 8)}`
            const folder = zip.folder(folderName)!

            for (const day of days) {
                const screenshotUrl = tmplWithPos.template.capturesByDate[day]
                const creative = getCreativeForDay(day)

                if (!screenshotUrl) {
                    skipped++
                    continue
                }
                if (!creative) {
                    skipped++
                    setProgressText(`⚠️ Dia ${day}: sem criativo atribuído`)
                    continue
                }

                try {
                    setProgressText(`Processando ${day} (${tmplWithPos.template.device})...`)
                    const blob = await renderOverlay(
                        screenshotUrl,
                        creative.preview,
                        tmplWithPos.position
                    )
                    folder.file(`montagem_${day}.png`, blob)
                } catch (err) {
                    console.error(`Erro ${day}:`, err)
                    skipped++
                }
                processed++
                setProgress(Math.round((processed / totalImages) * 100))
            }
        }

        setProgressText(`Gerando ZIP...`)
        const content = await zip.generateAsync({ type: 'blob' })
        saveAs(content, `montagem_${dateStart}_a_${dateEnd}.zip`)
        setIsProcessing(false)
        setProgressText(`✅ ${processed} montagens geradas.${skipped > 0 ? ` ${skipped} pulados.` : ''}`)
    }

    const renderOverlay = (templateUrl: string, creativeDataUrl: string, pos: Position): Promise<Blob> => {
        return new Promise((resolve, reject) => {
            const templateImg = new window.Image()
            templateImg.crossOrigin = 'anonymous'
            templateImg.onload = () => {
                const creativeImg = new window.Image()
                creativeImg.onload = () => {
                    const offscreen = document.createElement('canvas')
                    offscreen.width = templateImg.width
                    offscreen.height = templateImg.height
                    const ctx = offscreen.getContext('2d')!
                    ctx.drawImage(templateImg, 0, 0)
                    ctx.drawImage(creativeImg, pos.x, pos.y, pos.width, pos.height)
                    offscreen.toBlob(blob => {
                        if (blob) resolve(blob)
                        else reject(new Error('Erro ao gerar blob'))
                    }, 'image/png')
                }
                creativeImg.onerror = reject
                creativeImg.src = creativeDataUrl
            }
            templateImg.onerror = reject
            templateImg.src = templateUrl
        })
    }

    const canAdvance = () => {
        switch (step) {
            case 1: return selectedTemplates.length > 0
            case 2: return dateStart && dateEnd && dateStart <= dateEnd
            case 3: return creatives.length > 0 && creatives.every(c => c.preview && c.dateStart && c.dateEnd)
            case 4: return selectedTemplates.every(t => t.position !== null)
            default: return false
        }
    }

    const stepTitles = ['Templates', 'Período', 'Criativos', 'Posicionar & Gerar']

    const availableDaysCount = () => {
        const days = getDaysInRange()
        if (days.length === 0 || selectedTemplates.length === 0) return { total: 0, available: 0 }
        let available = 0
        for (const t of selectedTemplates) {
            for (const d of days) {
                if (t.template.capturesByDate[d]) available++
            }
        }
        return { total: days.length * selectedTemplates.length, available }
    }

    // Cores por criativo (para timeline visual)
    const creativeColors = ['#00ff88', '#00aaff', '#ff6b6b', '#ffd93d', '#c084fc', '#f97316']

    return (
        <div className="min-h-screen bg-[#0a0a0f] text-white p-6">
            <div className="max-w-6xl mx-auto">
                <h1 className="text-2xl font-bold mb-1 bg-gradient-to-r from-[#00ff88] to-[#00cc6a] bg-clip-text text-transparent">
                    Montagem Automática
                </h1>
                <p className="text-white/40 text-sm mb-6">Múltiplos criativos com sub-períodos — cada dia usa seu print + criativo correto</p>

                {/* STEPPER */}
                <div className="flex items-center gap-2 mb-8">
                    {stepTitles.map((title, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                                step === i + 1
                                    ? 'bg-[#00ff88]/20 text-[#00ff88] border border-[#00ff88]/30'
                                    : step > i + 1
                                        ? 'bg-[#00ff88]/10 text-[#00ff88]/60'
                                        : 'bg-white/5 text-white/30'
                            }`}>
                                {step > i + 1 ? <Check size={12} /> : <span>{i + 1}</span>}
                                <span className="hidden sm:inline">{title}</span>
                            </div>
                            {i < 3 && <ChevronRight size={14} className="text-white/20" />}
                        </div>
                    ))}
                </div>

                {/* STEP 1: Templates */}
                {step === 1 && (
                    <div>
                        <h2 className="text-lg font-semibold mb-4">Selecione os templates de PI 000</h2>
                        {loading ? (
                            <div className="flex items-center gap-2 text-white/40">
                                <Loader2 size={16} className="animate-spin" /> Carregando...
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {templates.map(t => (
                                    <div key={t.campaignId} onClick={() => toggleTemplate(t)}
                                        className={`relative cursor-pointer rounded-xl overflow-hidden border-2 transition-all ${
                                            isSelected(t) ? 'border-[#00ff88] ring-2 ring-[#00ff88]/20' : 'border-white/10 hover:border-white/20'
                                        }`}>
                                        <img src={t.latestScreenshot} alt={`Template ${t.format.substring(0, 8)}`}
                                            className="w-full h-48 object-cover object-top" crossOrigin="anonymous" />
                                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-3">
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-medium px-2 py-0.5 rounded bg-white/10">
                                                    {t.device === 'mobile' ? '📱 Mobile' : '🖥️ Desktop'}
                                                </span>
                                                <span className="text-[10px] text-white/40">
                                                    {Object.keys(t.capturesByDate).length} dia(s)
                                                </span>
                                            </div>
                                        </div>
                                        {isSelected(t) && (
                                            <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[#00ff88] flex items-center justify-center">
                                                <Check size={14} className="text-black" />
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                        {selectedTemplates.length > 0 && (
                            <p className="text-sm text-[#00ff88]/60 mt-3">{selectedTemplates.length} template(s)</p>
                        )}
                    </div>
                )}

                {/* STEP 2: Período */}
                {step === 2 && (
                    <div>
                        <h2 className="text-lg font-semibold mb-4">Defina o período geral</h2>
                        <div className="flex flex-col sm:flex-row gap-4 max-w-md">
                            <div className="flex-1">
                                <label className="text-xs text-white/40 mb-1 block">Data Início</label>
                                <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00ff88]/50" />
                            </div>
                            <div className="flex-1">
                                <label className="text-xs text-white/40 mb-1 block">Data Fim</label>
                                <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00ff88]/50" />
                            </div>
                        </div>
                        {dateStart && dateEnd && dateStart <= dateEnd && (() => {
                            const { total, available } = availableDaysCount()
                            const days = getDaysInRange()
                            return (
                                <div className="mt-4 space-y-2">
                                    <p className="text-sm text-white/40">
                                        📅 {days.length} dia(s) × {selectedTemplates.length} template(s) = <span className="text-[#00ff88]">{available} montagem(s)</span>
                                        {total !== available && <span className="text-yellow-400/80"> ({total - available} sem print)</span>}
                                    </p>
                                    {Object.keys(missingDays).length > 0 && (
                                        <div className="bg-yellow-400/5 border border-yellow-400/20 rounded-lg p-3 text-xs">
                                            <p className="text-yellow-400 font-medium mb-1">⚠️ Dias sem print (serão pulados):</p>
                                            {Object.entries(missingDays).map(([campId, days]) => (
                                                <p key={campId} className="text-yellow-400/60">
                                                    Template {campId.substring(0, 8)}: {days.join(', ')}
                                                </p>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )
                        })()}
                    </div>
                )}

                {/* STEP 3: MÚLTIPLOS CRIATIVOS */}
                {step === 3 && (
                    <div>
                        <h2 className="text-lg font-semibold mb-2">Criativos por período</h2>
                        <p className="text-sm text-white/40 mb-4">
                            Adicione um ou mais criativos. Cada um será usado nos dias do seu sub-período.
                        </p>

                        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleCreativeFileChange} className="hidden" />

                        {/* Lista de criativos */}
                        <div className="space-y-4 mb-4">
                            {creatives.map((c, idx) => (
                                <div key={c.id}
                                    className="bg-white/[0.03] border border-white/10 rounded-xl p-4 relative"
                                    style={{ borderLeftColor: creativeColors[idx % creativeColors.length], borderLeftWidth: 3 }}>

                                    {/* Remove */}
                                    <button onClick={() => removeCreative(c.id)}
                                        className="absolute top-3 right-3 text-white/20 hover:text-red-400 transition-colors">
                                        <Trash2 size={14} />
                                    </button>

                                    <div className="flex items-start gap-4">
                                        {/* Thumbnail + upload */}
                                        <div
                                            onClick={() => triggerFileUpload(idx)}
                                            className="w-24 h-24 rounded-lg border border-dashed border-white/10 hover:border-[#00ff88]/30 flex items-center justify-center cursor-pointer flex-shrink-0 overflow-hidden transition-all"
                                        >
                                            {c.preview ? (
                                                <img src={c.preview} alt="Criativo" className="w-full h-full object-contain" />
                                            ) : (
                                                <div className="text-center text-white/20">
                                                    <Upload size={16} className="mx-auto mb-1" />
                                                    <span className="text-[10px]">Upload</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Datas */}
                                        <div className="flex-1 space-y-2">
                                            <p className="text-xs font-medium" style={{ color: creativeColors[idx % creativeColors.length] }}>
                                                Criativo {idx + 1} {c.file?.name ? `— ${c.file.name}` : ''}
                                            </p>
                                            <div className="flex gap-3">
                                                <div className="flex-1">
                                                    <label className="text-[10px] text-white/30 block">De</label>
                                                    <input type="date" value={c.dateStart}
                                                        min={dateStart} max={dateEnd}
                                                        onChange={e => updateCreativeDates(c.id, 'dateStart', e.target.value)}
                                                        className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs focus:outline-none focus:border-[#00ff88]/50" />
                                                </div>
                                                <div className="flex-1">
                                                    <label className="text-[10px] text-white/30 block">Até</label>
                                                    <input type="date" value={c.dateEnd}
                                                        min={dateStart} max={dateEnd}
                                                        onChange={e => updateCreativeDates(c.id, 'dateEnd', e.target.value)}
                                                        className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs focus:outline-none focus:border-[#00ff88]/50" />
                                                </div>
                                            </div>
                                            <p className="text-[10px] text-white/20">
                                                {c.dateStart && c.dateEnd ? `${getDaysInRange(c.dateStart, c.dateEnd).length} dia(s)` : 'Selecione as datas'}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Add button */}
                        <button onClick={addCreativeSlot}
                            className="flex items-center gap-2 px-4 py-2.5 border border-dashed border-white/10 hover:border-[#00ff88]/30 rounded-xl text-sm text-white/40 hover:text-[#00ff88] transition-all w-full justify-center">
                            <Plus size={16} />
                            Adicionar Criativo
                        </button>

                        {/* Cobertura visual */}
                        {creatives.length > 0 && dateStart && dateEnd && (() => {
                            const { total, covered, uncovered } = getCoverage()
                            const days = getDaysInRange()
                            return (
                                <div className="mt-6 space-y-3">
                                    <p className="text-xs text-white/40">
                                        Cobertura: <span className="text-[#00ff88]">{covered}/{total} dias</span>
                                        {uncovered > 0 && <span className="text-yellow-400"> ({uncovered} sem criativo)</span>}
                                    </p>
                                    {/* Timeline visual */}
                                    <div className="flex gap-0.5 flex-wrap">
                                        {days.map(d => {
                                            const creative = getCreativeForDay(d)
                                            const creativeIdx = creative ? creatives.findIndex(c => c.id === creative.id) : -1
                                            const color = creativeIdx >= 0 ? creativeColors[creativeIdx % creativeColors.length] : undefined
                                            return (
                                                <div key={d} title={`${d}${creative ? ` — Criativo ${creativeIdx + 1}` : ' — Sem criativo'}`}
                                                    className="w-4 h-4 rounded-sm text-[6px] flex items-center justify-center cursor-default"
                                                    style={{
                                                        backgroundColor: color ? `${color}33` : 'rgba(255,255,255,0.05)',
                                                        border: `1px solid ${color || 'rgba(255,255,255,0.1)'}`,
                                                        color: color || 'rgba(255,255,255,0.2)',
                                                    }}>
                                                    {d.split('-')[2]}
                                                </div>
                                            )
                                        })}
                                    </div>
                                    <div className="flex gap-3 flex-wrap">
                                        {creatives.map((c, i) => (
                                            <div key={c.id} className="flex items-center gap-1 text-[10px]">
                                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: creativeColors[i % creativeColors.length] }} />
                                                <span style={{ color: creativeColors[i % creativeColors.length] }}>Criativo {i + 1}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )
                        })()}
                    </div>
                )}

                {/* STEP 4: Posicionar & Gerar */}
                {step === 4 && (
                    <div>
                        <h2 className="text-lg font-semibold mb-2">Posicione o criativo em cada template</h2>
                        <p className="text-sm text-white/40 mb-4">
                            Clique e arraste sobre a área marcada. A posição é a mesma para todos os criativos neste template.
                        </p>

                        <div className="flex items-center gap-3 mb-4">
                            <button onClick={() => setCurrentTemplateIdx(Math.max(0, currentTemplateIdx - 1))}
                                disabled={currentTemplateIdx === 0}
                                className="p-2 rounded-lg bg-white/5 disabled:opacity-30 hover:bg-white/10">
                                <ChevronLeft size={16} />
                            </button>
                            <div className="flex gap-2">
                                {selectedTemplates.map((t, i) => (
                                    <button key={i} onClick={() => setCurrentTemplateIdx(i)}
                                        className={`w-8 h-8 rounded-lg text-xs font-medium transition-all ${
                                            i === currentTemplateIdx ? 'bg-[#00ff88] text-black'
                                                : t.position ? 'bg-[#00ff88]/20 text-[#00ff88]'
                                                    : 'bg-white/5 text-white/40'
                                        }`}>
                                        {i + 1}
                                    </button>
                                ))}
                            </div>
                            <button onClick={() => setCurrentTemplateIdx(Math.min(selectedTemplates.length - 1, currentTemplateIdx + 1))}
                                disabled={currentTemplateIdx >= selectedTemplates.length - 1}
                                className="p-2 rounded-lg bg-white/5 disabled:opacity-30 hover:bg-white/10">
                                <ChevronRight size={16} />
                            </button>
                            <span className="text-xs text-white/30 ml-2">
                                {selectedTemplates[currentTemplateIdx]?.template.device === 'mobile' ? '📱' : '🖥️'}
                                {' '}{selectedTemplates[currentTemplateIdx]?.position ? '✅ Posicionado' : '⚠️ Arraste'}
                            </span>
                        </div>

                        <div className="relative bg-white/5 rounded-xl overflow-auto max-h-[600px] border border-white/10">
                            <canvas ref={canvasRef}
                                onMouseDown={handleMouseDown}
                                onMouseMove={handleMouseMove}
                                onMouseUp={handleMouseUp}
                                onMouseLeave={handleMouseUp}
                                className="max-w-full cursor-crosshair"
                                style={{ display: 'block', margin: '0 auto' }} />
                        </div>

                        {canAdvance() && (
                            <div className="mt-6">
                                {isProcessing ? (
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-3">
                                            <Loader2 size={16} className="animate-spin text-[#00ff88]" />
                                            <div className="flex-1 bg-white/5 rounded-full h-2 overflow-hidden">
                                                <div className="bg-gradient-to-r from-[#00ff88] to-[#00cc6a] h-full transition-all"
                                                    style={{ width: `${progress}%` }} />
                                            </div>
                                            <span className="text-sm text-white/40">{progress}%</span>
                                        </div>
                                        <p className="text-xs text-white/30">{progressText}</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <button onClick={generateZip}
                                            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#00ff88] to-[#00cc6a] text-black font-semibold rounded-xl hover:brightness-110 transition-all">
                                            <Download size={18} />
                                            Gerar Montagem & Download ZIP
                                        </button>
                                        {progressText && <p className="text-xs text-[#00ff88]/80">{progressText}</p>}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* NAV BUTTONS */}
                {step < 4 && (
                    <div className="flex items-center justify-between mt-8 pt-6 border-t border-white/5">
                        <button onClick={() => setStep(Math.max(1, step - 1))} disabled={step === 1}
                            className="flex items-center gap-1 px-4 py-2 text-sm text-white/40 hover:text-white disabled:opacity-30">
                            <ChevronLeft size={16} /> Voltar
                        </button>
                        <button onClick={() => setStep(Math.min(4, step + 1))} disabled={!canAdvance()}
                            className="flex items-center gap-1 px-5 py-2 text-sm font-medium bg-[#00ff88] text-black rounded-lg hover:brightness-110 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                            Avançar <ChevronRight size={16} />
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}
