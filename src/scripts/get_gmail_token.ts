import { google } from 'googleapis'
import * as fs from 'fs'
import * as path from 'path'

const CREDENTIALS_PATH = 'c:/Program Files/WinRAR/Cloud/Adsnap-Cloud/api_acesso/client_secret_463805385482-nk04u5ncg7s3dnp64rs7u1b99vejc6cb.apps.googleusercontent.com.json'
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly']

async function getTokens(code: string) {
    const content = fs.readFileSync(CREDENTIALS_PATH, 'utf8')
    const credentials = JSON.parse(content)
    const { client_secret, client_id, redirect_uris } = credentials.installed
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0])

    const { tokens } = await oAuth2Client.getToken(code)
    console.log('TOKENS:', JSON.stringify(tokens, null, 2))
}

const code = '4/0AfrIepB3_Pa9-5XL11RTKHix0LQQ1GSan3wTtlQaYClXDwKyKcItQsRWm8ieNHnMGHu_Gg'
getTokens(code)
