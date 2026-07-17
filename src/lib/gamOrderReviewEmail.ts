import nodemailer from 'nodemailer'
import prisma from './prisma'
import type { GamImportDraft } from './gamImportPlanner'
import type { GamImportWriteResult } from './gamImportWriter'
import { getSmtpConfig } from './emailService'
import { nexusLogStore } from './nexusLogStore'

const DEFAULT_GAM_ORDER_REVIEW_RECIPIENTS = ['opec.gov@metropoles.com']
const GAM_ORDER_REVIEW_SECRET_KEYS = [
    'GAM_ORDER_REVIEW_RECIPIENTS',
    'GAM_REVIEW_RECIPIENTS',
]
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface SendGamOrderReviewEmailOptions {
    draft: GamImportDraft
    jobId: string
    reviewUrl: string
    writeResult?: GamImportWriteResult
}

function parseRecipients(value: string | null | undefined) {
    if (!value) return []

    try {
        const parsed = JSON.parse(value)
        if (Array.isArray(parsed)) {
            return parsed
                .map(item => String(item).trim())
                .filter(Boolean)
        }
    } catch {
        // Fall back to comma/semicolon separated env values.
    }

    return value
        .split(/[;,]/)
        .map(item => item.trim())
        .filter(Boolean)
}

function normalizeRecipients(recipients: string[]) {
    const unique = new Map<string, string>()

    for (const recipient of recipients) {
        const clean = recipient.trim()
        if (!clean || !EMAIL_PATTERN.test(clean)) continue
        unique.set(clean.toLowerCase(), clean)
    }

    return Array.from(unique.values())
}

async function getReviewRecipients() {
    const envRecipients = parseRecipients(
        process.env.GAM_ORDER_REVIEW_RECIPIENTS
        || process.env.GAM_REVIEW_RECIPIENTS,
    )
    const normalizedEnvRecipients = normalizeRecipients(envRecipients)
    if (normalizedEnvRecipients.length > 0) return normalizedEnvRecipients

    const secretRows = await prisma.nexusSecrets.findMany({
        where: { name: { in: GAM_ORDER_REVIEW_SECRET_KEYS } },
        select: { name: true, value: true },
    }).catch(() => null)

    for (const key of GAM_ORDER_REVIEW_SECRET_KEYS) {
        const secretRecipients = normalizeRecipients(parseRecipients(
            secretRows?.find(secret => secret.name === key)?.value,
        ))
        if (secretRecipients.length > 0) return secretRecipients
    }

    return DEFAULT_GAM_ORDER_REVIEW_RECIPIENTS
}

function escapeHtml(value: string | number | null | undefined) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
}

function brDate(value: string | null | undefined) {
    if (!value) return 'N/A'
    const parts = value.slice(0, 10).split('-')
    if (parts.length !== 3) return value
    return `${parts[2]}/${parts[1]}/${parts[0]}`
}

function buildSubject(draft: GamImportDraft) {
    const client = draft.client || 'Cliente'
    return `[Adsnap] Order GAM pronta para revisão - ${client} - PI ${draft.pi}`
}

function buildText(options: SendGamOrderReviewEmailOptions) {
    const { draft, reviewUrl, writeResult } = options
    const rows = [
        'Order GAM pronta para revisão.',
        '',
        `Cliente: ${draft.client}`,
        `Campanha: ${draft.campaignName || '-'}`,
        `PI: ${draft.pi}`,
        `Order: ${draft.orderId}`,
        `Período: ${brDate(draft.flightStart)} até ${brDate(draft.flightEnd)}`,
        `Formatos identificados: ${draft.mediaEntries.length}`,
        `Itens bloqueados: ${draft.blockedItems.length}`,
    ]

    if (writeResult) {
        rows.push(
            `Campanhas criadas: ${writeResult.created}`,
            `Campanhas já existentes: ${writeResult.skipped}`,
            `Itens pendentes/bloqueados: ${writeResult.blocked}`,
        )
    }

    rows.push('', `Revisar order: ${reviewUrl}`)
    return rows.join('\n')
}

function buildHtml(options: SendGamOrderReviewEmailOptions) {
    const { draft, reviewUrl, writeResult } = options
    const created = writeResult?.created ?? 0
    const skipped = writeResult?.skipped ?? 0
    const blocked = writeResult?.blocked ?? draft.blockedItems.length

    const metrics = [
        { label: 'Criadas', value: created },
        { label: 'Existentes', value: skipped },
        { label: 'Formatos', value: draft.mediaEntries.length },
        { label: 'Pendências', value: blocked },
    ]

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body style="margin:0;background:#f4f4f5;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#18181b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden;">
    <tr>
      <td style="padding:28px 28px 18px;border-bottom:1px solid #e4e4e7;">
        <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;color:#71717a;">Adsnap Cloud</div>
        <h1 style="margin:10px 0 0;font-size:24px;line-height:1.2;color:#18181b;">Order pronta para revisão</h1>
        <p style="margin:10px 0 0;font-size:14px;line-height:1.6;color:#52525b;">O Nexus cadastrou a order do GAM e deixou a revisão pronta para conferência operacional.</p>
      </td>
    </tr>
    <tr>
      <td style="padding:24px 28px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
          <tr>
            ${metrics.map(metric => `
            <td style="width:25%;padding:0 6px 12px 0;">
              <div style="border:1px solid #e4e4e7;border-radius:10px;padding:14px;background:#fafafa;">
                <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#71717a;font-weight:700;">${escapeHtml(metric.label)}</div>
                <div style="font-size:24px;font-weight:800;color:#18181b;margin-top:6px;">${escapeHtml(metric.value)}</div>
              </div>
            </td>`).join('')}
          </tr>
        </table>

        <div style="border:1px solid #e4e4e7;border-radius:10px;padding:16px;background:#ffffff;margin-top:8px;">
          <p style="margin:0 0 8px;font-size:13px;color:#71717a;font-weight:700;text-transform:uppercase;letter-spacing:.08em;">Resumo da order</p>
          <p style="margin:0;font-size:15px;font-weight:700;color:#18181b;">${escapeHtml(draft.client)}</p>
          <p style="margin:6px 0 0;font-size:14px;color:#52525b;">${escapeHtml(draft.campaignName || '-')}</p>
          <p style="margin:12px 0 0;font-size:13px;color:#52525b;">PI ${escapeHtml(draft.pi)} | Order ${escapeHtml(draft.orderId)} | ${escapeHtml(brDate(draft.flightStart))} até ${escapeHtml(brDate(draft.flightEnd))}</p>
        </div>

        <div style="margin-top:22px;">
          <a href="${escapeHtml(reviewUrl)}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 18px;border-radius:8px;">Abrir revisão da order</a>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export async function sendGamOrderReviewEmail(options: SendGamOrderReviewEmailOptions) {
    try {
        const recipients = await getReviewRecipients()
        if (recipients.length === 0) {
            await nexusLogStore.addLog(
                'Nexus GAM: e-mail de revisão não enviado; nenhum destinatário configurado.',
                'INFO',
                JSON.stringify({ jobId: options.jobId, orderId: options.draft.orderId }),
            )
            return false
        }

        const smtp = await getSmtpConfig()
        const transporter = nodemailer.createTransport({
            host: smtp.host,
            port: smtp.port,
            secure: smtp.port === 465,
            auth: { user: smtp.user, pass: smtp.pass },
        })

        const info = await transporter.sendMail({
            from: smtp.from,
            to: recipients,
            subject: buildSubject(options.draft),
            html: buildHtml(options),
            text: buildText(options),
        })

        if (!info.accepted.length) {
            throw new Error('Servidor SMTP recusou todos os destinatários.')
        }

        await nexusLogStore.addLog(
            `Nexus GAM: e-mail de revisão enviado para ${recipients.length} destinatário(s).`,
            'SUCCESS',
            JSON.stringify({ jobId: options.jobId, orderId: options.draft.orderId, messageId: info.messageId }),
        )
        return true
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        await nexusLogStore.addLog(
            `Nexus GAM: e-mail de revisão não enviado: ${message}`,
            'ERROR',
            JSON.stringify({ jobId: options.jobId, orderId: options.draft.orderId }),
        )
        return false
    }
}
