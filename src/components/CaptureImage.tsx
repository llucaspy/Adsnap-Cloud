'use client'

import { useState } from 'react'
import { Camera } from 'lucide-react'

interface CaptureImageProps {
    src: string
    alt: string
    className?: string
}

export function CaptureImage({ src, alt, className }: CaptureImageProps) {
    const [hasError, setHasError] = useState(false)

    if (hasError) {
        return (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-bg-secondary">
                <Camera size={48} strokeWidth={1} className="mb-4 opacity-20" />
                <p className="text-[10px] font-bold uppercase tracking-widest break-all">
                    Erro ao carregar imagem
                </p>
            </div>
        )
    }

    return (
        <img
            src={src}
            alt={alt}
            className={className}
            onError={() => setHasError(true)}
        />
    )
}
