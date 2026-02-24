const { PrismaClient } = require('./prisma/sqlite-client');
const sqlitePrisma = new PrismaClient();

async function main() {
    try {
        const campaignCount = await sqlitePrisma.campaign.count();
        const userCount = await sqlitePrisma.user.count();
        const captureCount = await sqlitePrisma.capture.count();
        const settingsCount = await sqlitePrisma.settings.count();

        console.log('--- Local SQLite Stats (Adsnap v2) ---');
        console.log(`Users: ${userCount}`);
        console.log(`Campaigns: ${campaignCount}`);
        console.log(`Captures: ${captureCount}`);
        console.log(`Settings: ${settingsCount}`);

        if (userCount > 0) {
            const users = await sqlitePrisma.user.findMany({ select: { email: true, name: true } });
            console.log('Users:', users);
        }
    } catch (error) {
        console.error('Erro ao contar dados locais:', error.message);
    } finally {
        await sqlitePrisma.$disconnect();
    }
}

main();
