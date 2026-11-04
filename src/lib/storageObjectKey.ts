/** Supabase object keys use portable ASCII; Drive keeps its human-readable names. */
export function supabaseObjectKey(path: string) {
    return path.split('/').map(segment => segment.normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_. -]/g, '_')
        .replace(/^\.+$/, '_') || '_').join('/')
}
