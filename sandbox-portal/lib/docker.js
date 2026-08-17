// Docker orchestration for on-demand sandboxes. One shared pgvector Postgres
// serves every sandbox via a per-sandbox database (created on launch, dropped on
// teardown); each launch also starts one example app container on a shared docker
// network, reachable by the proxy as http://sb-<id>:8000.
import Docker from 'dockerode'

const docker = new Docker()

const NETWORK = process.env.SANDBOX_NETWORK || 'tuvl-sandbox-net'
const SHARED_PG = process.env.SHARED_PG || 'tuvl-sandbox-pg'
const PG_USER = process.env.PG_USER || 'tuvl'
const MEM_LIMIT = Number(process.env.SANDBOX_MEM_MB || 512) * 1024 * 1024
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ''
const GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || ''

export const containerName = (id) => `sb-${id}`
export const upstreamHost = (id) => `${containerName(id)}:8000`

// Run a psql command inside the shared Postgres container; resolves with stdout,
// rejects on non-empty stderr containing ERROR.
async function psql(sql) {
  const c = docker.getContainer(SHARED_PG)
  const exec = await c.exec({
    Cmd: ['psql', '-U', PG_USER, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', sql],
    AttachStdout: true,
    AttachStderr: true,
  })
  const stream = await exec.start({ hijack: true, Tty: false })
  const chunks = []
  await new Promise((resolve, reject) => {
    stream.on('data', (d) => chunks.push(d))
    stream.on('end', resolve)
    stream.on('error', reject)
  })
  const out = Buffer.concat(chunks).toString('utf8')
  const info = await exec.inspect()
  if (info.ExitCode !== 0) throw new Error(`psql failed (${info.ExitCode}): ${out}`)
  return out
}

export async function createDb(dbName) {
  await psql(`CREATE DATABASE "${dbName}"`)
}

export async function dropDb(dbName) {
  try {
    await psql(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${dbName}'`,
    )
  } catch {
    /* best effort */
  }
  try {
    await psql(`DROP DATABASE IF EXISTS "${dbName}"`)
  } catch {
    /* best effort */
  }
}

export async function runSandbox({ id, image, dbName }) {
  const container = await docker.createContainer({
    name: containerName(id),
    Image: image,
    Env: [
      `POSTGRES_HOST=${SHARED_PG}`,
      'POSTGRES_PORT=5432',
      `POSTGRES_DB=${dbName}`,
      `POSTGRES_USER=${PG_USER}`,
      'POSTGRES_PASSWORD=tuvl',
      `GEMINI_API_KEY=${GEMINI_API_KEY}`,
      `GOOGLE_CLOUD_PROJECT=${GOOGLE_CLOUD_PROJECT}`,
    ],
    Labels: { 'tuvl.sandbox': '1', 'tuvl.sandbox.id': id },
    HostConfig: {
      NetworkMode: NETWORK,
      Memory: MEM_LIMIT,
      RestartPolicy: { Name: 'no' },
    },
  })
  await container.start()
  return container
}

export async function killSandbox(id) {
  try {
    const c = docker.getContainer(containerName(id))
    await c.remove({ force: true })
  } catch {
    /* already gone */
  }
}

// On boot, reap any orphan sandbox containers left from a previous run.
export async function reapOrphans() {
  const list = await docker.listContainers({
    all: true,
    filters: { label: ['tuvl.sandbox=1'] },
  })
  await Promise.all(
    list.map((c) => docker.getContainer(c.Id).remove({ force: true }).catch(() => {})),
  )
  return list.length
}

// Wait until the sandbox's HTTP server answers (poll its /insight/ via the net).
export async function waitReady(id, timeoutMs = 45000) {
  const url = `http://${upstreamHost(id)}/insight/`
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { redirect: 'manual' })
      if (res.status > 0 && res.status < 500) return true
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  return false
}
