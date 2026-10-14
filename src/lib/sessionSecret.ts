/** The signing key must come from deployment configuration, never public source. */
export function sessionSigningKey(secret: string | undefined) {
    if (!secret?.trim() || secret === 'adsnap-v2-secret-key-change-in-production-2026') {
        throw new Error('AUTH_SECRET is required')
    }
    return new TextEncoder().encode(secret)
}
