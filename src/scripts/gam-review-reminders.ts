import '../lib/env'
import { getPrisma } from '../lib/prisma'
import { sendPendingGamReviewReminders } from '../lib/gamOrderTelegram'

async function main() {
    const result = await sendPendingGamReviewReminders()
    console.log(`[Nexus GAM] Lembretes de revisao: ${result.sent}/${result.checked} enviados (intervalo ${result.reminderMinutes}min).`)
}

main()
    .catch(error => {
        console.error('[Nexus GAM] Falha nos lembretes de revisao:', error)
        process.exitCode = 1
    })
    .finally(async () => {
        await getPrisma().$disconnect()
    })
