import prisma from '@/lib/prisma'

type BannerFormatDefinition = {
    id?: string | null
    label?: string | null
    width?: number | string | null
    height?: number | string | null
}

function normalizeFormatKey(value: string | null | undefined) {
    return String(value || '').trim().toLowerCase()
}

function fallbackFormatLabel(format: BannerFormatDefinition) {
    if (format.label?.trim()) return format.label.trim()
    if (format.width && format.height) return `${format.width}x${format.height}`
    return null
}

export function createFormatLabelMap(value: string | null | undefined) {
    const labels = new Map<string, string>()

    try {
        const formats = JSON.parse(value || '[]') as BannerFormatDefinition[]
        for (const format of formats) {
            const label = fallbackFormatLabel(format)
            const id = normalizeFormatKey(format.id)
            if (id && label) labels.set(id, label)
        }
    } catch {
        return labels
    }

    return labels
}

export async function getFormatLabelMap() {
    const settings = await prisma.settings.findUnique({
        where: { id: 1 },
        select: { bannerFormats: true },
    })

    return createFormatLabelMap(settings?.bannerFormats)
}

export function resolveFormatLabel(formatLabelMap: Map<string, string>, formatId: string | null | undefined) {
    const raw = String(formatId || '').trim()
    if (!raw) return 'Formato'
    return formatLabelMap.get(normalizeFormatKey(raw)) || raw
}
