'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Upload, Download, ChevronRight, ChevronLeft, Check, Loader2, Plus, Trash2 } from 'lucide-react'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { getMontagemTemplates, type TemplateInfo } from '@/app/montagem/actions'

interface Position { x: number; y: number; width: number; height: number }

interface TemplateWithPosition {
    template: TemplateInfo
    position: Position | null
}

interface CreativeEntry {
    id: string
    file: File | null
    preview: string
    dateStart: string
    dateEnd: string
}

// Criativos organizados por template (campaignId)
interface TemplateCreatives {
    campaignId: string
    creatives: CreativeEntry[]
}

export default function PrintAssembler() {
    const [step, setStep] = useState(1)
    const [templates, setTemplates] = useState<TemplateInfo[]>([])
    const [selectedTemplates, setSelectedTemplates] = useState<TemplateWithPosition[]>([])
    const [loading, setLoading] = useState(true)
    const [dateStart, setDateStart] = useState('')
    const [dateEnd, setDateEnd] = useState('')

    // Criativos por template
    const [templateCreatives, setTemplateCreatives] = useState<TemplateCreatives[]>([])
    const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null)

    const [currentTemplateIdx, setCurrentTemplateIdx] = useState(0)
    const [isProcessing, setIsProcessing] = useState(false)
    const [progress, setProgress] = useState(0)
    const [progressText, setProgressText] = useState('')
    const [isDragging, setIsDragging] = useState(false)
    const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
    const [missingDays, setMissingDays] = useState<Record<string, string[]>>({})

    const canvasRef = useRef<HTMLCanvasElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [pendingUpload, setPendingUpload] = useState<{ campaignId: string; creativeIdx: number } | null>(null)

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

    // Sincronizar templateCreatives quando selectedTemplates mudam
    useEffect(() => {
        setTemplateCreatives(prev => {
            const next: TemplateCreatives[] = []
            for (const st of selectedTemplates) {
                const existing = prev.find(tc => tc.campaignId === st.template.campaignId)
                next.push(existing || { campaignId: st.template.campaignId, creatives: [] })
            }
            return next
        })
    }, [selectedTemplates])

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

    // Buscar criativo para um dia de um template específico
    const getCreativeForDay = (campaignId: string, day: string): CreativeEntry | null => {
        const tc = templateCreatives.find(t => t.campaignId === campaignId)
        if (!tc) return null
        for (const c of tc.creatives) {
            if (c.preview && c.dateStart <= day && day <= c.dateEnd) return c
        }
        return null
    }

    // Canvas preview
    const drawCanvas = useCallback(async () => {
        const canvas = canvasRef.current
        if (!canvas || selectedTemplates.length === 0) return
        const current = selectedTemplates[currentTemplateIdx]
        if (!current) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const tc = templateCreatives.find(t => t.campaignId === current.template.campaignId)
        const firstPreview = tc?.creatives.find(c => c.preview)?.preview || null

        const img = new window.Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => {
            canvas.width = img.width
            canvas.height = img.height
            ctx.drawImage(img, 0, 0)

            if (current.position && firstPreview) {
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
                creative.src = firstPreview
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
    }, [selectedTemplates, currentTemplateIdx, templateCreatives])

    useEffect(() => {
        if (step === 4) drawCanvas()
    }, [step, currentTemplateIdx, selectedTemplates, drawCanvas])

    const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current
        if (!canvas) return { x: 0, y: 0 }
        const rect = canvas.getBoundingClientRect()
        return {
            x: Math.round((e.clientX - rect.left) * (canvas.width / rect.width)),
            y: Math.round((e.clientY - rect.top) * (canvas.height / rect.height)),
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
            x: Math.min(dragStart.x, coords.x), y: Math.min(dragStart.y, coords.y),
            width: Math.abs(coords.x - dragStart.x), height: Math.abs(coords.y - dragStart.y),
        })
    }

    const handleMouseUp = () => { setIsDragging(false); setDragStart(null) }

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

    // CRUD criativos por template
    const addCreative = (campaignId: string) => {
        setTemplateCreatives(prev => prev.map(tc =>
            tc.campaignId === campaignId
                ? { ...tc, creatives: [...tc.creatives, { id: crypto.randomUUID(), file: null, preview: '', dateStart, dateEnd }] }
                : tc
        ))
    }

    const removeCreative = (campaignId: string, id: string) => {
        setTemplateCreatives(prev => prev.map(tc =>
            tc.campaignId === campaignId
                ? { ...tc, creatives: tc.creatives.filter(c => c.id !== id) }
                : tc
        ))
    }

    const updateCreativeDate = (campaignId: string, id: string, field: 'dateStart' | 'dateEnd', value: string) => {
        setTemplateCreatives(prev => prev.map(tc =>
            tc.campaignId === campaignId
                ? { ...tc, creatives: tc.creatives.map(c => c.id === id ? { ...c, [field]: value } : c) }
                : tc
        ))
    }

    const handleCreativeFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file || !pendingUpload) return
        const reader = new FileReader()
        reader.onload = (ev) => {
            const preview = ev.target?.result as string
            setTemplateCreatives(prev => prev.map(tc =>
                tc.campaignId === pendingUpload.campaignId
                    ? {
                        ...tc, creatives: tc.creatives.map((c, i) =>
                            i === pendingUpload.creativeIdx ? { ...c, file, preview } : c
                        )
                    }
                    : tc
            ))
        }
        reader.readAsDataURL(file)
        setPendingUpload(null)
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    const triggerFileUpload = (campaignId: string, creativeIdx: number) => {
        setPendingUpload({ campaignId, creativeIdx })
        fileInputRef.current?.click()
    }

    // ZIP
    const generateZip = async () => {
        if (selectedTemplates.length === 0) return
        setIsProcessing(true)
        setProgress(0)

        const zip = new JSZip()
        const days = getDaysInRange()

        let totalImages = 0
        let processed = 0
        let skipped = 0

        for (const tmpl of selectedTemplates) {
            if (!tmpl.position) continue
            for (const day of days) {
                if (tmpl.template.capturesByDate[day] && getCreativeForDay(tmpl.template.campaignId, day)) totalImages++
            }
        }
        if (totalImages === 0) { setIsProcessing(false); setProgressText('⚠️ Nenhuma montagem possível'); return }

        for (const tmpl of selectedTemplates) {
            if (!tmpl.position) continue
            const folderName = `${tmpl.template.device}_${tmpl.template.format.substring(0, 8)}`
            const folder = zip.folder(folderName)!

            for (const day of days) {
                const screenshotUrl = tmpl.template.capturesByDate[day]
                const creative = getCreativeForDay(tmpl.template.campaignId, day)
                if (!screenshotUrl || !creative) { skipped++; continue }

                try {
                    setProgressText(`${day} — ${tmpl.template.device}`)
                    const blob = await renderOverlay(screenshotUrl, creative.preview, tmpl.position)
                    folder.file(`montagem_${day}.png`, blob)
                } catch { skipped++ }
                processed++
                setProgress(Math.round((processed / totalImages) * 100))
            }
        }

        const content = await zip.generateAsync({ type: 'blob' })
        saveAs(content, `montagem_${dateStart}_a_${dateEnd}.zip`)
        setIsProcessing(false)
        setProgressText(`✅ ${processed} montagens. ${skipped > 0 ? `${skipped} pulados.` : ''}`)
    }

    const renderOverlay = (templateUrl: string, creativeDataUrl: string, pos: Position): Promise<Blob> => {
        return new Promise((resolve, reject) => {
            const tImg = new window.Image()
            tImg.crossOrigin = 'anonymous'
            tImg.onload = () => {
                const cImg = new window.Image()
                cImg.onload = () => {
                    const c = document.createElement('canvas')
                    c.width = tImg.width; c.height = tImg.height
                    const ctx = c.getContext('2d')!
                    ctx.drawImage(tImg, 0, 0)
                    ctx.drawImage(cImg, pos.x, pos.y, pos.width, pos.height)
                    c.toBlob(b => b ? resolve(b) : reject(new Error('blob')), 'image/png')
                }
                cImg.onerror = reject; cImg.src = creativeDataUrl
            }
            tImg.onerror = reject; tImg.src = templateUrl
        })
    }

    const canAdvance = () => {
        switch (step) {
            case 1: return selectedTemplates.length > 0
            case 2: return dateStart && dateEnd && dateStart <= dateEnd
            case 3: return templateCreatives.every(tc => tc.creatives.length > 0 && tc.creatives.every(c => c.preview && c.dateStart && c.dateEnd))
            case 4: return selectedTemplates.every(t => t.position !== null)
            default: return false
        }
    }

    const stepTitles = ['Templates', 'Período', 'Criativos', 'Posicionar & Gerar']
    const creativeColors = ['#00ff88', '#00aaff', '#ff6b6b', '#ffd93d', '#c084fc', '#f97316']

    return (
        <div className="min-h-screen bg-[#0a0a0f] text-white p-6">
            <div className="max-w-6xl mx-auto">
                <h1 className="text-2xl font-bold mb-1 bg-gradient-to-r from-[#00ff88] to-[#00cc6a] bg-clip-text text-transparent">
                    Montagem Automática
                </h1>
                <p className="text-white/40 text-sm mb-6">Vários formatos, vários criativos — cada formato recebe seu criativo</p>

                {/* STEPPER */}
                <div className="flex items-center gap-2 mb-8">
                    {stepTitles.map((title, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                                step === i + 1 ? 'bg-[#00ff88]/20 text-[#00ff88] border border-[#00ff88]/30'
                                    : step > i + 1 ? 'bg-[#00ff88]/10 text-[#00ff88]/60' : 'bg-white/5 text-white/30'
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
                        <h2 className="text-lg font-semibold mb-2">Selecione os formatos de PI 000</h2>
                        <p className="text-sm text-white/40 mb-4">Selecione todos os formatos que deseja montar</p>
                        {loading ? (
                            <div className="flex items-center gap-2 text-white/40"><Loader2 size={16} className="animate-spin" /> Carregando...</div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {templates.map(t => (
                                    <div key={t.campaignId} onClick={() => toggleTemplate(t)}
                                        className={`relative cursor-pointer rounded-xl overflow-hidden border-2 transition-all ${
                                            isSelected(t) ? 'border-[#00ff88] ring-2 ring-[#00ff88]/20' : 'border-white/10 hover:border-white/20'
                                        }`}>
                                        <img src={t.latestScreenshot} alt={`${t.format.substring(0, 8)}`}
                                            className="w-full h-48 object-cover object-top" crossOrigin="anonymous" />
                                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-3">
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-medium px-2 py-0.5 rounded bg-white/10">
                                                    {t.device === 'mobile' ? '📱 Mobile' : '🖥️ Desktop'}
                                                </span>
                                                <span className="text-[10px] text-white/40">{Object.keys(t.capturesByDate).length} dia(s)</span>
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
                            <p className="text-sm text-[#00ff88]/60 mt-3">{selectedTemplates.length} formato(s) selecionado(s)</p>
                        )}
                    </div>
                )}

                {/* STEP 2: Período */}
                {step === 2 && (
                    <div>
                        <h2 className="text-lg font-semibold mb-4">Período geral da montagem</h2>
                        <div className="flex flex-col sm:flex-row gap-4 max-w-md">
                            <div className="flex-1">
                                <label className="text-xs text-white/40 mb-1 block">Início</label>
                                <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00ff88]/50" />
                            </div>
                            <div className="flex-1">
                                <label className="text-xs text-white/40 mb-1 block">Fim</label>
                                <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00ff88]/50" />
                            </div>
                        </div>
                        {dateStart && dateEnd && dateStart <= dateEnd && (
                            <p className="text-sm text-white/40 mt-4">
                                📅 {getDaysInRange().length} dia(s) × {selectedTemplates.length} formato(s)
                            </p>
                        )}
                    </div>
                )}

                {/* STEP 3: CRIATIVOS POR FORMATO */}
                {step === 3 && (
                    <div>
                        <h2 className="text-lg font-semibold mb-2">Criativos por formato</h2>
                        <p className="text-sm text-white/40 mb-4">
                            Cada formato recebe seus próprios criativos. Adicione o criativo e defina o sub-período.
                        </p>

                        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleCreativeFileChange} className="hidden" />

                        <div className="space-y-4">
                            {selectedTemplates.map((st, stIdx) => {
                                const tc = templateCreatives.find(t => t.campaignId === st.template.campaignId)
                                const isExpanded = expandedTemplate === st.template.campaignId || selectedTemplates.length === 1
                                return (
                                    <div key={st.template.campaignId}
                                        className="bg-white/[0.02] border border-white/10 rounded-xl overflow-hidden">

                                        {/* Header do formato */}
                                        <div
                                            onClick={() => setExpandedTemplate(isExpanded && selectedTemplates.length > 1 ? null : st.template.campaignId)}
                                            className="flex items-center gap-3 p-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
                                        >
                                            <img src={st.template.latestScreenshot} alt=""
                                                className="w-16 h-12 rounded object-cover object-top flex-shrink-0"
                                                crossOrigin="anonymous" />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-medium">
                                                        {st.template.device === 'mobile' ? '📱' : '🖥️'} Formato {stIdx + 1}
                                                    </span>
                                                    <span className="text-[10px] text-white/30 px-1.5 py-0.5 bg-white/5 rounded">
                                                        {st.template.format.substring(0, 8)}
                                                    </span>
                                                </div>
                                                <p className="text-[10px] text-white/30">
                                                    {tc?.creatives.length || 0} criativo(s) adicionado(s)
                                                </p>
                                            </div>
                                            <ChevronRight size={14} className={`text-white/20 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                        </div>

                                        {/* Criativos do formato */}
                                        {isExpanded && (
                                            <div className="border-t border-white/5 p-4 space-y-3">
                                                {tc?.creatives.map((c, cIdx) => (
                                                    <div key={c.id}
                                                        className="flex items-start gap-3 bg-white/[0.02] rounded-lg p-3 relative"
                                                        style={{ borderLeft: `3px solid ${creativeColors[cIdx % creativeColors.length]}` }}>

                                                        <button onClick={() => removeCreative(st.template.campaignId, c.id)}
                                                            className="absolute top-2 right-2 text-white/15 hover:text-red-400 transition-colors">
                                                            <Trash2 size={12} />
                                                        </button>

                                                        <div onClick={() => triggerFileUpload(st.template.campaignId, cIdx)}
                                                            className="w-16 h-16 rounded border border-dashed border-white/10 hover:border-[#00ff88]/30 flex items-center justify-center cursor-pointer flex-shrink-0 overflow-hidden">
                                                            {c.preview ? (
                                                                <img src={c.preview} alt="" className="w-full h-full object-contain" />
                                                            ) : (
                                                                <Upload size={14} className="text-white/20" />
                                                            )}
                                                        </div>

                                                        <div className="flex-1 space-y-1.5">
                                                            <p className="text-[10px] font-medium" style={{ color: creativeColors[cIdx % creativeColors.length] }}>
                                                                Criativo {cIdx + 1} {c.file?.name ? `— ${c.file.name}` : ''}
                                                            </p>
                                                            <div className="flex gap-2">
                                                                <div className="flex-1">
                                                                    <label className="text-[9px] text-white/25 block">De</label>
                                                                    <input type="date" value={c.dateStart} min={dateStart} max={dateEnd}
                                                                        onChange={e => updateCreativeDate(st.template.campaignId, c.id, 'dateStart', e.target.value)}
                                                                        className="w-full bg-white/5 border border-white/10 rounded px-1.5 py-1 text-[11px] focus:outline-none focus:border-[#00ff88]/50" />
                                                                </div>
                                                                <div className="flex-1">
                                                                    <label className="text-[9px] text-white/25 block">Até</label>
                                                                    <input type="date" value={c.dateEnd} min={dateStart} max={dateEnd}
                                                                        onChange={e => updateCreativeDate(st.template.campaignId, c.id, 'dateEnd', e.target.value)}
                                                                        className="w-full bg-white/5 border border-white/10 rounded px-1.5 py-1 text-[11px] focus:outline-none focus:border-[#00ff88]/50" />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}

                                                <button onClick={() => addCreative(st.template.campaignId)}
                                                    className="flex items-center gap-1.5 px-3 py-2 border border-dashed border-white/10 hover:border-[#00ff88]/30 rounded-lg text-xs text-white/30 hover:text-[#00ff88] transition-all w-full justify-center">
                                                    <Plus size={14} /> Adicionar Criativo
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}

                {/* STEP 4: Posicionar & Gerar */}
                {step === 4 && (
                    <div>
                        <h2 className="text-lg font-semibold mb-2">Posicione o criativo em cada formato</h2>
                        <p className="text-sm text-white/40 mb-4">Clique e arraste sobre a área marcada do banner.</p>

                        <div className="flex items-center gap-3 mb-4">
                            <button onClick={() => setCurrentTemplateIdx(Math.max(0, currentTemplateIdx - 1))}
                                disabled={currentTemplateIdx === 0} className="p-2 rounded-lg bg-white/5 disabled:opacity-30 hover:bg-white/10">
                                <ChevronLeft size={16} />
                            </button>
                            <div className="flex gap-2">
                                {selectedTemplates.map((t, i) => (
                                    <button key={i} onClick={() => setCurrentTemplateIdx(i)}
                                        className={`w-8 h-8 rounded-lg text-xs font-medium transition-all ${
                                            i === currentTemplateIdx ? 'bg-[#00ff88] text-black'
                                                : t.position ? 'bg-[#00ff88]/20 text-[#00ff88]' : 'bg-white/5 text-white/40'
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
                                {' '}{selectedTemplates[currentTemplateIdx]?.position ? '✅' : '⚠️ Arraste'}
                            </span>
                        </div>

                        <div className="relative bg-white/5 rounded-xl overflow-auto max-h-[600px] border border-white/10">
                            <canvas ref={canvasRef}
                                onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
                                onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
                                className="max-w-full cursor-crosshair" style={{ display: 'block', margin: '0 auto' }} />
                        </div>

                        {canAdvance() && (
                            <div className="mt-6">
                                {isProcessing ? (
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-3">
                                            <Loader2 size={16} className="animate-spin text-[#00ff88]" />
                                            <div className="flex-1 bg-white/5 rounded-full h-2 overflow-hidden">
                                                <div className="bg-gradient-to-r from-[#00ff88] to-[#00cc6a] h-full transition-all" style={{ width: `${progress}%` }} />
                                            </div>
                                            <span className="text-sm text-white/40">{progress}%</span>
                                        </div>
                                        <p className="text-xs text-white/30">{progressText}</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <button onClick={generateZip}
                                            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#00ff88] to-[#00cc6a] text-black font-semibold rounded-xl hover:brightness-110 transition-all">
                                            <Download size={18} /> Gerar Montagem & Download ZIP
                                        </button>
                                        {progressText && <p className="text-xs text-[#00ff88]/80">{progressText}</p>}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* NAV */}
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
