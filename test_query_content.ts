import fetch from 'node-fetch';

const sessionToken = "oCNAMFKI9RSNOk6avp5NemB2ubo9YolX";
const graphqlUrl = `https://graphql.00px.com.br/graphql/?s=${sessionToken}`;

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
                  channels
                }
              }
              data_by_date_purchase(campaign_id: ${campaignId})
            }
          }
        }
    `;

    const response = await fetch(graphqlUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
    });
    const data = await response.json();
    
    // Log the structure of channels and data_by_date_purchase
    const sites = data.data.campaign.sites;
    if (sites && sites.length > 0) {
        const cpm = sites[0].purchases.cpm;
        console.log('--- Channels Sample ---');
        console.log(JSON.stringify(cpm.channels, null, 2).substring(0, 500));
        console.log('--- Daily Data Sample ---');
        console.log(JSON.stringify(sites[0].data_by_date_purchase, null, 2).substring(0, 500));
    }
}

main().catch(console.error);
