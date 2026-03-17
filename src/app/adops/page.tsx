import { getAggregatedAdOpsMetrics } from './actions'
import AdOpsDashboardView from '@/components/AdOpsDashboardView'

export default async function AdOpsPage() {
    const stats = await getAggregatedAdOpsMetrics()
    return <AdOpsDashboardView stats={stats} campaigns={stats.campaigns} />
}
