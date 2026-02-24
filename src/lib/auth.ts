import bcrypt from 'bcryptjs'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

const SALT_ROUNDS = 12
const SESSION_COOKIE = 'adsnap_session'
const JWT_EXPIRY = '24h'

// Use AUTH_SECRET env var or fallback to a generated key
// In production, always set AUTH_SECRET in your .env
function getJwtSecret() {
    const secret = process.env.AUTH_SECRET || 'adsnap-v2-secret-key-change-in-production-2026'
    return new TextEncoder().encode(secret)
}

// --- Password Utilities ---

export async function hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, SALT_ROUNDS)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash)
}

// --- Session Management ---

export interface SessionPayload {
    userId: string
    role: string
    email: string
}

export async function createSession(userId: string, role: string, email: string): Promise<void> {
    const token = await new SignJWT({ userId, role, email })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(JWT_EXPIRY)
        .sign(getJwtSecret())

    const cookieStore = await cookies()
    cookieStore.set(SESSION_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24, // 24 hours
    })
}

export async function getSession(): Promise<SessionPayload | null> {
    try {
        const cookieStore = await cookies()
        const token = cookieStore.get(SESSION_COOKIE)?.value
        if (!token) return null

        const { payload } = await jwtVerify(token, getJwtSecret())
        return {
            userId: payload.userId as string,
            role: payload.role as string,
            email: payload.email as string,
        }
    } catch {
        return null
    }
}

export async function destroySession(): Promise<void> {
    const cookieStore = await cookies()
    cookieStore.delete(SESSION_COOKIE)
}

// --- Authorization Helpers ---

export async function requireAdmin(): Promise<SessionPayload> {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
        throw new Error('Unauthorized: Admin access required')
    }
    return session
}

export async function requireAuth(): Promise<SessionPayload> {
    const session = await getSession()
    if (!session) {
        throw new Error('Unauthorized: Login required')
    }
    return session
}
