// Housekeeping: rewrite every data/*.json with a consistent key order and no
// transient (_-prefixed) keys. Safe to run anytime. Usage: node scripts/normalize-data.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA = path.resolve(__dirname, '..', 'data')

const NODE_KEYS = ['id', 'title', 'status', 'priority', 'tags', 'due', 'notes', 'link', 'side', 'requires', 'children']
const TRACK_KEYS = ['id', 'title', 'order', 'accent', 'info', 'nodes']

function clean(obj, order) {
  const out = {}
  for (const k of order) {
    if (obj[k] === undefined) continue
    if (k === 'children') out[k] = (obj[k] || []).map((c) => clean(c, NODE_KEYS))
    else if (k === 'nodes') out[k] = (obj[k] || []).map((n) => clean(n, NODE_KEYS))
    else out[k] = obj[k]
  }
  // carry over any unexpected non-transient keys (future-proofing) at the end
  for (const k of Object.keys(obj)) {
    if (!order.includes(k) && !k.startsWith('_')) out[k] = obj[k]
  }
  return out
}

let changed = 0
for (const file of fs.readdirSync(DATA).filter((f) => f.endsWith('.json'))) {
  const p = path.join(DATA, file)
  const before = fs.readFileSync(p, 'utf8')
  const track = JSON.parse(before)
  const after = JSON.stringify(clean(track, TRACK_KEYS), null, 2) + '\n'
  if (after !== before) {
    fs.writeFileSync(p, after)
    changed++
    console.log('normalized', file)
  }
}
console.log(changed ? `done (${changed} changed)` : 'all files already normalized')
