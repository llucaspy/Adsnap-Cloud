import fetch from 'node-fetch';

// The full URL provided by the user
const authUrl = "https://graphql.00px.com.br/auth/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX25hbWUiOiJBbsO0bmltbyIsInVzZXJfcm9sZSI6IlNJVEUiLCJhY2NvdW50X2lkIjoxNCwiY2FtcGFpZ25faWQiOjcwODcsInNpdGVfaWQiOjM1MDAsInRlYW1faWQiOjI2LCJ1c2VyX2FuYWx5dGljc19hY2Nlc3MiOnRydWUsInVzZXJfYWRtaW5fYWNjZXNzIjpmYWxzZSwidXNlcl9tZWRpYWtpdF9hY2Nlc3MiOmZhbHNlLCJyZWRpcmVjdCI6Imh0dHBzOi8vYW5hbHl0aWNzLnZldHRhLm5ldC5ici9kYXNoYm9hcmQvY2FtcGFpZ24vNzA4Ny9zaXRlLzM1MDAiLCJpYXQiOjE3NzQ1NTgyMjAsImV4cCI6MTc3OTc0MjIyMH0._cddsT08RM-cjkUlrhbGwsVr5wNaxtuEcil7WPodq9E";

// Extract the JWT part
const jwt = authUrl.split('/auth/')[1]?.split('?')[0];

async function testWithToken(token: string) {
    const graphqlUrl = `https://graphql.00px.com.br/graphql/?s=${token}`;
    const query = `
        query {
          campaign(filter: "{\\\"campaigns.campaign_id\\\":7087}") {
            sites {
              site_name
              purchases {
                cpm {
                  quantity
                }
              }
            }
          }
        }
    `;

    console.log(`--- Testing with Token: ${token.substring(0, 20)}... ---`);
    const response = await fetch(graphqlUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
    });
    const data = await response.json();
    console.log(JSON.stringify(data, null, 2));
}

async function main() {
    if (jwt) {
        await testWithToken(jwt);
    } else {
        console.log("Could not extract JWT from URL");
    }
}

main().catch(console.error);
