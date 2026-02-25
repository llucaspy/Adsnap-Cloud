import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

function getJwtSecret() {
    const secret = process.env.AUTH_SECRET || 'adsnap-v2-secret-key-change-in-production-2026'
    return new TextEncoder().encode(secret)
}

// Rotas públicas que NÃO exigem autenticação
const PUBLIC_ROUTES = [
    '/',
    '/login',
    '/api/auth',
    '/api/cron',
    '/api/debug',
    '/api/nexus',
]

function isPublicRoute(pathname: string): boolean {
    return PUBLIC_ROUTES.some(route => pathname === route || pathname.startsWith(route + '/'))
}

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl

    // Permitir rotas públicas
    if (isPublicRoute(pathname)) {
        return NextResponse.next()
    }

    // Verificar autenticação para todas as outras rotas
    const token = request.cookies.get('adsnap_session')?.value

    if (!token) {
        // APIs retornam 401 JSON, páginas redirecionam para /login
        if (pathname.startsWith('/api/')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
        return NextResponse.redirect(new URL('/login', request.url))
    }

    try {
        const { payload } = await jwtVerify(token, getJwtSecret())

        // Verificação extra: rotas /admin exigem role 'admin'
        if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
            if (payload.role !== 'admin') {
                if (pathname.startsWith('/api/')) {
                    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
                }
                return NextResponse.redirect(new URL('/', request.url))
            }
        }

        return NextResponse.next()
    } catch {
        // Token inválido ou expirado
        if (pathname.startsWith('/api/')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
        return NextResponse.redirect(new URL('/login', request.url))
    }
}

export const config = {
    matcher: [
        /*
         * Match all request paths except static assets:
         * - _next/static (static files)
         * - _next/image (image optimization)  
         * - favicon.ico
         * - public files (images, etc.)
         */
        '/((?!api/auth|api/cron|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
    ],
}
