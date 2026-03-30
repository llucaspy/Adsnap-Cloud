import fetch from 'node-fetch';

// The session token I just got from test_handshake.ts
const sessionToken = "oCNAMFKI9RSNOk6avp5NemB2ubo9YolX";
const graphqlUrl = `https://graphql.00px.com.br/graphql/?s=${sessionToken}`;

async function testQuery(name: string, query: string) {
    console.log(`--- Testing Query: ${name} ---`);
    try {
        const response = await fetch(graphqlUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });
        
        if (!response.ok) {
            console.log(`HTTP Error: ${response.status} ${response.statusText}`);
            console.log(await response.text());
            return;
        }

        const data = await response.json();
        if (data.errors) {
            console.log(`GraphQL Errors:`, JSON.stringify(data.errors, null, 2));
        } else {
            console.log(`Success! Data received.`);
            // console.log(JSON.stringify(data.data, null, 2).substring(0, 500));
        }
    } catch (err) {
        console.error(`Fetch Error:`, err);
    }
    console.log('---');
}

async function main() {
    const campaignId = 7087;

    // 1. My current query (potentially failing with 400)
    const query1 = `
        query {
          campaign(filter: "{\\\"campaigns.campaign_id\\\":${campaignId}}") {
            sites {
              site_id
              site_name
              purchases {
                cpm {
                  quantity
                  channels {
                    channel_id
                    channel_purchased_quantity
                  }
                }
              }
              data_by_date_purchase(campaign_id: ${campaignId})
            }
          }
        }
    `;
    await testQuery("Current Query", query1);

    // 2. Simplified query (no site_id, no args for data_by_date_purchase)
    const query2 = `
        query {
          campaign(filter: "{\\\"campaigns.campaign_id\\\":${campaignId}}") {
            sites {
              site_name
              purchases {
                cpm {
                  quantity
                }
              }
              data_by_date_purchase
            }
          }
        }
    `;
    await testQuery("Simplified Query", query2);
}

main().catch(console.error);
