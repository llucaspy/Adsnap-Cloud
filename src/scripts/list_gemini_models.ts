import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
import { GoogleGenerativeAI } from '@google/generative-ai'

async function listModels() {
    console.log('API_KEY:', process.env.GEMINI_API_KEY ? 'OK' : 'MISSING')
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')
    try {
        const models = await genAI.listModels()
        console.log('MODELS:', JSON.stringify(models, null, 2))
    } catch (err) {
        console.error('Error listing models:', err)
    }
}

listModels()
