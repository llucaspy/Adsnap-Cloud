'use client'

import { useState, useEffect } from 'react'
import { Clock, Plus, X, Users } from 'lucide-react'
import { getScheduleUsage } from '@/app/actions'

interface MultiTimePickerProps {
    value: string[]
    onChange: (times: string[]) => void
    maxTimes?: number
}

// Common schedule times for quick selection
const QUICK_TIMES = [
    '08:00', '09:00', '10:00', '11:00', '12:00',
    '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'
]

export function MultiTimePicker({ value, onChange, maxTimes = 5 }: MultiTimePickerProps) {
    const [usage, setUsage] = useState<Record<string, number>>({})
    const [customTime, setCustomTime] = useState('')
    const [showCustom, setShowCustom] = useState(false)

    useEffect(() => {
        // Fetch schedule usage on mount
        getScheduleUsage().then(setUsage).catch(console.error)
    }, [])

    const addTime = (time: string) => {
        if (value.length >= maxTimes) return
        if (value.includes(time)) return
        onChange([...value, time].sort())
    }

    const removeTime = (time: string) => {
        onChange(value.filter(t => t !== time))
    }

    const addCustomTime = () => {
        if (customTime && !value.includes(customTime) && value.length < maxTimes) {
            addTime(customTime)
            setCustomTime('')
            setShowCustom(false)
        }
    }

    return (
        <div className="space-y-4">
            {/* Selected times */}
            {value.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {value.map(time => (
                        <div
                            key={time}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm animate-fade-in"
                            style={{
                                background: 'var(--gradient-primary)',
                                color: 'white',
                                boxShadow: '0 0 20px rgba(255,255,255,0.10)'
                            }}
                        >
                            <Clock size={14} />
                            {time}
                            <button
                                onClick={() => removeTime(time)}
                                className="ml-1 hover:bg-white/20 rounded-full p-0.5 transition-colors"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Counter */}
            <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                {value.length} de {maxTimes} horários selecionados
            </p>

            {/* Quick time grid */}
            {value.length < maxTimes && (
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {QUICK_TIMES.map(time => {
                        const isSelected = value.includes(time)
                        const usageCount = usage[time] || 0

                        return (
                            <button
                                key={time}
                                onClick={() => !isSelected && addTime(time)}
                                disabled={isSelected}
                                className="relative p-3 rounded-xl text-sm font-bold transition-all group"
                                style={{
                                    background: isSelected ? 'var(--accent-muted)' : 'var(--bg-tertiary)',
                                    color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
                                    opacity: isSelected ? 0.5 : 1,
                                    cursor: isSelected ? 'not-allowed' : 'pointer'
                                }}
                            >
                                {time}

                                {/* Usage badge */}
                                {usageCount > 0 && !isSelected && (
                                    <span
                                        className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                                        style={{
                                            background: usageCount >= 3 ? 'var(--warning)' : 'var(--tertiary)',
                                            color: 'white'
                                        }}
                                        title={`${usageCount} campanha(s) usam este horário`}
                                    >
                                        {usageCount}
                                    </span>
                                )}
                            </button>
                        )
                    })}

                    {/* Custom time button */}
                    {!showCustom ? (
                        <button
                            onClick={() => setShowCustom(true)}
                            className="p-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-1"
                            style={{
                                background: 'var(--bg-tertiary)',
                                color: 'var(--text-muted)',
                                border: '2px dashed var(--border)'
                            }}
                        >
                            <Plus size={16} />
                        </button>
                    ) : (
                        <div className="col-span-2 flex gap-2">
                            <input
                                type="time"
                                value={customTime}
                                onChange={e => setCustomTime(e.target.value)}
                                className="flex-1 p-3 rounded-xl font-bold text-sm outline-none"
                                style={{
                                    background: 'var(--bg-tertiary)',
                                    color: 'var(--text-primary)',
                                    border: '2px solid var(--accent)'
                                }}
                                autoFocus
                            />
                            <button
                                onClick={addCustomTime}
                                className="px-4 rounded-xl font-bold text-sm"
                                style={{
                                    background: 'var(--accent)',
                                    color: 'white'
                                }}
                            >
                                OK
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Legend */}
            <div className="flex items-center gap-4 text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
                <span className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full" style={{ background: 'var(--tertiary)' }} />
                    Campanhas usando horário
                </span>
                <span className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full" style={{ background: 'var(--warning)' }} />
                    Horário concorrido (3+)
                </span>
            </div>
        </div>
    )
}
