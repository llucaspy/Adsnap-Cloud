import { NexusOrderConsole } from '@/components/NexusOrderConsole'
import { getNexusOrderJobs } from './actions'

export const dynamic = 'force-dynamic'

export default async function NexusPage() {
    const jobs = await getNexusOrderJobs()
    return <NexusOrderConsole initialJobs={jobs} />
}
