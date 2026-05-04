'use client'

import { useState, useEffect } from 'react'

interface SessionData {
    userId: string
    role: string
    email: string
}

/**
 * Client-side session hook.
 * Fetches the user session from the server API on mount.
 */
export function useSession(): SessionData | null {
    const [session, setSession] = useState<SessionData | null>(null)

    useEffect(() => {
        async function fetchSession() {
            try {
                const res = await fetch('/api/auth/session')
                if (res.ok) {
                    const data = await res.json()
                    if (data.userId) {
                        setSession(data)
                    }
                }
            } catch {
                // silently fail — guest mode
            }
        }
        fetchSession()
    }, [])

    return session
}
