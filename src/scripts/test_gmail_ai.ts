import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
import { getGmailClient, fetchRecentEmails } from '../lib/gmail'
import { classifyEmail } from '../lib/gemini'

async function test() {
    console.log('--- TESTANDO GMAIL + GEMINI ---')
    console.log('CLIENT_ID:', process.env.GMAIL_CLIENT_ID ? 'OK' : 'MISSING')
    console.log('REFRESH_TOKEN:', process.env.GMAIL_REFRESH_TOKEN ? 'OK' : 'MISSING')

    const credentials = {
        web: {
            client_id: process.env.GMAIL_CLIENT_ID,
            client_secret: process.env.GMAIL_CLIENT_SECRET,
            redirect_uris: [process.env.GMAIL_REDIRECT_URI]
        }
    }
    const token = { refresh_token: process.env.GMAIL_REFRESH_TOKEN }

    try {
        const gmail = await getGmailClient(credentials, token)
        const emails = await fetchRecentEmails(gmail)
        console.log(`Encontrados ${emails.length} e-mails recentes não lidos.`)

        for (const email of emails) {
            console.log(`\nAnalisando: "${email.subject}" de ${email.from}`)
            const isConversation = await classifyEmail(email.subject, email.snippet, email.from)
            console.log(`Resultado Gemini: ${isConversation ? '✅ CONVERSA' : '❌ RUÍDO'}`)
        }
    } catch (err) {
        console.error('Erro no teste:', err)
    }
}

test()
