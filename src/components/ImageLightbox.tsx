'use client'

import React, { useEffect } from 'react'
import { X, ZoomIn, Download, ExternalLink } from 'lucide-react'

interface ImageLightboxProps {
    src: string
    alt: string
    isOpen: boolean
    onClose: () => void
    date?: Date
}

export function ImageLightbox({ src, alt, isOpen, onClose, date }: ImageLightboxProps) {
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        if (isOpen) {
            document.addEventListener('keydown', handleEsc)
            document.body.style.overflow = 'hidden'
        }
        return () => {
            document.removeEventListener('keydown', handleEsc)
            document.body.style.overflow = 'unset'
        }
    }, [isOpen, onClose])

    if (!isOpen) return null

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 animate-fade-in"
            style={{
                background: 'rgba(5, 5, 10, 0.95)',
                backdropFilter: 'blur(10px)'
            }}
            onClick={onClose}
        >
            {/* Controls */}
            <div className="absolute top-6 right-6 flex items-center gap-4 z-50">
                <button
                    className="p-3 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-all"
                    title="Baixar imagem"
                    onClick={async (e) => {
                        e.stopPropagation()
                        try {
                            const response = await fetch(src)
                            const blob = await response.blob()
                            const url = URL.createObjectURL(blob)
                            const a = document.createElement('a')
                            a.href = url
                            a.download = `capture-${alt.replace(/\s+/g, '-').toLowerCase()}.jpg`
                            document.body.appendChild(a)
                            a.click()
                            document.body.removeChild(a)
                            URL.revokeObjectURL(url)
                        } catch (err) {
                            console.error('Erro ao baixar imagem:', err)
                        }
                    }}
                >
                    <Download size={24} />
                </button>
                <button
                    onClick={onClose}
                    className="p-3 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-all"
                >
                    <X size={28} />
                </button>
            </div>

            {/* Image Container */}
            <div
                className="relative max-w-full max-h-full overflow-hidden rounded-md shadow-2xl animate-scale-up"
                onClick={(e) => e.stopPropagation()}
            >
                <img
                    src={src}
                    alt={alt}
                    className="max-w-[90vw] max-h-[90vh] object-contain rounded-md"
                />

                {/* Meta Bar */}
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent text-white opacity-0 hover:opacity-100 transition-opacity">
                    <p className="font-bold text-lg">{alt}</p>
                    {date && (
                        <p className="text-sm text-white/70">
                            Capturado em {new Date(date).toLocaleString('pt-BR')}
                        </p>
                    )}
                </div>
            </div>
        </div>
    )
}
