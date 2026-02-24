'use client'

import React, { useState, useEffect } from 'react'
import { ArrowUp } from 'lucide-react'

export function BackToTopButton() {
    const [isVisible, setIsVisible] = useState(false)

    useEffect(() => {
        const toggleVisibility = () => {
            // Check scroll position
            if (window.scrollY > 300) {
                setIsVisible(true)
            } else {
                setIsVisible(false)
            }
        }

        window.addEventListener('scroll', toggleVisibility)
        // Initial check
        toggleVisibility()

        return () => window.removeEventListener('scroll', toggleVisibility)
    }, [])

    const scrollToTop = () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        })
    }

    return (
        <button
            onClick={scrollToTop}
            className={`fixed bottom-8 left-72 w-14 h-14 rounded-full bg-accent text-white shadow-[0_0_30px_rgba(168,85,247,0.4)] flex items-center justify-center transition-all duration-500 z-[9999] ${isVisible
                ? 'opacity-100 translate-y-0 pointer-events-auto'
                : 'opacity-0 translate-y-12 pointer-events-none'
                } hover:scale-110 active:scale-95`}
            aria-label="Voltar ao topo"
        >
            <ArrowUp size={24} />
        </button>
    )
}
