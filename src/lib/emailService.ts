import fs from 'fs/promises'
import path from 'path'
import JSZip from 'jszip'
import nodemailer from 'nodemailer'
import prisma from './prisma'
import { nexusLogStore } from './nexusLogStore'
import { getBrasiliaDayRange } from './governmentReportScope'

const FEDERAL_SEGMENTATION = 'GOV_FEDERAL'
const MAX_RAW_BYTES_PER_EMAIL = 16 * 1024 * 1024
const DOWNLOAD_CONCURRENCY = 5

interface SendReportOptions {
    pi: string
    recipients: string[]
    dispatchId: string
    reportDate?: string | null
}

interface CaptureFile {
    id: string
    campaignId: string
    content: Buffer
    zipPath: string
}

interface FormatDefinition {
    id?: string
    label?: string
    width?: number
    height?: number
}

interface DeliveryProgress {
    version: number
    parts: Record<string, string>
}

interface EmailCampaignRow {
    id: string
    client: string
    agency: string
    campaignName: string
    formatLabel: string
    device: string
    flightStart: Date | null
    flightEnd: Date | null
    printCount: number
}

function getSmtpConfig() {
    const host = process.env.SMTP_HOST || 'smtp.gmail.com'
    const port = Number(process.env.SMTP_PORT || 465)
    const user = process.env.SMTP_USER
    const pass = process.env.SMTP_PASS
    const from = process.env.SMTP_FROM || (user ? `Adsnap Cloud <${user}>` : undefined)

    if (!user || !pass || !from) {
        throw new Error('SMTP_USER, SMTP_PASS e SMTP_FROM precisam estar configurados no worker')
    }

    return { host, port, user, pass, from }
}

function parseDeliveryProgress(value: string | null, version: number): DeliveryProgress {
    try {
        const parsed = JSON.parse(value || '{}') as Partial<DeliveryProgress>
        if (parsed.version === version && parsed.parts && typeof parsed.parts === 'object') {
            return { version, parts: parsed.parts }
        }
    } catch {
        // A new delivery version starts with no completed parts.
    }
    return { version, parts: {} }
}

function parseJsonArray<T>(value: string | null | undefined): T[] {
    try {
        const parsed = JSON.parse(value || '[]')
        return Array.isArray(parsed) ? parsed : []
    } catch {
        return []
    }
}

function sanitizePathSegment(value: string) {
    return value.replace(/[\\/:*?"<>|]/g, '').trim() || 'Indefinido'
}

function escapeHtml(value: string) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
}

function formatBrtDate(date: Date | null) {
    if (!date) return 'N/A'
    // Usamos UTC para as datas de veiculação (que não têm horas)
    // para evitar que atrasem 1 dia ao serem formatadas no fuso local.
    return new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'UTC',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    }).format(date)
}

function getBrtDateKey(date: Date) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date)
}

function getBrtTimeKey(date: Date) {
    return new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).format(date).replace(/:/g, '-')
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
    const results = new Array<R>(items.length)
    let cursor = 0

    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (cursor < items.length) {
            const index = cursor++
            results[index] = await mapper(items[index])
        }
    })

    await Promise.all(workers)
    return results
}

async function loadCapture(pathOrUrl: string): Promise<Buffer> {
    if (!pathOrUrl.startsWith('http')) {
        return fs.readFile(pathOrUrl)
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30_000)

    try {
        const response = await fetch(pathOrUrl, { signal: controller.signal })
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`)
        }
        return Buffer.from(await response.arrayBuffer())
    } finally {
        clearTimeout(timeout)
    }
}

function splitFilesBySize(files: CaptureFile[]) {
    const batches: CaptureFile[][] = []
    let current: CaptureFile[] = []
    let currentBytes = 0

    for (const file of files) {
        if (current.length > 0 && currentBytes + file.content.length > MAX_RAW_BYTES_PER_EMAIL) {
            batches.push(current)
            current = []
            currentBytes = 0
        }

        current.push(file)
        currentBytes += file.content.length
    }

    if (current.length > 0) batches.push(current)
    return batches
}

async function createZip(files: CaptureFile[]) {
    const zip = new JSZip()
    for (const file of files) {
        zip.file(file.zipPath, file.content)
    }
    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } })
}

function buildEmailHtml(params: {
    client: string
    agency: string
    campaignName: string
    pi: string
    flightStart: Date | null
    flightEnd: Date | null
    formats: string[]
    campaignRows: EmailCampaignRow[]
    printCount: number
    part: number
    totalParts: number
    reportDate?: string | null
}) {
    const partLabel = params.totalParts > 1
        ? `Parte ${params.part} de ${params.totalParts}`
        : 'Arquivo completo'
    const rowHtml = params.campaignRows.map((campaign, index) => `
        <tr>
            <td style="padding: 10px 8px; border-top: 1px solid #eeeeee; color: #737373;">${index + 1}</td>
            <td style="padding: 10px 8px; border-top: 1px solid #eeeeee;">
                <strong style="color: #171717;">${escapeHtml(campaign.client)}</strong><br>
                <span style="color: #737373; font-size: 12px;">${escapeHtml(campaign.campaignName || '-')}</span>
            </td>
            <td style="padding: 10px 8px; border-top: 1px solid #eeeeee;">${escapeHtml(campaign.formatLabel)}</td>
            <td style="padding: 10px 8px; border-top: 1px solid #eeeeee;">${escapeHtml(campaign.device)}</td>
            <td style="padding: 10px 8px; border-top: 1px solid #eeeeee; text-align: right;">${campaign.printCount}</td>
        </tr>
    `).join('')

    return `
        <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #171717;">
            <div style="background: #0f0f0f; color: #ffffff; padding: 28px; border-radius: 8px 8px 0 0;">
                <p style="margin: 0 0 8px; font-size: 12px; color: #a3a3a3;">ADSNAP CLOUD</p>
                <h1 style="margin: 0; font-size: 22px;">${params.reportDate ? 'Prints do dia' : 'Prints finais'}</h1>
                <p style="margin: 8px 0 0; color: #d4d4d4;">Campanha de Governo Federal</p>
            </div>
            <div style="border: 1px solid #e5e5e5; border-top: 0; padding: 28px; border-radius: 0 0 8px 8px;">
                <p style="margin: 0 0 18px;">Os prints da campanha estao no arquivo ZIP anexado.</p>
                <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                    <tr><td style="padding: 6px 0; font-weight: 700; width: 130px;">Cliente</td><td>${escapeHtml(params.client)}</td></tr>
                    <tr><td style="padding: 6px 0; font-weight: 700;">Agencia</td><td>${escapeHtml(params.agency)}</td></tr>
                    <tr><td style="padding: 6px 0; font-weight: 700;">Campanha</td><td>${escapeHtml(params.campaignName || '-')}</td></tr>
                    <tr><td style="padding: 6px 0; font-weight: 700;">PI</td><td>${escapeHtml(params.pi)}</td></tr>
                    ${params.reportDate ? `<tr><td style="padding: 6px 0; font-weight: 700;">Data</td><td>${escapeHtml(params.reportDate.split('-').reverse().join('/'))}</td></tr>` : ''}

                    <tr><td style="padding: 6px 0; font-weight: 700;">Formatos</td><td>${params.formats.map(escapeHtml).join(', ')}</td></tr>
                    <tr><td style="padding: 6px 0; font-weight: 700;">Anexo</td><td>${partLabel}, ${params.printCount} print(s)</td></tr>
                </table>
                <div style="margin-top: 24px;">
                    <p style="margin: 0 0 10px; font-size: 13px; font-weight: 700; color: #171717;">Campanhas/formatos selecionados</p>
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                        <thead>
                            <tr>
                                <th align="left" style="padding: 8px; color: #737373; font-size: 11px; text-transform: uppercase;">#</th>
                                <th align="left" style="padding: 8px; color: #737373; font-size: 11px; text-transform: uppercase;">Campanha</th>
                                <th align="left" style="padding: 8px; color: #737373; font-size: 11px; text-transform: uppercase;">Formato</th>
                                <th align="left" style="padding: 8px; color: #737373; font-size: 11px; text-transform: uppercase;">Device</th>
                                <th align="right" style="padding: 8px; color: #737373; font-size: 11px; text-transform: uppercase;">Prints</th>
                            </tr>
                        </thead>
                        <tbody>${rowHtml}</tbody>
                    </table>
                </div>
                ${params.totalParts > 1 ? '<p style="margin: 20px 0 0; color: #737373; font-size: 12px;">O volume de arquivos exigiu a divisao do relatorio em mais de um e-mail.</p>' : ''}
            </div>
        </div>
    `
}

export async function sendCampaignReport({ pi, recipients, dispatchId, reportDate }: SendReportOptions): Promise<{
    success: boolean
    error?: string
    sentParts?: number
    attachmentBytes?: number
}> {
    console.log(`[Government Report] Preparando anexos da PI ${pi}.`)

    try {
        const dispatch = await prisma.emailDispatch.findUnique({ where: { id: dispatchId } })
        if (!dispatch) throw new Error('Disparo nao encontrado')
        const smtp = getSmtpConfig()

        const campaigns = await prisma.campaign.findMany({
            where: {
                pi,
                segmentation: FEDERAL_SEGMENTATION,
                isArchived: false,
            },
            select: {
                id: true,
                client: true,
                agency: true,
                campaignName: true,
                format: true,
                pi: true,
                device: true,
                flightStart: true,
                flightEnd: true,
            },
            orderBy: { createdAt: 'asc' },
        })

        if (campaigns.length === 0) {
            throw new Error(`A PI ${pi} nao pertence a uma campanha de Governo Federal`)
        }

        const settings = await prisma.settings.findUnique({ where: { id: 1 } })
        const formatDefinitions = parseJsonArray<FormatDefinition>(settings?.bannerFormats)
        const formatLabelById = new Map(formatDefinitions.map(format => [
            format.id || '',
            format.label || (format.width && format.height ? `${format.width}x${format.height}` : format.id || 'Indefinido'),
        ]))

        const campaignById = new Map(campaigns.map(campaign => [campaign.id, campaign]))
        const captureFilters = campaigns.map(campaign => ({
            campaignId: campaign.id,
            ...(campaign.flightStart && campaign.flightEnd
                ? { createdAt: { gte: campaign.flightStart, lte: campaign.flightEnd } }
                : {}),
        }))

        const dayRange = reportDate ? getBrasiliaDayRange(reportDate) : null
        const captures = await prisma.capture.findMany({
            where: {
                status: 'SUCCESS',
                screenshotPath: { not: '' },
                ...(dayRange
                    ? {
                        campaignId: { in: campaigns.map(campaign => campaign.id) },
                        createdAt: { gte: dayRange.start, lte: dayRange.end },
                    }
                    : { OR: captureFilters }),
            },
            select: {
                id: true,
                campaignId: true,
                screenshotPath: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'asc' },
        })

        if (captures.length === 0) {
            throw new Error(reportDate
                ? `Nenhum print foi encontrado no book de ${reportDate}`
                : 'Nenhum print foi encontrado no periodo da campanha')
        }

        const capturesByCampaignId = new Map<string, number>()
        for (const capture of captures) {
            capturesByCampaignId.set(capture.campaignId, (capturesByCampaignId.get(capture.campaignId) || 0) + 1)
        }

        const campaignRows: EmailCampaignRow[] = campaigns.map(campaign => ({
            id: campaign.id,
            client: campaign.client,
            agency: campaign.agency,
            campaignName: campaign.campaignName,
            formatLabel: formatLabelById.get(campaign.format) || campaign.format,
            device: campaign.device,
            flightStart: campaign.flightStart,
            flightEnd: campaign.flightEnd,
            printCount: capturesByCampaignId.get(campaign.id) || 0,
        }))
        const missingCampaignRows = campaignRows.filter(campaign => campaign.printCount === 0)
        if (missingCampaignRows.length > 0) {
            const missingList = missingCampaignRows
                .slice(0, 8)
                .map(campaign => `${campaign.client} / ${campaign.formatLabel} (${campaign.device})`)
                .join('; ')
            const suffix = missingCampaignRows.length > 8 ? `; +${missingCampaignRows.length - 8} item(ns)` : ''
            throw new Error(`Relatorio incompleto: ${missingCampaignRows.length} campanha(s)/formato(s) sem print no periodo. ${missingList}${suffix}`)
        }

        const loaded = await mapWithConcurrency(captures, DOWNLOAD_CONCURRENCY, async capture => {
            try {
                const campaign = campaignById.get(capture.campaignId)
                if (!campaign) return null

                const content = await loadCapture(capture.screenshotPath)
                const formatLabel = sanitizePathSegment(formatLabelById.get(campaign.format) || campaign.format)
                const campaignFolder = sanitizePathSegment(`${campaign.client} - ${campaign.campaignName || campaign.pi}`)
                const dateFolder = getBrtDateKey(capture.createdAt)
                const timeKey = getBrtTimeKey(capture.createdAt)
                const extension = path.extname(new URL(capture.screenshotPath, 'https://adsnap.local').pathname) || '.png'

                return {
                    id: capture.id,
                    campaignId: capture.campaignId,
                    content,
                    zipPath: `${dateFolder}/${campaignFolder}/${formatLabel}/${formatLabel}_${campaign.device}_${timeKey}_${capture.id.slice(0, 8)}${extension}`,
                } satisfies CaptureFile
            } catch (error) {
                console.error(`[Government Report] Falha ao baixar captura ${capture.id}:`, error)
                return null
            }
        })

        const files = loaded.filter((file): file is CaptureFile => Boolean(file))
        if (files.length === 0) {
            throw new Error('Os registros existem, mas nenhum arquivo de print pode ser baixado')
        }

        const batches = splitFilesBySize(files)
        const zipBuffers = await Promise.all(batches.map(createZip))
        const transporter = nodemailer.createTransport({
            host: smtp.host,
            port: smtp.port,
            secure: smtp.port === 465,
            auth: { user: smtp.user, pass: smtp.pass },
        })
        const firstCampaign = campaigns[0]
        const formats = Array.from(new Set(campaigns.map(campaign =>
            `${formatLabelById.get(campaign.format) || campaign.format} (${campaign.device})`
        )))
        const deliveryProgress = parseDeliveryProgress(dispatch.emailMessageId, dispatch.sendVersion)

        for (let index = 0; index < zipBuffers.length; index++) {
            const part = index + 1
            if (deliveryProgress.parts[String(part)]) continue

            const suffix = zipBuffers.length > 1 ? ` - parte ${part} de ${zipBuffers.length}` : ''
            const dateSuffix = reportDate ? `-${reportDate}` : ''
            const filename = `prints-PI-${sanitizePathSegment(pi)}${dateSuffix}${zipBuffers.length > 1 ? `-parte-${part}` : ''}.zip`
            const info = await transporter.sendMail({
                from: smtp.from,
                to: recipients,
                subject: `Relatorio de prints${reportDate ? ` de ${reportDate.split('-').reverse().join('/')}` : ''} - ${firstCampaign.client} - PI ${pi}${suffix}`,
                html: buildEmailHtml({
                    client: firstCampaign.client,
                    agency: firstCampaign.agency,
                    campaignName: firstCampaign.campaignName,
                    pi,
                    flightStart: campaigns.reduce<Date | null>((min, campaign) =>
                        !min || (campaign.flightStart && campaign.flightStart < min) ? campaign.flightStart : min, null),
                    flightEnd: campaigns.reduce<Date | null>((max, campaign) =>
                        !max || (campaign.flightEnd && campaign.flightEnd > max) ? campaign.flightEnd : max, null),
                    formats,
                    campaignRows,
                    printCount: batches[index].length,
                    part,
                    totalParts: zipBuffers.length,
                    reportDate,
                }),
                text: [
                    reportDate
                        ? `Relatorio diario de prints da campanha de Governo Federal - ${reportDate.split('-').reverse().join('/')}.`
                        : 'Relatorio final de prints da campanha de Governo Federal.',
                    `Cliente: ${firstCampaign.client}`,
                    `Campanha: ${firstCampaign.campaignName || '-'}`,
                    `PI: ${pi}`,
                    'Campanhas/formatos selecionados:',
                    ...campaignRows.map((campaign, rowIndex) =>
                        `${rowIndex + 1}. ${campaign.client} - ${campaign.campaignName || '-'} - ${campaign.formatLabel} (${campaign.device}) - ${campaign.printCount} print(s)`
                    ),
                    `Anexo: ${filename}`,
                ].join('\n'),
                attachments: [{
                    filename,
                    content: zipBuffers[index],
                    contentType: 'application/zip',
                }],
            })

            if (!info.accepted.length) {
                throw new Error(`Servidor SMTP recusou todos os destinatarios da parte ${part}`)
            }

            deliveryProgress.parts[String(part)] = info.messageId
            await prisma.emailDispatch.update({
                where: { id: dispatchId },
                data: { emailMessageId: JSON.stringify(deliveryProgress) },
            })
        }

        const attachmentBytes = zipBuffers.reduce((total, buffer) => total + buffer.length, 0)
        await prisma.emailDispatch.update({
            where: { id: dispatchId },
            data: {
                status: 'SENT',
                lastSentAt: new Date(),
                errorMessage: null,
                emailMessageId: JSON.stringify(deliveryProgress),
                attachmentCount: files.length,
                attachmentBytes,
            },
        })

        await nexusLogStore.addLog(
            `Relatorio Governo Federal: PI ${pi} enviada para ${recipients.length} destinatario(s)`,
            'SUCCESS',
            `${files.length} prints em ${zipBuffers.length} anexo(s)`,
            firstCampaign.id,
        )

        return { success: true, sentParts: zipBuffers.length, attachmentBytes }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('[Government Report] Falha:', error)

        try {
            await prisma.emailDispatch.update({
                where: { id: dispatchId },
                data: { status: 'FAILED', errorMessage: message },
            })
        } catch {
            // The original error is more useful than a secondary persistence failure.
        }

        await nexusLogStore.addLog(`Relatorio Governo Federal: falha na PI ${pi}: ${message}`, 'ERROR')
        return { success: false, error: message }
    }
}
