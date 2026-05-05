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
    const pi = searchParams.get('pi')

    if (!dateStr && !pi) {
        return NextResponse.json({ error: 'Nenhum par\u00e2metro (date ou pi) fornecido' }, { status: 400 })
    }

    try {
        let whereClause: any = { campaign: { isArchived: false } }
        let zipFilename = 'prints.zip'

        if (pi) {
            whereClause = { ...whereClause, campaign: { ...whereClause.campaign, pi } }
            zipFilename = `campanha-PI-${pi}.zip`
        } else if (dateStr) {
            const [year, month, day] = dateStr.split('-').map(Number)
            const date = new Date(year, month - 1, day)
            const start = startOfDay(date)
            const end = endOfDay(date)
            whereClause = {
                ...whereClause,
                createdAt: { gte: start, lte: end }
            }
            zipFilename = `prints-${format(date, 'yyyy-MM-dd')}.zip`
        }

        const [captures, settings] = await Promise.all([
            prisma.capture.findMany({
                where: whereClause,
                include: { campaign: true },
                orderBy: { createdAt: 'asc' }
            }),
            prisma.settings.findFirst()
        ])

        if (captures.length === 0) {
            return NextResponse.json({ error: 'Nenhum print encontrado' }, { status: 404 })
        }

        const bannerFormats = (settings as any)?.bannerFormats
        const formats = bannerFormats ? JSON.parse(bannerFormats) : []

        const zip = new JSZip()

        for (const capture of captures) {
            let fileContent: Buffer | null = null;
            const isUrl = capture.screenshotPath.startsWith('http');

            try {
                if (isUrl) {
                    const response = await fetch(capture.screenshotPath);
                    if (response.ok) {
                        const arrayBuffer = await response.arrayBuffer();
                        fileContent = Buffer.from(arrayBuffer);
                    }
                } else if (fs.existsSync(capture.screenshotPath)) {
                    fileContent = fs.readFileSync(capture.screenshotPath);
                }

                if (fileContent) {
                    const campaign = capture.campaign;

                    // Resolve Format Label
                    const foundFormat = formats.find((f: any) =>
                        f.id?.trim().toLowerCase() === campaign.format?.trim().toLowerCase()
                    );
                    const formatLabel = foundFormat
                        ? foundFormat.label
                        : (campaign.format?.includes('x') ? campaign.format : 'Indefinido');

                    // Santitize names for folder structure
                    const safeClient = campaign.client.replace(/[\\\\/:*?\"<>|]/g, '').trim();
                    const safeCampaign = campaign.campaignName.replace(/[\\\\/:*?\"<>|]/g, '').trim();
                    
                    let filePath = '';
                    if (pi) {
                        // If downloading by PI, organize by day first
                        const dateFolder = format(capture.createdAt, 'yyyy-MM-dd');
                        filePath = `${dateFolder}/${formatLabel}_${format(capture.createdAt, 'HH-mm-ss')}.png`;
                    } else {
                        // If downloading by date, organize by PI folder
                        const piFolder = `PI ${campaign.pi} - ${safeClient}${safeCampaign ? ` - ${safeCampaign}` : ''}`;
                        const timeStr = format(capture.createdAt, 'HH-mm-ss');
                        filePath = `${piFolder}/${formatLabel}_${timeStr}.png`;
                    }

                    zip.file(filePath, fileContent);
                }
            } catch (err) {
                console.error(`[ZIP] Error processing capture ${capture.id}:`, err);
            }
        }

        const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })

        return new NextResponse(new Uint8Array(zipBuffer), {
            status: 200,
            headers: {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename=\"${zipFilename}\"`
            }
        })

    } catch (error) {
        console.error('[ZIP Download Error]', error)
        return NextResponse.json({ error: 'Erro ao gerar arquivo ZIP' }, { status: 500 })
    }
}
