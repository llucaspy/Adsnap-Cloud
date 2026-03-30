import fetch from 'node-fetch';

const authUrl = "https://graphql.00px.com.br/auth/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX25hbWUiOiJBbsO0bmltbyIsInVzZXJfcm9sZSI6IlNJVEUiLCJhY2NvdW50X2lkIjoxNCwiY2FtcGFpZ25faWQiOjcwODcsInNpdGVfaWQiOjM1MDAsInRlYW1faWQiOjI2LCJ1c2VyX2FuYWx5dGljc19hY2Nlc3MiOnRydWUsInVzZXJfYWRtaW5fYWNjZXNzIjpmYWxzZSwidXNlcl9tZWRpYWtpdF9hY2Nlc3MiOmZhbHNlLCJyZWRpcmVjdCI6Imh0dHBzOi8vYW5hbHl0aWNzLnZldHRhLm5ldC5ici9kYXNoYm9hcmQvY2FtcGFpZ24vNzA4Ny9zaXRlLzM1MDAiLCJpYXQiOjE3NzQ1NTgyMjAsImV4cCI6MTc3OTc0MjIyMH0._cddsT08RM-cjkUlrhbGwsVr5wNaxtuEcil7WPodq9E";

async function testHandshake() {
    console.log(`--- Testing Handshake ---`);
    console.log(`Auth URL: ${authUrl.substring(0, 50)}...`);

    const response = await fetch(authUrl, {
        method: 'GET',
        redirect: 'follow', // Follow redirects to see where we end up
    });

    console.log(`Final URL: ${response.url}`);
    console.log(`Status: ${response.status}`);
    
    const urlObj = new URL(response.url);
    const s = urlObj.searchParams.get('s');
    console.log(`Extracted 's': ${s ? s.substring(0, 10) + '...' : 'NONE'}`);

    if (!s) {
        console.log(`Checking headers (set-cookie):`);
        console.log(response.headers.get('set-cookie'));
    }
}

testHandshake().catch(console.error);
