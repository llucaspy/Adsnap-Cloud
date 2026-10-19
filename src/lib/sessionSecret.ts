/** Resolve lazily: builds may run without runtime credentials; sessions may not. */
export function getJwtSecret(): Uint8Array {
    const secret = process.env.AUTH_SECRET
    if (!secret || secret.trim().length < 32 || secret === 'adsnap-v2-secret-key-change-in-production-2026') {
        throw new Error('AUTH_SECRET must be a private signing key of at least 32 characters')
    }
    return new TextEncoder().encode(secret)
}
