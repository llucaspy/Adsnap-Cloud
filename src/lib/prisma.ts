import { PrismaClient } from '@prisma/client'

const prismaClientSingleton = () => {
    return new PrismaClient({
        datasources: {
            db: {
                url: process.env.DATABASE_URL,
            },
        },
    })
}

declare global {
    var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>
}

let prisma: ReturnType<typeof prismaClientSingleton> | undefined

export const getPrisma = () => {
    if (prisma) return prisma
    prisma = globalThis.prismaGlobal ?? prismaClientSingleton()
    if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma
    return prisma
}

const prismaProxy = new Proxy({} as ReturnType<typeof prismaClientSingleton>, {
    get: (target, prop) => {
        const client = getPrisma()
        const value = (client as any)[prop]
        if (typeof value === 'function') {
            return value.bind(client)
        }
        return value
    }
})

export default prismaProxy
