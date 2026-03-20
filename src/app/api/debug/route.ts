import { NextResponse } from 'next/server'

export async function GET() {
    return NextResponse.json({
        status: 'alive',
        time: new Date().toISOString(),
        env: {
            GEMINI_API_KEY: process.env.GEMINI_API_KEY ? 'Present' : 'Missing',
            DATABASE_URL: process.env.DATABASE_URL ? 'Present' : 'Missing'
        }
    })
}
