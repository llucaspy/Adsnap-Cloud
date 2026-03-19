import { google } from 'googleapis'

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly']

export async function getGmailClient(credentials: any, token: any) {
    const { client_secret, client_id, redirect_uris } = credentials.web
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0])
    oAuth2Client.setCredentials(token)
    return google.gmail({ version: 'v1', auth: oAuth2Client })
}

export async function fetchRecentEmails(gmail: any, lastCheckedId?: string) {
    const res = await gmail.users.messages.list({
        userId: 'me',
        maxResults: 10,
        q: 'is:unread' // Only check unread to save tokens/processing
    })

    const messages = res.data.messages || []
    const detailedMessages = []

    for (const msg of messages) {
        if (msg.id === lastCheckedId) break

        const detail = await gmail.users.messages.get({
            userId: 'me',
            id: msg.id
        })

        const headers = detail.data.payload.headers
        const subject = headers.find((h: any) => h.name === 'Subject')?.value || 'No Subject'
        const from = headers.find((h: any) => h.name === 'From')?.value || 'Unknown'
        const snippet = detail.data.snippet || ''

        detailedMessages.push({
            id: msg.id,
            threadId: msg.threadId,
            subject,
            from,
            snippet,
            date: detail.data.internalDate
        })
    }

    return detailedMessages
}
