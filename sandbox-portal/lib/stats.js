// Aggregates the JSONL logs into the numbers the admin dashboard shows.
import { FILES, readJsonl } from './store.js'

const norm = (e) => String(e || '').trim().toLowerCase()
const day = (iso) => String(iso || '').slice(0, 10)
const secs = (a, b) => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 1000))

export function buildDashboard({ live, examples }) {
  const signups = readJsonl(FILES.signups)
  const visits = readJsonl(FILES.visits)
  const launchLog = readJsonl(FILES.launches)

  // latest presence snapshot per visitor
  const presence = new Map()
  for (const p of readJsonl(FILES.presence)) presence.set(p.vid, p)

  // one row per sandbox: the launch event joined with its teardown (or the live record)
  const byRun = new Map()
  const lastBySlot = new Map()
  for (const ev of launchLog) {
    if (ev.event === 'launch') {
      const r = { runId: ev.runId, slot: ev.id, exampleId: ev.exampleId, name: ev.name, email: norm(ev.email), startedAt: ev.at, state: 'lost' }
      byRun.set(ev.runId || `${ev.id}@${ev.at}`, r)
      lastBySlot.set(ev.id, r)
    } else if (ev.event === 'teardown') {
      const r = (ev.runId && byRun.get(ev.runId)) || lastBySlot.get(ev.id)
      if (!r) continue
      Object.assign(r, { state: ev.reason, endedAt: ev.at, wallSec: ev.wallSec ?? secs(r.startedAt, ev.at), activeSec: ev.activeSec ?? 0, requests: ev.requests ?? 0, opened: !!ev.opened })
    }
  }
  for (const sb of live) {
    const r = byRun.get(sb.runId)
    if (r) Object.assign(r, { state: 'running', wallSec: secs(sb.createdAt, new Date().toISOString()), activeSec: sb.activeBuckets * 30, requests: sb.requests, opened: !!sb.firstHit })
  }
  const runs = [...byRun.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  const title = Object.fromEntries(examples.map((e) => [e.id, e.title]))

  // people
  const people = new Map()
  const person = (email, name) => {
    if (!people.has(email)) people.set(email, { email, name, firstSeen: null, lastSeen: null, vids: new Set(), launches: 0, opened: 0, projects: new Set(), sandboxActiveSec: 0, sandboxWallSec: 0 })
    return people.get(email)
  }
  for (const s of signups) {
    const p = person(norm(s.email), s.name)
    p.name = s.name
    if (!p.firstSeen || s.createdAt < p.firstSeen) p.firstSeen = s.createdAt
    if (!p.lastSeen || s.createdAt > p.lastSeen) p.lastSeen = s.createdAt
    if (s.vid) p.vids.add(s.vid)
  }
  for (const r of runs) {
    const p = person(r.email, r.name)
    p.launches++
    if (r.opened) p.opened++
    p.projects.add(r.exampleId)
    p.sandboxActiveSec += r.activeSec || 0
    p.sandboxWallSec += r.wallSec || 0
    if (!p.lastSeen || r.startedAt > p.lastSeen) p.lastSeen = r.startedAt
  }
  const peopleOut = [...people.values()].map((p) => {
    let siteSec = 0
    for (const v of p.vids) {
      const snap = presence.get(v)
      if (snap) {
        siteSec += snap.activeSec
        if (snap.lastSeen > (p.lastSeen || '')) p.lastSeen = snap.lastSeen
      }
    }
    return { email: p.email, name: p.name, firstSeen: p.firstSeen, lastSeen: p.lastSeen, launches: p.launches, opened: p.opened,
      projects: [...p.projects].map((id) => title[id] || id), siteSec, sandboxActiveSec: p.sandboxActiveSec, sandboxWallSec: p.sandboxWallSec }
  }).sort((a, b) => String(b.lastSeen).localeCompare(String(a.lastSeen)))

  // projects
  const projects = examples.map((e) => {
    const mine = runs.filter((r) => r.exampleId === e.id)
    const done = mine.filter((r) => r.state !== 'running' && r.state !== 'lost')
    return {
      id: e.id, title: e.title, tier: e.difficulty,
      launches: mine.length,
      people: new Set(mine.map((r) => r.email)).size,
      opened: mine.filter((r) => r.opened).length,
      failed: mine.filter((r) => r.state === 'launch_failed').length,
      avgActiveSec: done.length ? Math.round(done.reduce((n, r) => n + (r.activeSec || 0), 0) / done.length) : 0,
    }
  }).sort((a, b) => b.launches - a.launches)

  // per-day series, last 30 days
  const days = []
  for (let i = 29; i >= 0; i--) days.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10))
  const series = days.map((d) => ({
    day: d,
    visitors: new Set(visits.filter((v) => day(v.at) === d).map((v) => v.vid)).size,
    signups: signups.filter((s) => day(s.createdAt) === d).length,
    launches: runs.filter((r) => day(r.startedAt) === d).length,
  }))

  const sources = {}
  for (const v of visits) {
    const k = v.utm_source || (v.ref ? safeHost(v.ref) : 'direct')
    sources[k] = (sources[k] || 0) + 1
  }

  const finished = runs.filter((r) => r.state !== 'running' && r.state !== 'lost')
  const avg = (xs) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0)
  return {
    generatedAt: new Date().toISOString(),
    totals: {
      visitors: new Set(visits.map((v) => v.vid)).size,
      pageViews: visits.length,
      signups: people.size,
      launches: runs.length,
      opened: runs.filter((r) => r.opened).length,
      liveNow: live.length,
      avgActiveSec: avg(finished.map((r) => r.activeSec || 0)),
      avgWallSec: avg(finished.map((r) => r.wallSec || 0)),
    },
    series,
    projects,
    sources: Object.entries(sources).sort((a, b) => b[1] - a[1]).slice(0, 10),
    people: peopleOut,
    runs: runs.slice(0, 200).map((r) => ({ ...r, title: title[r.exampleId] || r.exampleId })),
  }
}

function safeHost(u) {
  try { return new URL(u).hostname } catch { return 'other' }
}

const csvCell = (v) => {
  let s = Array.isArray(v) ? v.join('; ') : String(v ?? '')
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}
export function peopleCsv(d) {
  const head = ['email', 'name', 'first_seen', 'last_seen', 'sandboxes', 'opened', 'projects', 'time_on_site_sec', 'sandbox_active_sec', 'sandbox_wall_sec']
  const rows = d.people.map((p) => [p.email, p.name, p.firstSeen, p.lastSeen, p.launches, p.opened, p.projects, p.siteSec, p.sandboxActiveSec, p.sandboxWallSec])
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n'
}
