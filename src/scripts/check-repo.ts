const https = require('https');

const options = {
  hostname: 'api.github.com',
  path: '/repos/llucaspy/Adsnap-Cloud/actions/workflows/nexus-worker.yml',
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
      console.log('Workflow Name:', json.name);
      console.log('State:', json.state); // result is 'active' or 'disabled_manually' etc.
      
      const repoOptions = { ...options, path: '/repos/llucaspy/Adsnap-Cloud' };
      const repoReq = https.request(repoOptions, (repoRes) => {
         let repoData = '';
         repoRes.on('data', (chunk) => { repoData += chunk; });
         repoRes.on('end', () => {
             const repoJson = JSON.parse(repoData);
             console.log('Repo Private:', repoJson.private);
             console.log('Repo Archived:', repoJson.archived);
             console.log('Repo Visibility:', repoJson.visibility);
         });
      });
      repoReq.end();

    } catch (e) { console.log('Error:', e.message); }
  });
});
req.end();
