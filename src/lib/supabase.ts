import { createClient, SupabaseClient } from '@supabase/supabase-js'

let supabaseInstance: SupabaseClient | null = null

function decodeJwtPayload(token: string) {
    const [, payload] = token.split('.')
    if (!payload) return null

    try {
        const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/')
        const paddedPayload = normalizedPayload.padEnd(
            normalizedPayload.length + ((4 - (normalizedPayload.length % 4)) % 4),
            '='
        )
        return JSON.parse(Buffer.from(paddedPayload, 'base64').toString('utf8')) as Record<string, unknown>
    } catch {
        return null
    }
}

function validateSupabaseCredentials(supabaseUrl: string, serviceKey: string) {
    if (!serviceKey.startsWith('eyJ')) return

    const projectRef = new URL(supabaseUrl).hostname.split('.')[0]
    const jwtPayload = decodeJwtPayload(serviceKey)
    const keyRef = jwtPayload?.ref

    if (typeof keyRef === 'string' && keyRef !== projectRef) {
        throw new Error('Supabase Service Role Key pertence a outro projeto. Atualize SUPABASE_SERVICE_ROLE_KEY na Vercel.')
    }
}

export const getSupabase = () => {
    if (supabaseInstance) return supabaseInstance

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
        console.warn('[Supabase] Credenciais ausentes no .env - Retornando cliente vazio (isso pode causar erros em runtime)')
        throw new Error('Supabase URL and Service Role Key are required for this operation.')
    }

    validateSupabaseCredentials(supabaseUrl, supabaseServiceKey)

    supabaseInstance = createClient(supabaseUrl!, supabaseServiceKey!, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        }
    })

    return supabaseInstance
}

// Proxy to maintain compatibility with existing code while being lazy
export const supabase = new Proxy({} as SupabaseClient, {
    get: (target, prop) => {
        const client = getSupabase()
        const value = client[prop as keyof SupabaseClient]
        if (typeof value === 'function') {
            return value.bind(client)
        }
        return value
    }
})
