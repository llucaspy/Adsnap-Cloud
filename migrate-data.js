const { PrismaClient: SQLiteClient } = require('./prisma/sqlite-client');
const { PrismaClient: SupabaseClient } = require('@prisma/client');

const sqlite = new SQLiteClient();
const supabase = new SupabaseClient();

async function migrate() {
    console.log('--- Iniciando Migração (SQLite -> Supabase) ---');

    try {
        // 1. Migrar Usuários
        console.log('\n[1/3] Migrando Usuários...');
        const localUsers = await sqlite.user.findMany();
        console.log(`Encontrados ${localUsers.length} usuários locais.`);

        for (const user of localUsers) {
            await supabase.user.upsert({
                where: { email: user.email },
                update: {
                    name: user.name,
                    password: user.password,
                    role: user.role,
                    isActive: user.isActive,
                    updatedAt: new Date()
                },
                create: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    password: user.password,
                    role: user.role,
                    isActive: user.isActive,
                    createdAt: user.createdAt,
                    updatedAt: user.updatedAt
                }
            });
            console.log(` Usuário migrado: ${user.email}`);
        }

        // 2. Migrar Configurações
        console.log('\n[2/3] Migrando Configurações...');
        const localSettings = await sqlite.settings.findFirst();
        if (localSettings) {
            await supabase.settings.upsert({
                where: { id: 1 },
                update: {
                    nexusMaxRetries: localSettings.nexusMaxRetries,
                    nexusTimeout: localSettings.nexusTimeout,
                    nexusDelay: localSettings.nexusDelay,
                    autoCleanupDays: localSettings.autoCleanupDays,
                    webhookUrl: localSettings.webhookUrl,
                    performanceMode: localSettings.performanceMode,
                    feedPollingRate: localSettings.feedPollingRate,
                    maintenanceMode: localSettings.maintenanceMode,
                    bannerFormats: localSettings.bannerFormats,
                    updatedAt: new Date()
                },
                create: {
                    id: 1,
                    nexusMaxRetries: localSettings.nexusMaxRetries,
                    nexusTimeout: localSettings.nexusTimeout,
                    nexusDelay: localSettings.nexusDelay,
                    autoCleanupDays: localSettings.autoCleanupDays,
                    webhookUrl: localSettings.webhookUrl,
                    performanceMode: localSettings.performanceMode,
                    feedPollingRate: localSettings.feedPollingRate,
                    maintenanceMode: localSettings.maintenanceMode,
                    bannerFormats: localSettings.bannerFormats,
                    updatedAt: localSettings.updatedAt
                }
            });
            console.log(' Configurações migradas.');
        }

        // 3. Migrar Campanhas
        console.log('\n[3/3] Migrando Campanhas...');
        const localCampaigns = await sqlite.campaign.findMany();
        console.log(`Encontradas ${localCampaigns.length} campanhas locais.`);

        for (const c of localCampaigns) {
            await supabase.campaign.upsert({
                where: { id: c.id },
                update: {
                    agency: c.agency,
                    client: c.client,
                    campaignName: c.campaignName || '',
                    pi: c.pi,
                    format: c.format,
                    url: c.url,
                    device: c.device,
                    status: c.status,
                    segmentation: c.segmentation,
                    flightStart: c.flightStart,
                    flightEnd: c.flightEnd,
                    isArchived: c.isArchived,
                    isScheduled: c.isScheduled,
                    scheduledTimes: c.scheduledTimes,
                    lastCaptureAt: c.lastCaptureAt,
                    retryCount: c.retryCount,
                    updatedAt: new Date()
                },
                create: {
                    id: c.id,
                    agency: c.agency,
                    client: c.client,
                    campaignName: c.campaignName || '',
                    pi: c.pi,
                    format: c.format,
                    url: c.url,
                    device: c.device,
                    status: c.status,
                    segmentation: c.segmentation,
                    flightStart: c.flightStart,
                    flightEnd: c.flightEnd,
                    isArchived: c.isArchived,
                    isScheduled: c.isScheduled,
                    scheduledTimes: c.scheduledTimes,
                    lastCaptureAt: c.lastCaptureAt,
                    retryCount: c.retryCount,
                    createdAt: c.createdAt,
                    updatedAt: c.updatedAt
                }
            });
            console.log(` Campanha migrada: ${c.client} - ${c.format} (${c.id})`);
        }

        console.log('\n--- Migração concluída com sucesso! (Capturas ignoradas conforme solicitado) ---');

    } catch (error) {
        console.error('\nErro durante a migração:', error);
    } finally {
        await sqlite.$disconnect();
        await supabase.$disconnect();
    }
}

migrate();
