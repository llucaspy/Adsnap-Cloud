
import prisma from './src/lib/prisma.js';
import { startOfDay } from 'date-fns';

async function debugDashboardToday() {
    try {
        const now = new Date();
        const todayLocal = startOfDay(now);

        console.log(`Current Server Time (now): ${now.toISOString()}`);
        console.log(`startOfDay(now) result: ${todayLocal.toISOString()}`);

        // Brazil Time "Today"
        // 00:00:00 BRT = 03:00:00 UTC
        const brtToday = new Date(now);
        brtTime.setUTCHours(brtTime.getUTCHours() - 3); // Shift back to see what day it is in BR
        const dateStr = brtTime.toISOString().split('T')[0];
        const brtStart = new Date(`${dateStr}T03:00:00.000Z`);

        console.log(`Brazil "Today" Start (aligned with Books): ${brtStart.toISOString()}`);

        const captures = await prisma.capture.findMany({
            where: {
                status: 'SUCCESS',
                createdAt: { gte: brtStart }
            },
            orderBy: { createdAt: 'desc' },
            take: 5
        });

        console.log(`Captures found using brtStart (${brtStart.toISOString()}): ${captures.length}`);
        captures.forEach(c => {
            console.log(`- ${c.id} | ${c.createdAt.toISOString()}`);
        });

        const capturesStandard = await prisma.capture.findMany({
            where: {
                status: 'SUCCESS',
                createdAt: { gte: todayLocal }
            },
            orderBy: { createdAt: 'desc' },
            take: 5
        });
        console.log(`\nCaptures found using todayLocal (${todayLocal.toISOString()}): ${capturesStandard.length}`);
        capturesStandard.forEach(c => {
            console.log(`- ${c.id} | ${c.createdAt.toISOString()}`);
        });

    } catch (err) {
        console.error(err);
    } finally {
        await prisma.$disconnect();
    }
}

// Fix typo in script before running
const code = `
import prisma from './src/lib/prisma.js';
import { startOfDay } from 'date-fns';

async function debugDashboardToday() {
  try {
    const now = new Date();
    const todayLocal = startOfDay(now);
    
    console.log("Current Server Time (now):", now.toISOString());
    console.log("startOfDay(now) result (UTC):", todayLocal.toISOString());

    // Brazil Time "Today"
    // 00:00:00 BRT = 03:00:00 UTC
    const brtCheck = new Date(now.getTime() - (3 * 60 * 60 * 1000));
    const dateStr = brtCheck.toISOString().split('T')[0];
    const brtStart = new Date(\`\${dateStr}T03:00:00.000Z\`);

    console.log("Brazil 'Today' Start (aligned with Books):", brtStart.toISOString());

    const captures = await prisma.capture.findMany({
      where: {
        status: 'SUCCESS',
        createdAt: { gte: brtStart }
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    console.log(\`Captures found using brtStart (\${brtStart.toISOString()}): \${captures.length}\`);
    captures.forEach(c => {
        console.log(\`- \${c.id} | \${c.createdAt.toISOString()}\`);
    });

  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

debugDashboardToday();
`;

// Overwrite the file with the corrected code
import fs from 'fs';
fs.writeFileSync('c:/Users/lucas.mendonça/Desktop/Adsnap-Cloud/debug-dashboard.js', code);
