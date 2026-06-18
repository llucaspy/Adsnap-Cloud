import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import type { BrowserContext } from 'playwright'
import { getSupabase } from './supabase'

export type GamSessionState = Awaited<ReturnType<BrowserContext['storageState']>>

interface EncryptedSessionEnvelope {
    version: 1
    algorithm: 'aes-256-gcm'
    iv: string
    authTag: string
    ciphertext: string
    updatedAt: string
}

const DEFAULT_BUCKET = 'adsnap-private'

function bucketName() {
    return process.env.GAM_SESSION_BUCKET || DEFAULT_BUCKET
}

function objectPath(networkCode: string) {
    if (!/^\d+$/.test(networkCode)) throw new Error('GAM_NETWORK_CODE_INVALIDO')
    return `gam/${networkCode}/storage-state.enc`
}

function encryptionKey() {
    const secret = process.env.GAM_SESSION_ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!secret) {
        throw new Error('GAM_SESSION_ENCRYPTION_KEY_AUSENTE')
    }

    return createHash('sha256')
        .update('adsnap:gam-session:v1\0')
        .update(secret)
        .digest()
}

function additionalAuthenticatedData(networkCode: string) {
    return Buffer.from(`${bucketName()}:${objectPath(networkCode)}:v1`, 'utf8')
}

function isSessionState(value: unknown): value is GamSessionState {
    if (!value || typeof value !== 'object') return false
    const candidate = value as { cookies?: unknown; origins?: unknown }
    return Array.isArray(candidate.cookies) && Array.isArray(candidate.origins)
}

export function encryptGamSessionState(state: GamSessionState, networkCode: string) {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
    cipher.setAAD(additionalAuthenticatedData(networkCode))

    const ciphertext = Buffer.concat([
        cipher.update(JSON.stringify(state), 'utf8'),
        cipher.final(),
    ])

    const envelope: EncryptedSessionEnvelope = {
        version: 1,
        algorithm: 'aes-256-gcm',
        iv: iv.toString('base64'),
        authTag: cipher.getAuthTag().toString('base64'),
        ciphertext: ciphertext.toString('base64'),
        updatedAt: new Date().toISOString(),
    }

    return Buffer.from(JSON.stringify(envelope), 'utf8')
}

export function decryptGamSessionState(payload: Buffer, networkCode: string): GamSessionState {
    const envelope = JSON.parse(payload.toString('utf8')) as EncryptedSessionEnvelope
    if (envelope.version !== 1 || envelope.algorithm !== 'aes-256-gcm') {
        throw new Error('GAM_SESSION_FORMATO_INVALIDO')
    }

    const decipher = createDecipheriv(
        'aes-256-gcm',
        encryptionKey(),
        Buffer.from(envelope.iv, 'base64')
    )
    decipher.setAAD(additionalAuthenticatedData(networkCode))
    decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64'))

    const plaintext = Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
        decipher.final(),
    ])
    const state = JSON.parse(plaintext.toString('utf8')) as unknown

    if (!isSessionState(state)) throw new Error('GAM_SESSION_CONTEUDO_INVALIDO')
    return state
}

function isMissingObject(error: { message?: string; statusCode?: string | number } | null) {
    if (!error) return false
    return String(error.statusCode) === '404' || /not found|does not exist/i.test(error.message || '')
}

export function canUseRemoteGamSession() {
    return Boolean(
        process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.SUPABASE_SERVICE_ROLE_KEY
    )
}

export async function ensureGamSessionBucket() {
    const supabase = getSupabase()
    const name = bucketName()
    const { data: buckets, error: listError } = await supabase.storage.listBuckets()
    if (listError) throw new Error(`GAM_SESSION_BUCKET_LIST_ERROR: ${listError.message}`)

    const existing = buckets.find(bucket => bucket.name === name)
    if (existing) {
        if (existing.public) throw new Error('GAM_SESSION_BUCKET_DEVE_SER_PRIVADO')
        return
    }

    const { error: createError } = await supabase.storage.createBucket(name, {
        public: false,
        fileSizeLimit: 1024 * 1024,
    })
    if (createError) throw new Error(`GAM_SESSION_BUCKET_CREATE_ERROR: ${createError.message}`)
}

export async function loadGamSessionState(networkCode: string) {
    const { data, error } = await getSupabase().storage
        .from(bucketName())
        .download(objectPath(networkCode))

    if (isMissingObject(error)) return null
    if (error) throw new Error(`GAM_SESSION_DOWNLOAD_ERROR: ${error.message}`)

    return decryptGamSessionState(Buffer.from(await data.arrayBuffer()), networkCode)
}

export async function saveGamSessionState(state: GamSessionState, networkCode: string) {
    await ensureGamSessionBucket()
    const payload = encryptGamSessionState(state, networkCode)
    const { error } = await getSupabase().storage
        .from(bucketName())
        .upload(objectPath(networkCode), payload, {
            contentType: 'application/octet-stream',
            cacheControl: '0',
            upsert: true,
        })

    if (error) throw new Error(`GAM_SESSION_UPLOAD_ERROR: ${error.message}`)
}
