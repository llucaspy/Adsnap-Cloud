import prisma from './prisma';

type NexusLog = {
    message: string;
    timestamp: number;
    type: 'INFO' | 'SUCCESS' | 'ERROR' | 'SYSTEM';
    details?: string;
    campaignId?: string;
};

class NexusLogStore {
    private static instance: NexusLogStore;
    private logs: NexusLog[] = [];
    private readonly MAX_LOGS = 50;

    private constructor() { }

    public static getInstance(): NexusLogStore {
        if (!NexusLogStore.instance) {
            NexusLogStore.instance = new NexusLogStore();
        }
        return NexusLogStore.instance;
    }

    public async addLog(message: string, type: NexusLog['type'] = 'INFO', details?: string, campaignId?: string) {
        // Log to memory (for UI)
        this.logs.push({
            message,
            timestamp: Date.now(),
            type,
            details,
            campaignId
        });

        if (this.logs.length > this.MAX_LOGS) {
            this.logs.shift();
        }

        // Log to database (Persistent)
        try {
            await prisma.nexusLog.create({
                data: {
                    level: type,
                    message,
                    details,
                    campaignId,
                    createdAt: new Date()
                }
            });
        } catch (err) {
            console.error('[NexusLogStore] Failed to save log to DB:', err);
        }
    }

    public getLogs(): NexusLog[] {
        return this.logs;
    }

    public clear() {
        this.logs = [];
    }
}

export const nexusLogStore = NexusLogStore.getInstance();
