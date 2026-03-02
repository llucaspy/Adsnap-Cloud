'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

/**
 * ScrollEffects — re-runs on every route change via usePathname.
 * Fixes the issue where elements with .scroll-reveal classes become
 * permanently invisible after navigating away and back in Next.js,
 * because the layout never unmounts and the observer never re-fires.
 */
export function ScrollEffects() {
    const pathname = usePathname()

    useEffect(() => {
        // Small delay to let the new page DOM paint first
        const timer = setTimeout(() => {
            const selectors = '.scroll-reveal, .scroll-reveal-fade, .scroll-reveal-scale'
            const els = document.querySelectorAll<HTMLElement>(selectors)

            // Reset any previously revealed elements so they can re-animate
            els.forEach((el) => el.classList.remove('revealed'))

            const observer = new IntersectionObserver(
                (entries) => {
                    entries.forEach((entry) => {
                        if (entry.isIntersecting) {
                            entry.target.classList.add('revealed')
                            observer.unobserve(entry.target)
                        }
                    })
                },
                {
                    threshold: 0.08,
                    rootMargin: '0px 0px -20px 0px',
                }
            )

            els.forEach((el) => observer.observe(el))

            return () => observer.disconnect()
        }, 80)

        // ── PARALLAX ────────────────────────────────────────────────────────
        const slowEls = document.querySelectorAll<HTMLElement>('.parallax-slow')
        const mediumEls = document.querySelectorAll<HTMLElement>('.parallax-medium')

        const handleScroll = () => {
            const scrollY = window.scrollY
            slowEls.forEach((el) => { el.style.transform = `translateY(${scrollY * 0.15}px)` })
            mediumEls.forEach((el) => { el.style.transform = `translateY(${scrollY * 0.28}px)` })
        }

        window.addEventListener('scroll', handleScroll, { passive: true })
        handleScroll()

        return () => {
            clearTimeout(timer)
            window.removeEventListener('scroll', handleScroll)
        }
    }, [pathname]) // 👈 re-run on every route change

    return null
}
