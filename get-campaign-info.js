const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
    connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    await client.connect();
    try {
        const res = await client.query("SELECT pi FROM \"Campaign\" WHERE id = 'cmlchvw2t0000mqnaau2u4cg4'");
        console.log('Campaign PI:', res.rows[0]?.pi);

        const res2 = await client.query("SELECT \"screenshotPath\" FROM \"Capture\" WHERE \"campaignId\" = 'cmlchvw2t0000mqnaau2u4cg4' ORDER BY \"createdAt\" DESC LIMIT 1");
        console.log('Latest Capture Path:', res2.rows[0]?.screenshotPath);
    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}

run();
