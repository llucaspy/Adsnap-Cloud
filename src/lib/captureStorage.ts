import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import { Readable } from 'stream'
import { google } from 'googleapis'
import { supabase } from './supabase'

type StorageProvider = 'supabase' | 'google-drive'

type CampaignStorageInfo = {
    id?: string
    agency?: string | null
    client?: string | null
    campaignName?: string | null
    pi?: string | null
    format?: string | null
    device?: string | null
}

type UploadCaptureInput = {
    campaignId: string
    campaign: CampaignStorageInfo
    fileName?: string
}

type StoredCapture = {
    provider: StorageProvider
    requestedProvider?: StorageProvider
    uri: string
    fileId?: string
    path?: string
    size: number
    checksum: string
    fallbackReason?: string
}

const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder'
const DRIVE_CAPTURE_PREFIX = 'gdrive://'
const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive']
const HTTP_TIMEOUT_MS = 30_000
const RETRYABLE_STATUS = new Set([403, 429, 500, 502, 503, 504])

let driveClientPromise: Promise<ReturnType<typeof google.drive>> | null = null
const driveFolderCache = new Map<string, string>()

function normalizeProvider(value: string | undefined): StorageProvider {
    const normalized = (value || '').trim().toLowerCase()
    if (['google-drive', 'google_drive', 'drive', 'gdrive'].includes(normalized)) return 'google-drive'
    return 'supabase'
}

export function getCaptureStorageProvider(): StorageProvider {
    return normalizeProvider(process.env.NEXUS_CAPTURE_STORAGE_PROVIDER || process.env.CAPTURE_STORAGE_PROVIDER)
}

export function getCaptureStorageProviderLabel(provider = getCaptureStorageProvider()) {
    return provider === 'google-drive' ? 'Google Drive' : 'Supabase Storage'
}

function shouldFallbackToSupabase() {
    const raw = process.env.NEXUS_CAPTURE_STORAGE_FALLBACK_TO_SUPABASE
        || process.env.CAPTURE_STORAGE_FALLBACK_TO_SUPABASE
        || 'true'

    return !['0', 'false', 'no', 'off'].includes(raw.trim().toLowerCase())
}

function sanitizeSegment(value: string | null | undefined, fallback: string) {
    const sanitized = String(value || fallback)
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[\\/:*?"<>|#%{}[\]^~`]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

    return sanitized || fallback
}

function dateFolder(date = new Date()) {
    return date.toISOString().slice(0, 10)
}

function defaultCaptureFileName(input: UploadCaptureInput) {
    const format = sanitizeSegment(input.campaign.format, 'formato')
    const device = sanitizeSegment(input.campaign.device, 'device')
    return `${input.campaignId}_${format}_${device}_${Date.now()}.png`
}

function captureFolderSegments(campaign: CampaignStorageInfo) {
    return [
        sanitizeSegment(campaign.agency, 'Sem agencia'),
        sanitizeSegment(campaign.client, 'Sem cliente'),
        `PI ${sanitizeSegment(campaign.pi, 'sem-pi')}`,
        dateFolder(),
    ]
}

function buildStoragePath(input: UploadCaptureInput) {
    const safeFileName = sanitizeSegment(input.fileName || defaultCaptureFileName(input), 'captura.png')
    return [...captureFolderSegments(input.campaign), safeFileName].join('/')
}

function parseGoogleDriveFileId(pathOrUrl: string) {
    if (!pathOrUrl.startsWith(DRIVE_CAPTURE_PREFIX)) return null
    const withoutPrefix = pathOrUrl.slice(DRIVE_CAPTURE_PREFIX.length)
    return withoutPrefix.split(/[/?#]/)[0] || null
}

export function isGoogleDriveCapture(pathOrUrl: string) {
    return Boolean(parseGoogleDriveFileId(pathOrUrl))
}

function extractSupabaseStoragePath(pathOrUrl: string) {
    if (!pathOrUrl || !pathOrUrl.startsWith('http')) return null

    try {
        const url = new URL(pathOrUrl)
        const publicMarker = '/storage/v1/object/public/screenshots/'
        const objectMarker = '/storage/v1/object/screenshots/'
        const marker = url.pathname.includes(publicMarker) ? publicMarker : objectMarker
        const markerIndex = url.pathname.indexOf(marker)
        if (markerIndex === -1) return null
        return decodeURIComponent(url.pathname.slice(markerIndex + marker.length))
    } catch {
        const fallback = pathOrUrl.split('screenshots/')[1]?.split('?')[0]
        return fallback ? decodeURIComponent(fallback) : null
    }
}

export function getCaptureStorageKind(pathOrUrl: string) {
    if (isGoogleDriveCapture(pathOrUrl)) return 'google-drive'
    if (extractSupabaseStoragePath(pathOrUrl)) return 'supabase'
    if (pathOrUrl.startsWith('http')) return 'remote-url'
    return 'local'
}

function parseJsonCredential(rawValue: string) {
    const raw = rawValue.trim()
    if (raw.startsWith('{')) return JSON.parse(raw)
    return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'))
}

function buildServiceAccountCredentials() {
    const json = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_JSON
    if (json) return parseJsonCredential(json)

    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    if (!clientEmail || !privateKey) return null

    return {
        type: 'service_account',
        client_email: clientEmail,
        private_key: privateKey,
    }
}

async function getDriveClient() {
    if (driveClientPromise) return driveClientPromise

    driveClientPromise = (async () => {
        const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID?.trim()
        const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim()
        const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN?.trim()
        if (clientId && clientSecret && refreshToken) {
            const auth = new google.auth.OAuth2(clientId, clientSecret)
            auth.setCredentials({ refresh_token: refreshToken })
            return google.drive({ version: 'v3', auth })
        }

        const serviceAccountCredentials = buildServiceAccountCredentials()
        if (serviceAccountCredentials) {
            const auth = new google.auth.GoogleAuth({
                credentials: serviceAccountCredentials,
                scopes: DRIVE_SCOPES,
            })
            return google.drive({ version: 'v3', auth })
        }

        throw new Error(
            'Google Drive nao configurado. Defina GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON ou GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET e GOOGLE_DRIVE_REFRESH_TOKEN.'
        )
    })()

    return driveClientPromise
}

function getErrorStatus(error: unknown) {
    const candidate = error as { code?: number; response?: { status?: number } }
    return candidate.response?.status || candidate.code
}

async function withDriveRetry<T>(operation: () => Promise<T>, label: string): Promise<T> {
    let lastError: unknown

    for (let attempt = 0; attempt < 4; attempt++) {
        try {
            return await operation()
        } catch (error) {
            lastError = error
            const status = getErrorStatus(error)
            if (!status || !RETRYABLE_STATUS.has(status) || attempt === 3) break

            const delay = Math.min(8_000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250)
            console.warn(`[CaptureStorage] Google Drive retry ${attempt + 1}/3 em ${label}. Status: ${status}. Delay: ${delay}ms`)
            await new Promise(resolve => setTimeout(resolve, delay))
        }
    }

    throw lastError
}

function escapeDriveQueryValue(value: string) {
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

async function ensureDriveFolder(name: string, parentId?: string) {
    const drive = await getDriveClient()
    const safeName = sanitizeSegment(name, 'Adsnap Cloud')
    const parent = parentId || 'root'
    const cacheKey = `${parent}:${safeName}`
    const cached = driveFolderCache.get(cacheKey)
    if (cached) return cached

    const q = [
        `name = '${escapeDriveQueryValue(safeName)}'`,
        `mimeType = '${DRIVE_FOLDER_MIME}'`,
        `'${escapeDriveQueryValue(parent)}' in parents`,
        'trashed = false',
    ].join(' and ')

    const existing = await withDriveRetry(() => drive.files.list({
        q,
        spaces: 'drive',
        fields: 'files(id, name)',
        pageSize: 1,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
    }), 'listar pasta')

    const foundId = existing.data.files?.[0]?.id
    if (foundId) {
        driveFolderCache.set(cacheKey, foundId)
        return foundId
    }

    const created = await withDriveRetry(() => drive.files.create({
        requestBody: {
            name: safeName,
            mimeType: DRIVE_FOLDER_MIME,
            parents: [parent],
        },
        fields: 'id',
        supportsAllDrives: true,
    }), 'criar pasta')

    const createdId = created.data.id
    if (!createdId) throw new Error(`Google Drive nao retornou ID para a pasta ${safeName}`)

    driveFolderCache.set(cacheKey, createdId)
    return createdId
}

async function ensureDriveCaptureFolder(campaign: CampaignStorageInfo) {
    let parentId = (process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || process.env.NEXUS_GOOGLE_DRIVE_ROOT_FOLDER_ID || '').trim()
    if (!parentId) {
        parentId = await ensureDriveFolder(process.env.GOOGLE_DRIVE_ROOT_FOLDER_NAME || 'Adsnap Cloud')
    }

    for (const segment of captureFolderSegments(campaign)) {
        parentId = await ensureDriveFolder(segment, parentId)
    }

    return parentId
}

async function uploadToSupabase(imageBuffer: Buffer, input: UploadCaptureInput): Promise<StoredCapture> {
    const storagePath = buildStoragePath(input)

    const { error: uploadError } = await supabase.storage
        .from('screenshots')
        .upload(storagePath, imageBuffer, {
            contentType: 'image/png',
            upsert: true,
        })

    if (uploadError) {
        throw new Error(`Falha no upload para o Supabase Storage: ${uploadError.message}`)
    }

    const { data: { publicUrl } } = supabase.storage
        .from('screenshots')
        .getPublicUrl(storagePath)

    return {
        provider: 'supabase',
        uri: publicUrl,
        path: storagePath,
        size: imageBuffer.byteLength,
        checksum: crypto.createHash('sha256').update(imageBuffer).digest('hex'),
    }
}

async function uploadToGoogleDrive(imageBuffer: Buffer, input: UploadCaptureInput): Promise<StoredCapture> {
    const drive = await getDriveClient()
    const parentId = await ensureDriveCaptureFolder(input.campaign)
    const fileName = sanitizeSegment(input.fileName || defaultCaptureFileName(input), 'captura.png')
    const checksum = crypto.createHash('sha256').update(imageBuffer).digest('hex')

    const created = await withDriveRetry(() => drive.files.create({
        requestBody: {
            name: fileName,
            parents: [parentId],
            mimeType: 'image/png',
            appProperties: {
                source: 'adsnap-cloud',
                campaignId: input.campaignId,
                pi: input.campaign.pi || '',
                format: input.campaign.format || '',
                checksum,
            },
        },
        media: {
            mimeType: 'image/png',
            body: Readable.from(imageBuffer),
        },
        fields: 'id, name, size, md5Checksum, webViewLink',
        supportsAllDrives: true,
    }), 'upload de captura')

    const fileId = created.data.id
    if (!fileId) throw new Error('Google Drive nao retornou ID do arquivo enviado')

    return {
        provider: 'google-drive',
        uri: `${DRIVE_CAPTURE_PREFIX}${fileId}`,
        fileId,
        size: imageBuffer.byteLength,
        checksum,
    }
}

export async function uploadCaptureImage(imageBuffer: Buffer, input: UploadCaptureInput): Promise<StoredCapture> {
    const provider = getCaptureStorageProvider()
    if (provider === 'google-drive') {
        try {
            return await uploadToGoogleDrive(imageBuffer, input)
        } catch (error) {
            if (!shouldFallbackToSupabase()) throw error

            const fallback = await uploadToSupabase(imageBuffer, input)
            return {
                ...fallback,
                requestedProvider: 'google-drive',
                fallbackReason: error instanceof Error ? error.message : String(error),
            }
        }
    }
    return uploadToSupabase(imageBuffer, input)
}

async function fetchRemoteBuffer(url: string) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS)

    try {
        const response = await fetch(url, { signal: controller.signal })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return Buffer.from(await response.arrayBuffer())
    } finally {
        clearTimeout(timeout)
    }
}

async function downloadFromGoogleDrive(pathOrUrl: string) {
    const fileId = parseGoogleDriveFileId(pathOrUrl)
    if (!fileId) throw new Error('ID do Google Drive ausente na captura')

    const drive = await getDriveClient()
    const response = await withDriveRetry(() => drive.files.get(
        { fileId, alt: 'media', supportsAllDrives: true },
        { responseType: 'arraybuffer' }
    ), 'download de captura')

    return Buffer.from(response.data as ArrayBuffer)
}

export async function loadCaptureFile(pathOrUrl: string): Promise<Buffer> {
    if (!pathOrUrl) throw new Error('Caminho da captura vazio')

    if (isGoogleDriveCapture(pathOrUrl)) {
        return downloadFromGoogleDrive(pathOrUrl)
    }

    const supabasePath = extractSupabaseStoragePath(pathOrUrl)
    if (supabasePath) {
        const { data, error } = await supabase.storage.from('screenshots').download(supabasePath)
        if (!error) return Buffer.from(await data.arrayBuffer())
        console.warn('[CaptureStorage] Download via Supabase SDK falhou, tentando fetch:', error.message)
    }

    if (pathOrUrl.startsWith('http')) {
        return fetchRemoteBuffer(pathOrUrl)
    }

    return fs.readFile(pathOrUrl)
}

export async function deleteCaptureFile(pathOrUrl: string): Promise<boolean> {
    if (!pathOrUrl) return true

    if (isGoogleDriveCapture(pathOrUrl)) {
        const fileId = parseGoogleDriveFileId(pathOrUrl)
        if (!fileId) return false
        const drive = await getDriveClient()
        await withDriveRetry(() => drive.files.delete({ fileId, supportsAllDrives: true }), 'exclusao de captura')
            .catch((error) => {
                if (getErrorStatus(error) === 404) return
                throw error
            })
        return true
    }

    const supabasePath = extractSupabaseStoragePath(pathOrUrl)
    if (supabasePath) {
        const { error } = await supabase.storage.from('screenshots').remove([supabasePath])
        if (error) throw new Error(`Erro ao apagar arquivo no Supabase: ${error.message}`)
        return true
    }

    if (pathOrUrl.startsWith('http')) return false

    try {
        await fs.unlink(pathOrUrl)
        return true
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code === 'ENOENT') return true
        throw error
    }
}

export function getCaptureFileExtension(pathOrUrl: string) {
    if (isGoogleDriveCapture(pathOrUrl)) return '.png'
    try {
        return path.extname(new URL(pathOrUrl, 'https://adsnap.local').pathname) || '.png'
    } catch {
        return path.extname(pathOrUrl) || '.png'
    }
}
