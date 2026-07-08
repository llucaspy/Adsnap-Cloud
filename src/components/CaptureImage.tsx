'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Camera } from 'lucide-react'

interface CaptureImageProps {
    src: string
    alt: string
    className?: string
    sizes?: string
    priority?: boolean
}

export function CaptureImage({ src, alt, className, sizes, priority = false }: CaptureImageProps) {
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
        <Image
            src={src}
            alt={alt}
            fill
            quality={72}
            sizes={sizes ?? '(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 320px'}
            className={className}
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : 'auto'}
            onError={() => setHasError(true)}
        />
    )
}
