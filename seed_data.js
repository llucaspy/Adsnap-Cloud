const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const userCount = await prisma.user.count();
    console.log('User count:', userCount);

    if (userCount === 0) {
      console.log('No users found. Seeding initial admin user...');
      await prisma.user.create({
        data: {
          email: 'lucas.mendonca@metropoles.com',
          name: 'Lucas Mendonça',
          password: 'admin', // The user will likely change this
          role: 'admin'
        }
      });
      console.log('Admin user created.');
    }

    const settingsCount = await prisma.settings.count();
    console.log('Settings count:', settingsCount);

    if (settingsCount === 0) {
      console.log('No settings found. Seeding default settings...');
      await prisma.settings.create({
        data: {
          id: 1,
          nexusMaxRetries: 3,
          nexusTimeout: 60000,
          nexusDelay: 3000,
          autoCleanupDays: 30,
          telegramAlertsEnabled: true
        }
      });
      console.log('Default settings created.');
    }

  } catch (error) {
    console.error('Error checking/seeding data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
