'use client'

import { useEffect, useRef, type ReactNode, type CSSProperties } from 'react'

interface ScrollRevealProps {
  children: ReactNode
  className?: string
  style?: CSSProperties
  /** Classes extras passadas ao wrapper (ex: stagger-1) */
  delay?: number
}

/**
 * ScrollReveal — wrapper client-side para Intersection Observer.
 * Adiciona a classe .reveal no elemento e observa quando entra no viewport,
 * aplicando .visible para disparar a transição do DESIGN.md.
 */
export function ScrollReveal({ children, className = '', style, delay = 0 }: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    if (delay) {
      el.style.transitionDelay = `${delay}ms`
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('visible')
          observer.unobserve(el)
        }
      },
      { threshold: 0.10, rootMargin: '0px 0px -20px 0px' }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [delay])

  return (
    <div ref={ref} className={`reveal ${className}`} style={style}>
      {children}
    </div>
  )
}
