import { PrismaClient } from '@prisma/client'
import { getAggregatedAdOpsMetrics } from '../app/adops/actions'

const prisma = new PrismaClient()

async function snapshotMetrics() {
    console.log('--- Starting Daily Metrics Snapshot ---')
    
    try {
        const stats = await getAggregatedAdOpsMetrics()
        const campaigns = stats.campaigns
        
        const today = new Date()
        today.setHours(0, 0, 0, 0)

        for (const cam of campaigns) {
            console.log(`Snapshotting PI ${cam.id}: ${cam.name}`)
            
            await prisma.dailyMetric.upsert({
                where: {
                    campaignId_date: {
                        campaignId: cam.id,
                        date: today
                    }
                },
                update: {
                    delivered: cam.deliveredImpressions,
                    viewability: cam.viewability,
                    goal: cam.goalImpressions,
                    pacing: cam.deliveredImpressions / cam.goalImpressions
                },
                create: {
                    campaignId: cam.id,
                    date: today,
                    delivered: cam.deliveredImpressions,
                    viewability: cam.viewability,
                    goal: cam.goalImpressions,
                    pacing: cam.deliveredImpressions / cam.goalImpressions
                }
            })
        }
        
        console.log(`Successfully snapshotted ${campaigns.length} campaigns.`)
    } catch (error) {
        console.error('Error during snapshot:', error)
    } finally {
        await prisma.$disconnect()
    }
}

snapshotMetrics()
