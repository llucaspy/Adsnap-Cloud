import '../lib/env'
import { processCampaign } from '../lib/captureService'

async function testSingle() {
    const campaignId = 'cmlchvw2t0000mqnaau2u4cg4'; // ID from previous diagnostic
    console.log(`--- Testing Capture for Campaign: ${campaignId} ---`);

    try {
        const result = await processCampaign(campaignId);
        console.log('Final Result:', JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('Fatal Error during test:', error);
    }
}

testSingle();
