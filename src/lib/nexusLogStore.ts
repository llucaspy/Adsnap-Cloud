type NexusLog = {
    message: string;
    timestamp: number;
    type: 'INFO' | 'SUCCESS' | 'ERROR' | 'SYSTEM';
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

    public addLog(message: string, type: NexusLog['type'] = 'INFO') {
        this.logs.push({
            message,
            timestamp: Date.now(),
            type
        });

        if (this.logs.length > this.MAX_LOGS) {
            this.logs.shift();
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
