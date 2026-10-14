import fs from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const url = new URL(process.env.DATABASE_URL || '')
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/adsnap_worker_test') throw new Error('Only the isolated loopback test database is allowed')
if (process.env.DIRECT_URL !== process.env.DATABASE_URL) throw new Error('DIRECT_URL must reference the same isolated test database')
const directory = path.resolve('.test-infra')
await fs.mkdir(directory, { recursive: true })
const schema = (await fs.readFile('prisma/schema.prisma', 'utf8')).split(/\r?\n/).filter(line => !line.includes('Unsupported("vector')).join('\n')
await fs.writeFile(path.join(directory, 'schema.prisma'), schema)
// pgvector belongs to unrelated AI memory. Queue/campaign/capture tables are unchanged.
const result = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push', '--schema', path.join(directory, 'schema.prisma'), '--skip-generate'], { stdio: 'inherit', env: process.env })
if (result.status !== 0) process.exitCode = result.status || 1
