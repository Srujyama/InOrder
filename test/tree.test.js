// Headless logic tests — run with `npm test` (vite-node; no framework needed).
// Covers the pure tree helpers and the layout engine's no-overlap guarantee
// across every real track in data/, in both orientations.
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  buildCompletion, buildUnlocked, buildLocked, buildSubtreeMeta,
  countTasks, walk, PRIORITY_RANK,
} from '../src/tree.js'
import { layout } from '../src/RoadmapTree.jsx'

const here = dirname(fileURLToPath(import.meta.url))
let passed = 0
let failed = 0
function check(name, cond) {
  if (cond) { passed++; console.log(`  ok  ${name}`) }
  else { failed++; console.error(`FAIL  ${name}`) }
}

// ---- fixture: branch with a requires-chain + an independent sibling ----
const fixture = [
  {
    id: 'fund', title: 'Fundamentals', status: 'todo', children: [
      { id: 'vars', title: 'Variables', status: 'todo', priority: 'p0', children: [] },
      { id: 'ops', title: 'Operators', status: 'todo', requires: ['vars'], children: [] },
      { id: 'cond', title: 'Conditionals', status: 'todo', requires: ['ops'], children: [] },
    ],
  },
  {
    id: 'ds', title: 'Data Structures', status: 'todo', requires: ['fund'], children: [
      { id: 'lists', title: 'Lists', status: 'todo', children: [] },
    ],
  },
  { id: 'free', title: 'Free floater', status: 'todo', children: [] },
]

// ---- buildCompletion ----
{
  const c = buildCompletion(fixture)
  check('completion: nothing done initially', ![...c.values()].some(Boolean))

  const done = JSON.parse(JSON.stringify(fixture))
  done[0].children.forEach((n) => (n.status = 'done'))
  const c2 = buildCompletion(done)
  check('completion: branch complete when all leaves done', c2.get('fund') === true)
  check('completion: leaf done', c2.get('vars') === true)
  check('completion: unrelated branch still incomplete', c2.get('ds') === false)
}

// ---- buildUnlocked / buildLocked ----
{
  const c = buildCompletion(fixture)
  const u = buildUnlocked(fixture, c)
  const l = buildLocked(fixture, c)
  check('unlocked: no-req leaves start unlocked', u.has('vars') && u.has('free'))
  check('unlocked: requires-gated leaf starts locked', !u.has('ops') && l.has('ops'))
  check('locked: children inherit an ancestor lock', l.has('lists'))
  check('locked: branch with unmet requires is locked', l.has('ds'))
  check('unlocked: branches are never in the unlocked (leaf) set', !u.has('fund'))

  // complete vars -> ops unlocks, cond still locked
  const step = JSON.parse(JSON.stringify(fixture))
  step[0].children[0].status = 'done'
  const c2 = buildCompletion(step)
  const u2 = buildUnlocked(step, c2)
  const l2 = buildLocked(step, c2)
  check('unlock cascade: ops unlocks once vars done', u2.has('ops') && !l2.has('ops'))
  check('unlock cascade: cond stays locked behind ops', l2.has('cond'))
  check('locked: done nodes are never locked', !l2.has('vars'))
}

// ---- buildSubtreeMeta ----
{
  const c = buildCompletion(fixture)
  const u = buildUnlocked(fixture, c)
  const meta = buildSubtreeMeta(fixture, u)
  check('meta: branch totals count its leaves', meta.get('fund').total === 3)
  check('meta: leaf counts itself', meta.get('vars').total === 1)
  check('meta: firstUnlockedId is first in walk order', meta.get('fund').firstUnlockedId === 'vars')
  check('meta: locked subtree has no firstUnlockedId', meta.get('ds').firstUnlockedId === null)

  const track = { nodes: fixture }
  const { total } = countTasks(track)
  const rootTotal = fixture.reduce((s, n) => s + meta.get(n.id).total, 0)
  check('meta: totals agree with countTasks', rootTotal === total)
}

// ---- next-target ranking (mirrors RoadmapTree.nextOrder) ----
{
  const rank = (arr) =>
    arr
      .map((n, i) => ({ id: n.id, pri: PRIORITY_RANK[n.priority] ?? 4, due: n.due || '￿', ord: i }))
      .sort((a, b) => a.pri - b.pri || (a.due < b.due ? -1 : a.due > b.due ? 1 : 0) || a.ord - b.ord)
      .map((a) => a.id)
  check('ranking: priority beats due date', rank([
    { id: 'a', priority: 'p2', due: '2026-01-01' },
    { id: 'b', priority: 'p0', due: '2026-12-31' },
  ])[0] === 'b')
  check('ranking: due breaks priority ties', rank([
    { id: 'a', priority: 'p1', due: '2026-09-01' },
    { id: 'b', priority: 'p1', due: '2026-08-01' },
  ])[0] === 'b')
  check('ranking: empty due sorts last', rank([
    { id: 'a', priority: 'p1' },
    { id: 'b', priority: 'p1', due: '2026-08-01' },
  ])[0] === 'b')
  check('ranking: document order is the final tiebreak', rank([
    { id: 'a', priority: 'p1' },
    { id: 'b', priority: 'p1' },
  ])[0] === 'a')
}

// ---- layout: zero card overlaps on every real track, both orientations ----
{
  const CARD_W = 280
  const overlaps = (a, b) =>
    a.x < b.x + CARD_W && b.x < a.x + CARD_W && a.y < b.y + b.ownH && b.y < a.y + a.ownH
  const dataDir = join(here, '..', 'data')
  for (const file of readdirSync(dataDir).filter((f) => f.endsWith('.json'))) {
    const track = JSON.parse(readFileSync(join(dataDir, file), 'utf8'))
    for (const orientation of ['LR', 'TD']) {
      const { slots } = layout(track.nodes, 1200, {}, new Set(), orientation)
      let hit = 0
      for (let i = 0; i < slots.length; i++)
        for (let j = i + 1; j < slots.length; j++)
          if (overlaps(slots[i], slots[j])) hit++
      check(`layout: ${file} ${orientation} has no overlaps (${slots.length} cards)`, hit === 0)
      const ids = new Set()
      walk(track.nodes, (n) => ids.add(n.id))
      check(`layout: ${file} ${orientation} places every visible node`, slots.length === ids.size)
    }
  }
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
