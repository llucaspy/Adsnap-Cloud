// Seed script: creates the admin user
// Run with: npx tsx prisma/seed.ts

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
    const adminEmail = 'devls'
    const adminPassword = 'devls@'
    const adminName = 'Administrador'

    // Check if admin already exists
    const existing = await prisma.user.findUnique({
        where: { email: adminEmail }
    })

    if (existing) {
        console.log('✅ Admin user already exists, skipping seed.')
        return
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(adminPassword, 12)

    // Create admin user
    const admin = await prisma.user.create({
        data: {
            email: adminEmail,
            password: hashedPassword,
            name: adminName,
            role: 'admin',
            isActive: true,
        }
    })

    console.log(`✅ Admin user created: ${admin.email} (${admin.id})`)
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect())
