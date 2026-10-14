const diagnosticGithubToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
if (!diagnosticGithubToken) throw new Error('Set GITHUB_TOKEN for this diagnostic');

const https = require('https');

const options = {
  hostname: 'api.github.com',
  path: '/repos/llucaspy/Adsnap-Cloud/actions/runs?per_page=10',
  method: 'GET',
  headers: {
    'Authorization': 'Bearer ' + diagnosticGithubToken,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'Node.js-Agent'
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      if (json.workflow_runs) {
        json.workflow_runs.forEach(run => {
          console.log(`[${run.created_at}] ${run.name}: Status=${run.status}, Conclusion=${run.conclusion}`);
        });
      } else {
        console.log('No runs found or error:', json.message);
      }
    } catch (e) {
      console.log('Error parsing JSON:', e.message);
      console.log('Raw data:', data.substring(0, 100));
    }
  });
});

req.on('error', (e) => {
  console.error('Request error:', e.message);
});

req.end();
