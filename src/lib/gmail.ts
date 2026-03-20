import { google } from 'googleapis'

export async function getGmailClient(credentials: any, token: any) {
    const { client_secret, client_id, redirect_uris } = credentials.web
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0])
    oAuth2Client.setCredentials(token)
    return google.gmail({ version: 'v1', auth: oAuth2Client })
}

/**
 * Helper: creates a Gmail client from env vars.
 */
export function createGmailClientFromEnv() {
    const credentials = {
        web: {
            client_id: process.env.GMAIL_CLIENT_ID,
            client_secret: process.env.GMAIL_CLIENT_SECRET,
            redirect_uris: [process.env.GMAIL_REDIRECT_URI]
        }
    }
    const token = { refresh_token: process.env.GMAIL_REFRESH_TOKEN }
    if (!credentials.web.client_id || !token.refresh_token) return null
    return getGmailClient(credentials, token)
}

export interface EmailMessage {
    id: string
    threadId: string
    subject: string
    from: string
    to: string
    snippet: string
    date: string
}

/**
 * Worker use: fetch only emails addressed TO the user that are unread and recent.
 */
export async function fetchRecentEmails(gmail: any): Promise<EmailMessage[]> {
    const userEmail = process.env.GMAIL_USER_EMAIL || ''
    const query = userEmail 
        ? `to:${userEmail} is:unread newer_than:1h`
        : 'to:me is:unread newer_than:1h'

    return searchEmails(gmail, query, 10)
}

/**
 * Live search: search Gmail with any custom query string.
 * Used by Nexus Chat for on-demand queries like "from:marcelle to:me".
 */
export async function searchEmails(gmail: any, query: string, maxResults = 5): Promise<EmailMessage[]> {
    const res = await gmail.users.messages.list({
        userId: 'me',
        maxResults,
        q: query
    })

    const messages = res.data.messages || []
    const detailedMessages: EmailMessage[] = []

    for (const msg of messages) {
        const detail = await gmail.users.messages.get({
            userId: 'me',
            id: msg.id
        })

        const headers = detail.data.payload.headers
        const getHeader = (name: string) => headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || ''

        detailedMessages.push({
            id: msg.id,
            threadId: msg.threadId,
            subject: getHeader('Subject') || 'Sem Assunto',
            from: getHeader('From') || 'Desconhecido',
            to: getHeader('To') || '',
            snippet: detail.data.snippet || '',
            date: detail.data.internalDate
        })
    }

    return detailedMessages
}
