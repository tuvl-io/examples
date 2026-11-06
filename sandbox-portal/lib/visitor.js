// Visitor ids look like IN-7K3-9QX: two letters for the country the visitor first came from
// (XX when unknown), then two groups of three characters, all capitals and digits.
// The country is looked up from the request IP with a local database; the IP itself is never stored.
import crypto from 'node:crypto'
import fs from 'node:fs'
import { Reader } from 'mmdb-lib'

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // no I, L, O, 0 or 1, which are easy to misread
export const ID_RE = /^[A-Z]{2}-[A-Z0-9]{3}-[A-Z0-9]{3}$/

const pick = (n) => Array.from({ length: n }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('')
export const newVisitorId = (country) => `${/^[A-Z]{2}$/.test(country || '') ? country : 'XX'}-${pick(3)}-${pick(3)}`

// Ids issued before this format (random strings, or derived from an email) get a stable id of the same shape.
export function displayId(vid) {
  if (ID_RE.test(vid || '')) return vid
  const h = crypto.createHash('sha256').update(`vid:${vid}`).digest()
  const c = (i) => ALPHABET[h[i] % ALPHABET.length]
  return `XX-${c(0)}${c(1)}${c(2)}-${c(3)}${c(4)}${c(5)}`
}
export const countryOf = (id) => displayId(id).slice(0, 2)

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
