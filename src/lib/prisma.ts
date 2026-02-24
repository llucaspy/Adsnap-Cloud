import { PrismaClient } from '@prisma/client'

const prismaClientSingleton = () => {
    const url = process.env.DATABASE_URL
    if (!url) {
        console.error('❌ [Prisma] DATABASE_URL is UNDEFINED in process.env!')
    } else {
        console.log('✅ [Prisma] DATABASE_URL is present.')
    }

    return new PrismaClient({
        datasources: {
            db: {
                url: url,
            },
        },
    })
}

declare global {
    var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>
}

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton()

export default prisma

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma
