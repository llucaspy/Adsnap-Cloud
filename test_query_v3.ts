import fetch from 'node-fetch';

const sessionToken = "oCNAMFKI9RSNOk6avp5NemB2ubo9YolX";
const graphqlUrl = `https://graphql.00px.com.br/graphql/?s=${sessionToken}`;

async function testQuery(name: string, query: string) {
    console.log(`--- Testing Query: ${name} ---`);
    const response = await fetch(graphqlUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
    });
    const data = await response.json();
    if (data.errors) {
        console.log(`GraphQL Errors:`, JSON.stringify(data.errors, null, 2));
    } else {
        console.log(`Success! Site names:`, data.data.campaign.sites.map((s: any) => s.site_name));
        // Check if channels and data_by_date_purchase are strings
        const firstSite = data.data.campaign.sites[0];
        if (firstSite) {
            console.log('Channels type:', typeof firstSite.purchases.cpm.channels);
            console.log('DailyData type:', typeof firstSite.data_by_date_purchase);
        }
    }
    console.log('---');
}

async function main() {
    const campaignId = 7087;

    const query = `
        query {
          campaign(filter: "{\\\"campaigns.campaign_id\\\":${campaignId}}") {
            sites {
              site_id
              site_name
              purchases {
                cpm {
                  quantity
                  total_data {
                    impressions
                    valids
                    viewability
                  }
                  channels
                }
              }
              data_by_date_purchase(campaign_id: ${campaignId})
            }
          }
        }
    `;
    await testQuery("Fixed Scalars Query", query);
}

main().catch(console.error);
