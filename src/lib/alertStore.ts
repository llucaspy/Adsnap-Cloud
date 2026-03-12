/**
 * In-memory alert store for visual notifications in the dashboard.
 * Alerts auto-expire after 1 hour.
 */

export type AlertType = 'error' | 'warning' | 'info' | 'success'

export interface Alert {
    id: string
    type: AlertType
    title: string
    message: string
    campaignId?: string
    createdAt: number   // timestamp ms
    dismissed: boolean
}

class AlertStore {
    private static instance: AlertStore
    private alerts: Alert[] = []
    private readonly MAX_ALERTS = 30
    private readonly EXPIRY_MS  = 60 * 60 * 1000  // 1 hour

    private constructor() {}

    static getInstance(): AlertStore {
        if (!AlertStore.instance) {
            AlertStore.instance = new AlertStore()
        }
        return AlertStore.instance
    }

    addAlert(type: AlertType, title: string, message: string, campaignId?: string): Alert {
        const alert: Alert = {
            id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            type,
            title,
            message,
            campaignId,
            createdAt: Date.now(),
            dismissed: false,
        }

        this.alerts.push(alert)

        // Trim old alerts
        if (this.alerts.length > this.MAX_ALERTS) {
            this.alerts = this.alerts.slice(-this.MAX_ALERTS)
        }

        return alert
    }

    getActiveAlerts(): Alert[] {
        const now = Date.now()
        // Remove expired
        this.alerts = this.alerts.filter(a => now - a.createdAt < this.EXPIRY_MS)
        // Return non-dismissed
        return this.alerts.filter(a => !a.dismissed)
    }

    dismissAlert(id: string): boolean {
        const alert = this.alerts.find(a => a.id === id)
        if (alert) {
            alert.dismissed = true
            return true
        }
        return false
    }

    clear() {
        this.alerts = []
    }
}

export const alertStore = AlertStore.getInstance()
