// Visitor ids look like IN-KAB-0042:
//   IN    country the visitor first came from (XX when unknown), from the request IP and a local database
//   KAB   the series: three letters that encode, with SERIES_KEY, the year and month the series started
//         and which series of that month it is. A new series starts for a country once 10,000 ids are used.
//   0042  number within the series, 0000 to 9999. Arrivals are numbered in order, but the number shown is
//         scrambled with SERIES_KEY (a keyed permutation, so no two ids collide), so ids do not reveal volume or order.
// Ids are sequential, so the cookie and the copy kept in the browser carry a signature; an id typed in by hand is ignored.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { Reader } from 'mmdb-lib'
import { DATA_DIR } from './store.js'

export const ID_RE = /^[A-Z]{2}-[A-Z0-9]{3}-\d{4}$/
const SECRET = process.env.VISITOR_SECRET || process.env.ADMIN_SESSION_SECRET || crypto.randomBytes(32).toString('hex')
const SERIES_KEY = process.env.SERIES_KEY || 'tuvl'
const BASE_YEAR = 2026

// ── series code: three shuffled alphabets keyed by SERIES_KEY, so the code is not readable as a date ──
const LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ'
const BATCH = '123456789ABCDEFGHJKMNPQRSTUVWXYZ'
function shuffled(alphabet, label) {
  const a = [...alphabet]
  let stream = Buffer.alloc(0)
  let counter = 0
  const byte = () => {
    if (!stream.length) stream = crypto.createHmac('sha256', SERIES_KEY).update(`${label}:${counter++}`).digest()
    const b = stream[0]
    stream = stream.subarray(1)
    return b
  }
  for (let i = a.length - 1; i > 0; i--) {
    const j = byte() % (i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
const YEARS = shuffled(LETTERS, 'year')
const MONTHS = shuffled(LETTERS, 'month')
const BATCHES = shuffled(BATCH, 'batch')

export const seriesCode = (year, month, batch) => `${YEARS[year - BASE_YEAR]}${MONTHS[month - 1]}${BATCHES[batch - 1]}`
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function decodeSeries(code) {
  const y = YEARS.indexOf(code[0]), m = MONTHS.indexOf(code[1]), b = BATCHES.indexOf(code[2])
  if (y < 0 || m < 0 || m > 11 || b < 0) return ''
  return `${MONTH_NAMES[m]} ${BASE_YEAR + y} · series ${b + 1}`
}

// ── counters, one per country, kept in DATA_DIR so restarts never reuse a number ──
const COUNTERS = path.join(DATA_DIR, 'counters.json')
let counters = {}
try { counters = JSON.parse(fs.readFileSync(COUNTERS, 'utf8')) } catch { counters = {} }
function saveCounters() {
  fs.writeFileSync(`${COUNTERS}.tmp`, JSON.stringify(counters))
  fs.renameSync(`${COUNTERS}.tmp`, COUNTERS)
}
// Keyed permutation of 0000..9999 (four Feistel rounds on two digits at a time).
const round = (key, half, i) => crypto.createHmac('sha256', SERIES_KEY).update(`${key}:${i}:${half}`).digest()[0] % 100
function scramble(n, key) {
  let l = Math.floor(n / 100), r = n % 100
  for (let i = 0; i < 4; i++) [l, r] = [r, (l + round(key, r, i)) % 100]
  return l * 100 + r
}
function unscramble(v, key) {
  let l = Math.floor(v / 100), r = v % 100
  for (let i = 3; i >= 0; i--) [l, r] = [(r - round(key, l, i) + 100) % 100, l]
  return l * 100 + r
}

export function newVisitorId(country, now = new Date()) {
  const cc = /^[A-Z]{2}$/.test(country || '') ? country : 'XX'
  const y = now.getUTCFullYear(), m = now.getUTCMonth() + 1
  let c = counters[cc]
  if (!c) c = counters[cc] = { y, m, b: 1, n: -1, legacy: 0 }
  // ids handed out before scrambling were plain sequence numbers 0..legacy-1; never hand those values out again
  if (c.legacy === undefined) c.legacy = c.n + 1
  let value
  do {
    c.n += 1
    if (c.n > 9999) {
      c.b = c.y === y && c.m === m ? c.b + 1 : 1
      c.y = y
      c.m = m
      c.n = 0
      c.legacy = 0
    }
    value = scramble(c.n, `${cc}:${seriesCode(c.y, c.m, c.b)}`)
  } while (value < c.legacy)
  saveCounters()
  return `${cc}-${seriesCode(c.y, c.m, c.b)}-${String(value).padStart(4, '0')}`
}

// The real arrival number (1 = first visitor from that country in that series), for the dashboard.
export function arrivalOf(id) {
  if (!ID_RE.test(id || '')) return ''
  const cc = id.slice(0, 2), code = id.slice(3, 6), value = Number(id.slice(7))
  const c = counters[cc]
  const cur = c && seriesCode(c.y, c.m, c.b) === code
  if (cur && value < (c.legacy ?? c.n + 1)) return value + 1
  return unscramble(value, `${cc}:${code}`) + 1
}

// ── signed tokens for the cookie and the browser copy ──
const sig = (id) => crypto.createHmac('sha256', SECRET).update(`vid:${id}`).digest('base64url').slice(0, 16)
export const signId = (id) => `${id}.${sig(id)}`
export function idFromToken(token) {
  const [id, s] = String(token || '').split('.')
  if (!ID_RE.test(id || '') || !s || s.length !== 16) return null
  return crypto.timingSafeEqual(Buffer.from(s), Buffer.from(sig(id))) ? id : null
}

// Anything that is not in the current shape (older random ids, ids derived from an email) gets a stable id of the same shape.
export function displayId(vid) {
  if (ID_RE.test(vid || '')) return vid
  const h = crypto.createHash('sha256').update(`vid:${vid}`).digest()
  return `XX-${[0, 1, 2].map((i) => LETTERS[h[i] % LETTERS.length]).join('')}-${String(((h[3] << 8) | h[4]) % 10000).padStart(4, '0')}`
}
export const countryOf = (id) => displayId(id).slice(0, 2)
export const seriesOf = (id) => decodeSeries(displayId(id).slice(3, 6))

// ── country from the request IP ──
let reader = null
try {
  reader = new Reader(fs.readFileSync(process.env.GEO_DB || './geo/country.mmdb'))
} catch {
  console.warn('country database not found: visitor ids will start with XX')
}
export function lookupCountry(ip) {
  if (!reader || !ip) return null
  try {
    const code = reader.get(String(ip).replace(/^::ffff:/, ''))?.country?.iso_code
    return /^[A-Z]{2}$/.test(code || '') ? code : null
  } catch { return null }
}
