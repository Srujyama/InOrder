// Shared tree model + helpers for the roadmap data.
// A track has { id, title, order, accent, info, nodes: Node[] }.
// A Node is recursive:
//   { id, title, status: 'todo'|'doing'|'done', due, notes, link,
//     side?: 'left'|'right'      // top-level only: which side of the spine
//     requires?: string[],        // prerequisite node ids
//     priority?: 'p0'|'p1'|'p2'|'p3',
//     tags?: string[],
//     children?: Node[],
//     _collapsed?: boolean }       // transient UI-only (never persisted)

export const STATUS_CYCLE = { todo: 'doing', doing: 'done', done: 'todo' }
export const STATUSES = ['todo', 'doing', 'done']
export const PRIORITIES = ['p0', 'p1', 'p2', 'p3']
export const PRIORITY_RANK = { p0: 0, p1: 1, p2: 2, p3: 3, '': 4, undefined: 4 }

let _seq = 0
export function uid(prefix = 'n') {
  // Monotonic id; unique within a session. (No Date.now/random reliance needed.)
  _seq += 1
  return `${prefix}-${_seq.toString(36)}${performance.now().toString(36).replace('.', '')}`
}

// Depth-first visit. fn(node, parent, depth).
export function walk(nodes, fn, parent = null, depth = 0) {
  for (const n of nodes || []) {
    fn(n, parent, depth)
    walk(n.children, fn, n, depth + 1)
  }
}

export function findNode(nodes, id) {
  for (const n of nodes || []) {
    if (n.id === id) return n
    const found = findNode(n.children, id)
    if (found) return found
  }
  return null
}

export function removeNode(nodes, id) {
  for (let i = 0; i < (nodes || []).length; i++) {
    if (nodes[i].id === id) {
      nodes.splice(i, 1)
      return true
    }
    if (removeNode(nodes[i].children, id)) return true
  }
  return false
}

// Leaf-based task counts for a track (branches roll up).
export function countTasks(track) {
  let total = 0
  let done = 0
  walk(track.nodes, (n) => {
    if (!n.children || n.children.length === 0) {
      total++
      if (n.status === 'done') done++
    }
  })
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 }
}

// A node is "complete" if marked done OR (branch && every leaf under it done).
export function buildCompletion(nodes) {
  const complete = new Map()
  function visit(node) {
    const children = node.children || []
    if (!children.length) {
      complete.set(node.id, node.status === 'done')
      return complete.get(node.id)
    }
    let all = true
    for (const c of children) all = visit(c) && all
    const done = node.status === 'done' || all
    complete.set(node.id, done)
    return done
  }
  for (const n of nodes) visit(n)
  return complete
}

// "Next up" = leaf nodes whose prerequisites (own + all ancestors') are complete
// but which are not themselves complete.
export function buildUnlocked(nodes, complete) {
  const unlocked = new Set()
  const reqsMet = (node) => (node.requires || []).every((r) => complete.get(r))
  function visit(node, ancestorsMet) {
    const meMet = ancestorsMet && reqsMet(node)
    const children = node.children || []
    if (meMet && !complete.get(node.id) && !children.length) unlocked.add(node.id)
    for (const c of children) visit(c, meMet)
  }
  for (const n of nodes) visit(n, true)
  return unlocked
}

// Collect every distinct tag used in a track, sorted.
export function collectTags(nodes) {
  const set = new Set()
  walk(nodes, (n) => (n.tags || []).forEach((t) => set.add(t)))
  return [...set].sort()
}

// ---- Date helpers (shared by cards + dashboard) ----
export function dueClass(due) {
  if (!due) return ''
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(due + 'T00:00:00')
  const diff = (d - today) / 86400000
  if (diff < 0) return 'overdue'
  if (diff <= 3) return 'soon'
  return ''
}

export function fmtDue(due) {
  if (!due) return ''
  const d = new Date(due + 'T00:00:00')
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// ---- Filtering ----
// A filter is { text, status: Set|null, priority: Set|null, tags: Set|null, nextUpOnly }.
// matchNode returns true if the node itself matches the active filter criteria.
export function matchNode(node, filter, unlocked) {
  const { text, status, priority, tags, nextUpOnly } = filter
  if (text) {
    const hay = (node.title + ' ' + (node.notes || '') + ' ' + (node.tags || []).join(' ')).toLowerCase()
    if (!hay.includes(text.toLowerCase())) return false
  }
  if (status && status.size && !status.has(node.status)) return false
  if (priority && priority.size && !priority.has(node.priority || '')) return false
  if (tags && tags.size && !(node.tags || []).some((t) => tags.has(t))) return false
  if (nextUpOnly && !unlocked.has(node.id)) return false
  return true
}

export function filterActive(filter) {
  return !!(
    (filter.text && filter.text.trim()) ||
    (filter.status && filter.status.size) ||
    (filter.priority && filter.priority.size) ||
    (filter.tags && filter.tags.size) ||
    filter.nextUpOnly
  )
}

// Returns a Set of node ids to SHOW: any node that matches, plus all ancestors of a
// match (so context is preserved) and—when a branch matches—optionally its subtree.
// We keep ancestors of matches; we do NOT auto-include descendants so filtering stays focused.
export function computeVisible(nodes, filter, unlocked) {
  if (!filterActive(filter)) return null // null => show everything
  const visible = new Set()
  function visit(node, ancestors) {
    const selfMatch = matchNode(node, filter, unlocked)
    if (selfMatch) {
      visible.add(node.id)
      for (const a of ancestors) visible.add(a)
    }
    for (const c of node.children || []) visit(c, selfMatch ? [...ancestors, node.id] : [...ancestors, node.id])
  }
  for (const n of nodes) visit(n, [])
  return visible
}
