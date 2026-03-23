import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'

// 1. Load default .env (Common in Production/CI)
dotenv.config()

// 2. Load .env.local if it exists (Common in Local Development)
const localEnvPath = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(localEnvPath)) {
    dotenv.config({ path: localEnvPath, override: true })
    console.log('[Env] Environment variables loaded from .env.local')
} else {
    console.log('[Env] .env.local not found, using system environment or .env')
}
