import dotenv from 'dotenv';
import path from 'path';

// Load .env.local from the current directory
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: true });

const token = process.env.GITHUB_TOKEN;
let repo = process.env.GITHUB_REPO;

console.log('--- Debugging Nexus Worker Trigger ---');
console.log('GITHUB_TOKEN:', token ? (token.substring(0, 15) + '...') : 'MISSING');
console.log('GITHUB_REPO:', repo || 'MISSING');

if (!token || !repo) {
    console.error('Missing environment variables!');
    process.exit(1);
}

if (repo.includes('github.com/')) {
    repo = repo.split('github.com/')[1].replace(/\/$/, '').replace(/\.git$/, '');
}
console.log('Sanitized repo:', repo);

async function trigger() {
    try {
        const url = `https://api.github.com/repos/${repo}/actions/workflows/nexus-worker.yml/dispatches`;
        console.log('URL:', url);
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
                'User-Agent': 'Adsnap-Nexus-Agent'
            },
            body: JSON.stringify({
                ref: 'main'
            })
        });

        console.log('Status:', response.status);
        console.log('OK:', response.ok);
        
        if (!response.ok) {
            const error = await response.text();
            console.error('Error body:', error);
        } else {
            console.log('Success!');
        }
    } catch (err) {
        console.error('Fetch exception:', err);
    }
}

trigger();
