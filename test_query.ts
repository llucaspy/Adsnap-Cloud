import fetch from 'node-fetch';

const sessionToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX25hbWUiOiJBbsO0bmltbyIsInVzZXJfcm9sZSI6IlNJVEUiLCJhY2NvdW50X2lkIjoxNCwiY2FtcGFpZ25faWQiOjcwODcsInNpdGVfaWQiOjM1MDAsInRlYW1faWQiOjI2LCJ1c2VyX2FuYWx5dGljc19hY2Nlc3MiOnRydWUsInVzZXJfYWRtaW5fYWNjZXNzIjpmYWxzZSwidXNlcl9tZWRpYWtpdF9hY2Nlc3MiOmZhbHNlLCJyZWRpcmVjdCI6Imh0dHBzOi8vYW5hbHl0aWNzLnZldHRhLm5ldC5ici9kYXNoYm9hcmQvY2FtcGFpZ24vNzA4Ny9zaXRlLzM1MDAiLCJpYXQiOjE3NzQ1NTgyMjAsImV4cCI6MTc3OTc0MjIyMH0._cddsT08RM-cjkUlrhbGwsVr5wNaxtuEcil7WPodq9E";
const graphqlUrl = `https://graphql.00px.com.br/graphql/?s=${sessionToken}`;

async function testQuery(query: string) {
    console.log(`--- Testing Query ---`);
    console.log(query);
    const response = await fetch(graphqlUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
    });
    const data = await response.json();
    console.log(JSON.stringify(data, null, 2));
    console.log('---');
}

async function main() {
    // 1. Test original filter style
    await testQuery(`
        query {
          campaign(filter: "{\\\"campaigns.campaign_id\\\":7087}") {
            sites {
              site_name
              data_by_date_purchase
            }
          }
        }
    `);

    // 2. Test direct campaign_id argument
    await testQuery(`
        query {
          campaign(campaign_id: 7087) {
            sites {
              site_name
            }
          }
        }
    `);
}

main().catch(console.error);
