import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'
import fs from 'fs'
import path from 'path'
import JSZip from 'jszip'
import { startOfDay, endOfDay, format } from 'date-fns'

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url)
    const dateStr = searchParams.get('date')

    if (!dateStr) {
        return NextResponse.json({ error: 'Data não fornecida' }, { status: 400 })
    }

    try {
        const [year, month, day] = dateStr.split('-').map(Number)
        const date = new Date(year, month - 1, day)
        const start = startOfDay(date)
        const end = endOfDay(date)

        const [captures, settings] = await Promise.all([
            prisma.capture.findMany({
                where: {
                    createdAt: {
                        gte: start,
                        lte: end
                    },
                    campaign: {
                        isArchived: false
                    }
                },
                include: {
                    campaign: true
                }
            }),
            prisma.settings.findFirst()
        ])

        if (captures.length === 0) {
            return NextResponse.json({ error: 'Nenhum print encontrado para esta data' }, { status: 404 })
        }

        const bannerFormats = (settings as any)?.bannerFormats
        const formats = bannerFormats ? JSON.parse(bannerFormats) : []

        const zip = new JSZip()

        for (const capture of captures) {
            if (fs.existsSync(capture.screenshotPath)) {
                const fileContent = fs.readFileSync(capture.screenshotPath)

                const campaign = capture.campaign

                // Resolve Format Label
                const foundFormat = formats.find((f: any) =>
                    f.id?.trim().toLowerCase() === campaign.format?.trim().toLowerCase()
                )
                const formatLabel = foundFormat
                    ? foundFormat.label
                    : (campaign.format?.includes('x') ? campaign.format : 'Indefinido')

                // Santitize names for folder structure
                const safeClient = campaign.client.replace(/[\\/:*?"<>|]/g, '').trim()
                const safeCampaign = campaign.campaignName.replace(/[\\/:*?"<>|]/g, '').trim()
                const piFolder = `PI ${campaign.pi} - ${safeClient}${safeCampaign ? ` - ${safeCampaign}` : ''}`

                const timeStr = format(capture.createdAt, 'HH-mm-ss')
                const fileName = `${formatLabel}_${timeStr}.png`

                // Add to PI-specific folder (JSZip requires forward slashes)
                zip.file(`${piFolder}/${fileName}`, fileContent)
            }
        }

        const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })
        const filename = `prints-${format(date, 'yyyy-MM-dd')}.zip`

        return new NextResponse(new Uint8Array(zipBuffer), {
            status: 200,
            headers: {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename="${filename}"`
            }
        })

    } catch (error) {
        console.error('[ZIP Download Error]', error)
        return NextResponse.json({ error: 'Erro ao gerar arquivo ZIP' }, { status: 500 })
    }
}
