import dotenv from 'dotenv'
import path from 'path'

// Load .env.local as soon as this module is imported
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

console.log('[Env] Environment variables loaded from .env.local')
