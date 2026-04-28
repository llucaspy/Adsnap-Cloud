import { PrismaClient } from '@prisma/client'

async function test(url: string, name: string) {
  console.log(`Testing ${name}...`)
  const prisma = new PrismaClient({
    datasources: { db: { url } }
  })
  try {
    await prisma.$connect()
    console.log(`✅ ${name} SUCCESS`)
    await prisma.$disconnect()
    return true
  } catch (e: any) {
    console.log(`❌ ${name} FAILED: ${e.message}`)
    return false
  }
}

async function run() {
  const ref = "yoxraofhtwuodehvwwbp"
  const pooler = "aws-0-sa-east-1.pooler.supabase.com"

  // Test 4: Password with literal brackets encoded
  const pass_brackets = encodeURIComponent("[Adsnapdevls@]")
  await test(`postgresql://postgres.${ref}:${pass_brackets}@${pooler}:6543/postgres?pgbouncer=true`, "Brackets Encoded")

  // Test 5: Password Adsnapdevls@ with double encoding
  const pass_encoded = encodeURIComponent("Adsnapdevls@")
  await test(`postgresql://postgres.${ref}:${pass_encoded}@${pooler}:6543/postgres?pgbouncer=true`, "Double Encoded")
  
  // Test 6: Maybe ref is different? No, MCP confirmed it.
}

run()
