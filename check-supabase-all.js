const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const userCount = await prisma.user.count();
        const campaignCount = await prisma.campaign.count();
        const captureCount = await prisma.capture.count();
        const settingsCount = await prisma.settings.count();

        console.log('--- Supabase Stats ---');
        console.log(`Users: ${userCount}`);
        console.log(`Campaigns: ${campaignCount}`);
        console.log(`Captures: ${captureCount}`);
        console.log(`Settings: ${settingsCount}`);

    } catch (error) {
        console.error('Error checking Supabase:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

main();
