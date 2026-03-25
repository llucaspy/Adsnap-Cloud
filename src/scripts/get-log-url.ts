const https = require('https');

const options = {
  hostname: 'api.github.com',
  path: '/repos/llucaspy/Adsnap-Cloud/actions/runs?per_page=1',
  method: 'GET',
  headers: {
    'Authorization': 'Bearer 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',
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
      const run = json.workflow_runs[0];
      if (run) {
        console.log(`Getting logs for run ${run.id}...`);
        const logOptions = { ...options, path: `/repos/llucaspy/Adsnap-Cloud/actions/runs/${run.id}/logs` };
        const logReq = https.request(logOptions, (logRes) => {
          // GitHub logs API returns a 302 redirect
          if (logRes.statusCode === 302) {
             console.log('Log Download URL:', logRes.headers.location);
          } else {
             console.log('Failed to get logs. Status:', logRes.statusCode);
          }
        });
        logReq.end();
      }
    } catch (e) { console.log('Error:', e.message); }
  });
});
req.end();
