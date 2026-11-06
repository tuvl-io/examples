// Aggregates the JSONL logs into the numbers the admin dashboard shows.
import crypto from 'node:crypto'
import { FILES, readJsonl } from './store.js'
import { displayId, countryOf, seriesOf, arrivalOf } from './visitor.js'

const norm = (e) => String(e || '').trim().toLowerCase()
// Older rows predate visitor ids: derive a stable one from the email so every row has an id and the same person keeps the same id.
const legacyId = (email) => crypto.createHash('sha256').update(`legacy:${email}`).digest('base64url').slice(0, 16)
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
      const r = { runId: ev.runId, slot: ev.id, exampleId: ev.exampleId, vid: ev.vid, name: ev.name, email: norm(ev.email), startedAt: ev.at, state: 'lost' }
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
  const emailVid = new Map()
  for (const s of signups) if (s.vid && s.email && !emailVid.has(norm(s.email))) emailVid.set(norm(s.email), s.vid)
  const idFor = (vid, email) => vid || emailVid.get(email) || (email ? legacyId(email) : 'unknown')
  for (const r of byRun.values()) r.vid = idFor(r.vid, r.email)
  const runs = [...byRun.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  const title = Object.fromEntries(examples.map((e) => [e.id, e.title]))

  // people: one row per visitor id (legacy rows without one fall back to the email)
  const people = new Map()
  const keyOf = (vid, email) => idFor(vid, email)
  const person = (key, vid) => {
    if (!people.has(key)) people.set(key, { key, vid: vid || '', name: '', email: '', firstSeen: null, lastSeen: null, launches: 0, opened: 0, projects: new Set(), sandboxActiveSec: 0, sandboxWallSec: 0 })
    return people.get(key)
  }
  const seen = (p, at) => {
    if (!at) return
    if (!p.firstSeen || at < p.firstSeen) p.firstSeen = at
    if (!p.lastSeen || at > p.lastSeen) p.lastSeen = at
  }
  for (const s of signups) {
    const p = person(keyOf(s.vid, norm(s.email)), keyOf(s.vid, norm(s.email)))
    if (s.name) p.name = s.name
    if (s.email) p.email = norm(s.email)
    seen(p, s.createdAt)
  }
  for (const r of runs) {
    const p = person(r.vid, r.vid)
    if (!p.name && r.name) p.name = r.name
    if (!p.email && r.email) p.email = r.email
    p.launches++
    if (r.opened) p.opened++
    p.projects.add(r.exampleId)
    p.sandboxActiveSec += r.activeSec || 0
    p.sandboxWallSec += r.wallSec || 0
    seen(p, r.startedAt)
  }
  const peopleOut = [...people.values()].map((p) => {
    const snap = p.vid ? presence.get(p.vid) : null
    if (snap) seen(p, snap.lastSeen)
    return { visitorId: displayId(p.vid), country: countryOf(p.vid), series: seriesOf(p.vid), arrival: arrivalOf(displayId(p.vid)), name: p.name, email: p.email, emailCheck: p.email ? emailCheck(p.email) : '',
      firstSeen: p.firstSeen, lastSeen: p.lastSeen, launches: p.launches, opened: p.opened,
      projects: [...p.projects].map((id) => title[id] || id), siteSec: snap ? snap.activeSec : 0, sandboxActiveSec: p.sandboxActiveSec, sandboxWallSec: p.sandboxWallSec }
  }).sort((a, b) => String(b.lastSeen).localeCompare(String(a.lastSeen)))
  const withEmail = peopleOut.filter((p) => p.email)

  // projects
  const projects = examples.map((e) => {
    const mine = runs.filter((r) => r.exampleId === e.id)
    const done = mine.filter((r) => r.state !== 'running' && r.state !== 'lost')
    return {
      id: e.id, title: e.title, tier: e.difficulty,
      launches: mine.length,
      people: new Set(mine.map((r) => r.vid)).size,
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
    started: signups.filter((s) => day(s.createdAt) === d).length,
    launches: runs.filter((r) => day(r.startedAt) === d).length,
  }))

  const byCountry = new Map()
  const bump = (code, k, id) => {
    const c = byCountry.get(code) || { code, visitors: new Set(), started: new Set(), launchers: new Set() }
    c[k].add(id); byCountry.set(code, c)
  }
  for (const v of visits) bump(countryOf(v.vid), 'visitors', v.vid)
  for (const p of peopleOut) {
    bump(p.country, 'visitors', p.visitorId)
    bump(p.country, 'started', p.visitorId)
    if (p.launches) bump(p.country, 'launchers', p.visitorId)
  }
  const countries = [...byCountry.values()].map((c) => ({ code: c.code, visitors: c.visitors.size, started: c.started.size, launchers: c.launchers.size }))
    .sort((a, b) => b.visitors - a.visitors)

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
      started: peopleOut.length,
      launchers: peopleOut.filter((p) => p.launches).length,
      openers: peopleOut.filter((p) => p.opened).length,
      withEmail: withEmail.length,
      suspectEmails: withEmail.filter((p) => p.emailCheck).length,
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
    runs: runs.slice(0, 200).map((r) => ({ ...r, visitorId: displayId(r.vid), title: title[r.exampleId] || r.exampleId })),
    countries,
  }
}

function safeHost(u) {
  try { return new URL(u).hostname } catch { return 'other' }
}

const DISPOSABLE = new Set(['mailinator.com', 'guerrillamail.com', 'yopmail.com', '10minutemail.com', 'tempmail.com', 'temp-mail.org', 'trashmail.com', 'sharklasers.com', 'getnada.com', 'dispostable.com', 'maildrop.cc', 'example.com', 'example.org', 'test.com', 'abc.com', 'xyz.com', 'asd.com', 'email.com', 'domain.com'])
const JUNK_LOCAL = new Set(['test', 'tester', 'testing', 'asdf', 'asd', 'qwerty', 'abc', 'abcd', 'aaa', 'xxx', 'xyz', 'demo', 'fake', 'none', 'na', 'no', 'nil', 'a', 'x', 'user', 'admin', 'name', 'email', 'mail', 'hello', 'hi', '123'])
// Cheap look-over of a typed address; the reason is shown on the dashboard so you can judge it.
export function emailCheck(email) {
  const [local = '', domain = ''] = String(email).toLowerCase().split('@')
  if (DISPOSABLE.has(domain)) return 'throwaway or placeholder domain'
  if (JUNK_LOCAL.has(local) || /^(.)\1+$/.test(local) || /^\d+$/.test(local)) return 'placeholder name before the @'
  if (domain.split('.')[0].length < 2) return 'domain looks too short'
  return ''
}

const csvCell = (v) => {
  let s = Array.isArray(v) ? v.join('; ') : String(v ?? '')
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}
export function peopleCsv(d) {
  const head = ['visitor_id', 'country', 'series', 'arrival_no', 'email', 'email_check', 'name', 'first_seen', 'last_seen', 'sandboxes', 'opened', 'projects', 'time_on_site_sec', 'sandbox_active_sec', 'sandbox_wall_sec']
  const rows = d.people.map((p) => [p.visitorId, p.country, p.series, p.arrival, p.email, p.emailCheck, p.name, p.firstSeen, p.lastSeen, p.launches, p.opened, p.projects, p.siteSec, p.sandboxActiveSec, p.sandboxWallSec])
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n'
}
