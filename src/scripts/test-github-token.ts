import 'dotenv/config'

async function testToken() {
    const token = process.env.GITHUB_TOKEN
    const repo = 'llucaspy/Adsnap-Cloud'

    if (!token) {
        console.error('No GITHUB_TOKEN found in environment')
        return
    }

    console.log('Testing token starting with:', token.substring(0, 10), '...')

    try {
        const response = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/nexus-worker.yml`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28'
            }
        })

        console.log('Status Check:', response.status)
        const data = await response.json()

        if (!response.ok) {
            console.error('Error Details:', JSON.stringify(data, null, 2))
            console.log('Headers:', {
                'x-oauth-scopes': response.headers.get('x-oauth-scopes'),
                'x-accepted-oauth-scopes': response.headers.get('x-accepted-oauth-scopes'),
                'x-github-request-id': response.headers.get('x-github-request-id')
            })
        } else {
            console.log('Token has access to view the workflow!')

            // Try to test dispatch permission (dry run isn't possible, so this might trigger one if it works)
            console.log('Testing trigger permission...')
            const dispatchResponse = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/nexus-worker.yml/dispatches`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28'
                },
                body: JSON.stringify({ ref: 'main' })
            })

            console.log('Dispatch Status:', dispatchResponse.status)
            if (!dispatchResponse.ok) {
                const dispatchData = await dispatchResponse.json()
                console.error('Dispatch Error:', JSON.stringify(dispatchData, null, 2))
            } else {
                console.log('SUCCESS! Token has permissions to trigger workfows.')
            }
        }
    } catch (err) {
        console.error('Request failed:', err)
    }
}

testToken()
