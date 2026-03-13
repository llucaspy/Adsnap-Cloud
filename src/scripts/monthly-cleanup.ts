import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { supabase } from '../lib/supabase'
import JSZip from 'jszip'
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns'

const prisma = new PrismaClient()

const BOT_TOKEN = process.env.NexusTelegram || ''
const CHAT_ID = process.env.chatidtelegram || ''

async function sendToTelegram(zipBuffer: Buffer, fileName: string, caption: string) {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`
    
    // Using simple fetch with FormData for file upload
    const formData = new FormData()
    formData.append('chat_id', CHAT_ID)
    formData.append('caption', caption)
    
    // Convert Buffer to Blob for FormData
    const blob = new Blob([zipBuffer], { type: 'application/zip' })
    formData.append('document', blob, fileName)

    try {
        const response = await fetch(url, {
            method: 'POST',
            body: formData
        })
        const result = await response.json()
        return result.ok
    } catch (error) {
        console.error('[Cleanup] Erro ao enviar para o Telegram:', error)
        return false
    }
}

async function monthlyCleanup() {
    console.log('[Cleanup] Iniciando limpeza mensal...')

    // 1. Define range: Previous Month
    const previousMonth = subMonths(new Date(), 1)
    const startDate = startOfMonth(previousMonth)
    const endDate = endOfMonth(previousMonth)
    const monthLabel = format(previousMonth, 'MMMM-yyyy')

    console.log(`[Cleanup] Período: ${format(startDate, 'dd/MM/yyyy')} até ${format(endDate, 'dd/MM/yyyy')}`)

    try {
        // 2. Find captures from previous month
        const captures = await prisma.capture.findMany({
            where: {
                createdAt: {
                    gte: startDate,
                    lte: endDate
                },
                status: 'SUCCESS'
            },
            include: {
                campaign: true
            }
        })

        if (captures.length === 0) {
            console.log('[Cleanup] Nenhuma captura encontrada para o período anterior.')
            return
        }

        console.log(`[Cleanup] ${captures.length} capturas encontradas. Iniciando download e compactação...`)

        const zip = new JSZip()

        // 3. Process each capture
        for (const capture of captures) {
            if (!capture.screenshotPath || !capture.screenshotPath.startsWith('http')) continue

            try {
                // Download from Supabase (screenshotPath is the public URL)
                const response = await fetch(capture.screenshotPath)
                if (!response.ok) throw new Error(`Falha no download: ${response.statusText}`)
                
                const buffer = await response.arrayBuffer()
                
                // Structure: Agency / Client / PI / [Name]_[ID].png
                const agency = (capture.campaign.agency || 'Sem_Agencia').replace(/\W/g, '_')
                const client = (capture.campaign.client || 'Sem_Cliente').replace(/\W/g, '_')
                const pi = (capture.campaign.pi || 'Sem_PI').replace(/\W/g, '_')
                const fileName = `${capture.campaign.campaignName.replace(/\W/g, '_') || 'Captura'}_${capture.id}.png`
                
                const filePath = `${agency}/${client}/${pi}/${fileName}`
                zip.file(filePath, buffer)
                
                console.log(`[Cleanup] Adicionado ao ZIP: ${filePath}`)
            } catch (error) {
                console.error(`[Cleanup] Erro ao processar captura ${capture.id}:`, error)
            }
        }

        // 4. Generate ZIP
        console.log('[Cleanup] Gerando arquivo ZIP...')
        const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })
        const zipSizeMB = zipBuffer.length / (1024 * 1024)
        
        if (zipSizeMB > 49) {
            console.warn(`[Cleanup] AVISO: ZIP excedeu o limite do Telegram (${zipSizeMB.toFixed(2)}MB).`)
            // In a real scenario, we might want to split or use another storage
            // For now, we proceed and see if Telegram accepts (limit for local server is 2GB, API is 50MB)
        }

        const fileName = `backup_capturas_${monthLabel}.zip`
        const caption = `📦 <b>Backup Mensal Automatizado</b>\n\n📅 Período: ${monthLabel}\n📸 Capturas: ${captures.length}\n💾 Tamanho: ${zipSizeMB.toFixed(2)} MB\n\n✅ Backup concluído com sucesso.`

        // 5. Send to Telegram
        console.log('[Cleanup] Enviando para Telegram...')
        const sent = await sendToTelegram(zipBuffer, fileName, caption)

        if (sent) {
            console.log('[Cleanup] Backup enviado com sucesso! Iniciando deleção...')

            // 6. Delete from Supabase Storage & Database
            let deletedCount = 0
            for (const capture of captures) {
                try {
                    // Extract path from public URL
                    // Example: https://.../storage/v1/object/public/screenshots/Agency/Client/file.png
                    // We need the part after 'screenshots/'
                    const urlParts = capture.screenshotPath.split('screenshots/')
                    if (urlParts.length > 1) {
                        const storagePath = decodeURIComponent(urlParts[1])
                        
                        const { error: storageError } = await supabase.storage
                            .from('screenshots')
                            .remove([storagePath])
                        
                        if (storageError) {
                            console.error(`[Cleanup] Erro ao deletar do storage ${storagePath}:`, storageError)
                        } else {
                            // Delete from DB only if storage delete didn't fail (or ignore and delete anyway to free local DB)
                            await prisma.capture.delete({ where: { id: capture.id } })
                            deletedCount++
                        }
                    }
                } catch (error) {
                    console.error(`[Cleanup] Erro ao remover captura ${capture.id}:`, error)
                }
            }

            console.log(`[Cleanup] Limpeza finalizada. ${deletedCount} registros removidos.`)
            
            await prisma.nexusLog.create({
                data: {
                    level: 'SUCCESS',
                    message: `[LIMPEZA MENSAL] Backup realizado: ${monthLabel}. ${deletedCount} capturas removidas.`
                }
            })
        } else {
            console.error('[Cleanup] Falha ao enviar backup para Telegram. Abortando deleção para preservar dados.')
            await prisma.nexusLog.create({
                data: {
                    level: 'ERROR',
                    message: `[LIMPEZA MENSAL] Falha no backup do mês ${monthLabel}. Deleção abortada.`
                }
            })
        }

    } catch (error) {
        console.error('[Cleanup] Erro fatal na limpeza mensal:', error)
    } finally {
        await prisma.$disconnect()
    }
}

monthlyCleanup()
