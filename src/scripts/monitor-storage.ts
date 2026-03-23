import '../lib/env'
import prisma from '../lib/prisma'

async function monitorStorage() {
    console.log('[Storage Monitor] Iniciando verificação...')

    try {
        // 0. Check settings and last run
        const settings = await prisma.settings.findFirst()
        if (!settings) {
            console.warn('[Storage Monitor] Configurações não encontradas. Usando padrões.')
        }

        const frequencyHours = settings?.storageCheckFrequency || 24
        const lastRun = settings?.storageCheckLastRun

        if (lastRun) {
            const nextRun = new Date(lastRun.getTime() + frequencyHours * 60 * 60 * 1000)
            if (new Date() < nextRun) {
                const diffMs = nextRun.getTime() - new Date().getTime()
                const diffHours = (diffMs / (1024 * 60 * 60)).toFixed(1)
                console.log(`[Storage Monitor] Já rodou recentemente. Próxima execução em aproximadamente ${diffHours} horas.`)
                return
            }
        }

        // Dynamic import to avoid CJS/ESM compatibility issues in some environments
        const { Resend } = await import('resend')
        const resend = new Resend(process.env.RESEND_API_KEY)

        // 1. Get total storage size
        const result = await (prisma as any).$queryRawUnsafe(
            `SELECT SUM((metadata->>'size')::bigint) as total_size 
             FROM storage.objects 
             WHERE bucket_id = 'screenshots'`
        ) as any[]

        const bytesUsed = Number(result[0]?.total_size || 0)
        const totalLimit = 1024 * 1024 * 1024 // 1GB in bytes
        const percentage = (bytesUsed / totalLimit) * 100
        const mbUsed = (bytesUsed / (1024 * 1024)).toFixed(2)

        console.log(`[Storage Monitor] Uso atual: ${mbUsed}MB (${percentage.toFixed(2)}%)`)

        // 2. Alert logic
        const thresholds = [90, 85, 70]
        let triggeredThreshold = 0

        for (const t of thresholds) {
            if (percentage >= t) {
                triggeredThreshold = t
                break
            }
        }

        if (triggeredThreshold > 0) {
            console.log(`[Storage Monitor] Limite de ${triggeredThreshold}% atingido!`)

            // Check if we already sent an alert recently (prevent spam)
            const lastAlert = await prisma.nexusLog.findFirst({
                where: {
                    level: 'SYSTEM',
                    message: { contains: `[ALERTA STORAGE] ${triggeredThreshold}%` },
                    createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24h
                }
            })

            if (!lastAlert) {
                if (!process.env.RESEND_API_KEY || !process.env.ALERT_EMAIL_RECIPIENT) {
                    console.warn('[Storage Monitor] Resend API Key ou Destinatário não configurados. Alerta ignorado.')
                } else {
                    await resend.emails.send({
                        from: 'Adsnap Nexus <onboarding@resend.dev>',
                        to: process.env.ALERT_EMAIL_RECIPIENT,
                        subject: `⚠️ Alerta de Armazenamento: ${triggeredThreshold}% atingido`,
                        html: `
                            <div style="font-family: sans-serif; padding: 20px; color: #333;">
                                <h1 style="color: #6d28d9;">Alerta Nexus Engine</h1>
                                <p>O armazenamento do Supabase atingiu o limite configurado.</p>
                                <div style="background: #f4f4f5; padding: 20px; border-radius: 10px; margin: 20px 0;">
                                    <p><strong>Uso Atual:</strong> ${mbUsed} MB</p>
                                    <p><strong>Porcentagem:</strong> ${percentage.toFixed(1)}%</p>
                                    <p><strong>Limite Total:</strong> 1024 MB</p>
                                </div>
                                <p>Recomendamos que você faça o download dos prints antigos e limpe o armazenamento via dashboard Adsnap.</p>
                                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
                                <small style="color: #94a3b8;">Este é um alerta automático do Adsnap Cloud.</small>
                            </div>
                        `
                    })

                    // Log the alert
                    await prisma.nexusLog.create({
                        data: {
                            level: 'SYSTEM',
                            message: `[ALERTA STORAGE] ${triggeredThreshold}% atingido (${mbUsed}MB)`,
                            details: `Email enviado para ${process.env.ALERT_EMAIL_RECIPIENT}`
                        }
                    })
                    console.log('[Storage Monitor] E-mail de alerta enviado!')
                }
            } else {
                console.log('[Storage Monitor] Alerta já enviado nas últimas 24h. Pulando...')
            }
        } else {
            console.log('[Storage Monitor] Tudo certo! Uso abaixo dos limites de alerta.')
        }

        // 3. Update last run
        await prisma.settings.update({
            where: { id: 1 },
            data: { storageCheckLastRun: new Date() }
        })

    } catch (error) {
        console.error('[Storage Monitor] Erro fatal:', error)
    } finally {
        await prisma.$disconnect()
    }
}

monitorStorage()
