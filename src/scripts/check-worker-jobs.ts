const https = require('https');

const options = {
  hostname: 'api.github.com',
  path: '/repos/llucaspy/Adsnap-Cloud/actions/runs?per_page=10',
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
      const workerRun = json.workflow_runs.find(r => r.name === 'Nexus Engine Worker');
      if (workerRun) {
        console.log(`Checking jobs for Worker run ${workerRun.id} created at ${workerRun.created_at}...`);
        const jobOptions = { ...options, path: `/repos/llucaspy/Adsnap-Cloud/actions/runs/${workerRun.id}/jobs` };
        const jobReq = https.request(jobOptions, (jobRes) => {
          let jobData = '';
          jobRes.on('data', (chunk) => { jobData += chunk; });
          jobRes.on('end', () => {
            const jobJson = JSON.parse(jobData);
            jobJson.jobs.forEach(job => {
              console.log(`Job: ${job.name}, Status: ${job.status}, Conclusion: ${job.conclusion}`);
              job.steps.forEach(step => {
                const conclusion = step.conclusion || 'N/A';
                console.log(`  Step: ${step.name}, Conclusion: ${conclusion}`);
              });
            });
          });
        });
        jobReq.end();
      }
    } catch (e) { console.log('Error:', e.message); }
  });
});
req.end();
