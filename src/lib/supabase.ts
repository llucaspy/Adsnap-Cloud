import { createClient, SupabaseClient } from '@supabase/supabase-js'

let supabaseInstance: SupabaseClient | null = null

export const getSupabase = () => {
    if (supabaseInstance) return supabaseInstance

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
        console.warn('[Supabase] Credenciais ausentes no .env - Retornando cliente vazio (isso pode causar erros em runtime)')
        throw new Error('Supabase URL and Service Role Key are required for this operation.')
    }

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
        const value = (client as any)[prop]
        if (typeof value === 'function') {
            return value.bind(client)
        }
        return value
    }
})
