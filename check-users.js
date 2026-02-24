
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const userCount = await prisma.user.count();
        console.log(`[Database Check] total de usuários no Supabase: ${userCount}`);

        if (userCount > 0) {
            const users = await prisma.user.findMany({
                select: { email: true, name: true, role: true }
            });
            console.log('Usuários encontrados:');
            console.table(users);
        }
    } catch (error) {
        console.error('Erro ao verificar usuários:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

main();
