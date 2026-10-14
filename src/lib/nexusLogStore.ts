import prisma from './prisma';
import { redactLogText, sanitizeLogMessage, sanitizeLogDetails } from './logRedaction';

type NexusLog = {
    message: string;
    timestamp: number;
    type: 'INFO' | 'SUCCESS' | 'ERROR' | 'SYSTEM' | 'API_ERROR' | 'EMAIL_ALERT';
    details?: string;
    campaignId?: string;
};

type PersistedLog = {
    level: NexusLog['type'];
    message: string;
    details?: string;
    campaignId?: string;
    createdAt: Date;
};

export class NexusLogStore {
    private static instance: NexusLogStore;
    private logs: NexusLog[] = [];
    private readonly MAX_LOGS = 50;

    constructor(private readonly persist: (data: PersistedLog) => Promise<unknown> = data => prisma.nexusLog.create({ data })) { }

    public static getInstance(): NexusLogStore {
        if (!NexusLogStore.instance) {
            NexusLogStore.instance = new NexusLogStore();
        }
        return NexusLogStore.instance;
    }

    public async addLog(message: string, type: NexusLog['type'] = 'INFO', details?: string, campaignId?: string) {
        const safeMessage = sanitizeLogMessage(message);
        const safeDetails = sanitizeLogDetails(details) ?? undefined;
        // Log to memory (for UI)
        this.logs.push({
            message: safeMessage,
            timestamp: Date.now(),
            type,
            details: safeDetails,
            campaignId
        });

        if (this.logs.length > this.MAX_LOGS) {
            this.logs.shift();
        }

        // Log to database (Persistent)
        try {
            await this.persist({
                level: type,
                message: safeMessage,
                details: safeDetails,
                campaignId,
                createdAt: new Date()
            });
        } catch (err) {
            console.error('[NexusLogStore] Failed to save log to DB:', redactLogText(
                err instanceof Error ? err.message : String(err),
                1_000,
            ));
        }
    }

    public getLogs(): NexusLog[] {
        return this.logs.map(log => ({ ...log }));
    }

    public clear() {
        this.logs = [];
    }
}

export const nexusLogStore = NexusLogStore.getInstance();
