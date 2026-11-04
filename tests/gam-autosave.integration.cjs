const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { PrismaClient } = require('@prisma/client')
const url = new URL(process.argv[2] || process.env.DATABASE_URL || 'postgresql://adsnap_test@127.0.0.1:55439/adsnap_worker_test')
if (!['127.0.0.1','localhost'].includes(url.hostname) || url.pathname !== '/adsnap_worker_test') throw Error('Isolated loopback fixtures only')
const db = new PrismaClient({ datasources: { db: { url: url.toString() } } })
const prefix='autosave_'+randomUUID(), jobIds=[], checks=[]
const entry={sourceLineItemId:prefix,sourceLineItemName:'fixture',creativeId:'123',sourceSize:'fixture',url:'https://portal.example/?google_preview=fixture&creativeId=123&lineItemId=456',device:'desktop',format:'fixture',formatLabel:'fixture',width:300,height:250,externalCampaignId:prefix,confidence:'high',warnings:[]}
const draft={orderId:'123',orderUrl:'https://admanager.google.com/777777#delivery/order/order_overview/order_id=123',agency:'Fixture',client:prefix,campaignName:'Automatic fixture',pi:prefix,segmentation:'PRIVADO',captureCadence:'DAILY',flightStart:'2026-11-03',flightEnd:'2026-11-05',isScheduled:false,scheduledTimes:'["08:00","18:00"]',mediaEntries:[entry],blockedItems:[],warnings:[]}
async function job(segmentation='PRIVADO',level='JOB_GAM_RUNNING') { const j=await db.nexusLog.create({data:{level,message:prefix,details:JSON.stringify({mode:'draft',requestedSegmentation:segmentation,requestedCaptureCadence:'DAILY'})}});jobIds.push(j.id);return j }
async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name)}
async function main(){
 const {finalizeAutomaticGamOrder}=await import('../src/lib/gamAutoSave.ts')
 const {shouldQueueScheduledCampaign}=await import('../src/lib/campaignSchedule.ts')
 const {registerGamOrder}=await import('../src/lib/gamOrderRegistration.ts')
 try{
  await check('a draft is saved and scheduled atomically as private daily without approval',async()=>{
   const j=await job();const r=await finalizeAutomaticGamOrder(db,j.id,draft)
   assert.equal(r.level,'JOB_GAM_SAVED');assert(r.saved)
   const c=await db.campaign.findUnique({where:{id:r.writeResult.campaignIds[0]}})
   assert.equal(c.segmentation,'PRIVADO');assert.equal(c.captureCadence,'DAILY');assert.equal(c.isScheduled,true);assert.equal(c.adOpsStatus,'ATIVA')
   assert(shouldQueueScheduledCampaign(c,new Date('2026-11-04T12:00:00-03:00')))
   assert.equal((await db.nexusLog.findUnique({where:{id:j.id}})).level,'JOB_GAM_SAVED')
  })
  await check('federal overrides a stale DAILY flag and captures only start/end civil days',async()=>{
   const j=await job('GOV_FEDERAL');const r=await finalizeAutomaticGamOrder(db,j.id,draft)
   assert.equal(r.writeResult.created,0);assert.equal(r.writeResult.skipped,1)
   const c=await db.campaign.findUnique({where:{id:r.writeResult.campaignIds[0]}})
   assert.equal(c.segmentation,'GOV_FEDERAL');assert.equal(c.captureCadence,'BOUNDARY');assert(c.isScheduled)
   assert(shouldQueueScheduledCampaign(c,new Date('2026-11-03T12:00:00-03:00')))
   assert(!shouldQueueScheduledCampaign(c,new Date('2026-11-04T12:00:00-03:00')))
   assert(shouldQueueScheduledCampaign(c,new Date('2026-11-05T12:00:00-03:00')))
   assert(!shouldQueueScheduledCampaign({...c,lastCaptureAt:new Date('2026-11-03T08:30:00-03:00')},new Date('2026-11-03T18:30:00-03:00')))
  })
  await check('a completed Order is reused without approval and a new explicit type requeues the same job',async()=>{
   const r=await registerGamOrder(db,draft.orderUrl,async()=>{throw Error('must not dispatch a saved order')},undefined,'GOV_FEDERAL')
   assert.equal(r.status,'JOB_GAM_SAVED');assert(r.existing);assert(!r.triggered)
   const changed=await registerGamOrder(db,draft.orderUrl,async()=>true,undefined,'PRIVADO')
   assert.equal(changed.jobId,r.jobId);assert.equal(changed.status,'JOB_GAM_PENDING')
   assert.equal(JSON.parse((await db.nexusLog.findUnique({where:{id:r.jobId}})).details).requestedCaptureCadence,'DAILY')
  })
  await check('cancelled jobs cannot save campaigns and invalid dates roll back all writes',async()=>{
   const cancelled=await job('PRIVADO','JOB_GAM_CANCELLED')
   await assert.rejects(()=>finalizeAutomaticGamOrder(db,cancelled.id,draft),/CANCELLED/)
   const invalid=await job()
   await assert.rejects(()=>finalizeAutomaticGamOrder(db,invalid.id,{...draft,flightStart:null}),/PERIODO_INVALIDO/)
   assert.equal((await db.nexusLog.findUnique({where:{id:invalid.id}})).level,'JOB_GAM_RUNNING')
   assert.equal(await db.campaign.count({where:{client:prefix}}),1)
  })
  await check('rotated preview tokens update the same creative instead of duplicating its format',async()=>{
   const j=await job('GOV_FEDERAL')
   const changed={...draft,mediaEntries:[{...entry,url:entry.url.replace('google_preview=fixture','google_preview=rotated')}]}
   const r=await finalizeAutomaticGamOrder(db,j.id,changed)
   assert.equal(r.writeResult.created,0);assert.equal(r.writeResult.skipped,1)
   assert.equal(await db.campaign.count({where:{client:prefix}}),1)
   const c=await db.campaign.findFirst({where:{client:prefix}});assert(c.url.includes('google_preview=rotated'));assert.equal(c.captureCadence,'BOUNDARY')
  })
  await check('blocked items retain a partial issue while valid formats are already saved and enabled',async()=>{
   const j=await job();const r=await finalizeAutomaticGamOrder(db,j.id,{...draft,blockedItems:[{sourceLineItemId:'bad',reason:'Missing preview'}]})
   assert.equal(r.level,'JOB_GAM_REVIEW');assert.equal(r.saved,false);assert.equal(r.writeResult.blocked,1)
   assert.equal((await db.campaign.findUnique({where:{id:r.writeResult.campaignIds[0]}})).isScheduled,true)
  })
  await check('automatic import never overrides an intentional campaign pause',async()=>{
   await db.campaign.updateMany({where:{client:prefix},data:{adOpsStatus:'PAUSADA',isScheduled:false}})
   const j=await job();const r=await finalizeAutomaticGamOrder(db,j.id,draft)
   assert.equal(r.saved,false);assert.equal(r.writeResult.blocked,1)
   const c=await db.campaign.findFirst({where:{client:prefix}});assert.equal(c.adOpsStatus,'PAUSADA');assert.equal(c.isScheduled,false)
  })
  console.log(`${checks.length}/${checks.length} GAM autosave PostgreSQL checks passed`)
 }finally{await db.campaign.deleteMany({where:{client:prefix}});await db.nexusLog.deleteMany({where:{id:{in:jobIds}}});await db.$disconnect()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
