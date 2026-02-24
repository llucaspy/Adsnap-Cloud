
const { PrismaClient } = require('@prisma/client');
const sqlitePrisma = new PrismaClient({
    datasources: {
        db: {
            url: 'file:./dev.db'
        }
    }
});

async function main() {
    try {
        const userCount = await sqlitePrisma.user.count();
        console.log(`[Local SQLite Check] total de usuários localmente: ${userCount}`);

        if (userCount > 0) {
            const users = await sqlitePrisma.user.findMany();
            console.log('Usuários locais:');
            console.table(users.map(u => ({ email: u.email, name: u.name, role: u.role })));
        }
    } catch (error) {
        console.error('Erro ao verificar usuários locais:', error.message);
    } finally {
        await sqlitePrisma.$disconnect();
    }
}

main();
