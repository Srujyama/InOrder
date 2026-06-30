// Import / export of track JSON. Lets a user download a track, hand it to an LLM to
// reformat, then re-upload it. Validation is strict-ish but forgiving: it repairs
// missing optional fields and reports clear errors for structural problems.
import { uid } from './tree.js'

const STATUSES = new Set(['todo', 'doing', 'done'])
const PRIORITIES = new Set(['p0', 'p1', 'p2', 'p3'])

// ---- download ----
function triggerDownload(filename, text) {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Strip transient UI-only keys (e.g. _collapsed) before exporting.
function clean(obj) {
  return JSON.parse(JSON.stringify(obj, (k, v) => (k.startsWith('_') ? undefined : v)))
}

export function exportTrack(track) {
  triggerDownload(`${track.id}.json`, JSON.stringify(clean(track), null, 2))
}

export function exportAllTracks(tracks) {
  // A single bundle file the user can split/edit and re-upload one track at a time.
  triggerDownload('life-tracks.json', JSON.stringify({ tracks: tracks.map(clean) }, null, 2))
}

// ---- import / validation ----
export class ImportError extends Error {}

function asString(v, fallback = '') {
  return typeof v === 'string' ? v : fallback
}

// Validate + repair a single node recursively. Throws ImportError on hard problems.
function normalizeNode(raw, seenIds, path) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ImportError(`Node at ${path} must be an object.`)
  }
  let id = asString(raw.id).trim()
  if (!id) id = uid('n')
  if (seenIds.has(id)) throw new ImportError(`Duplicate node id "${id}" at ${path}.`)
  seenIds.add(id)

  const title = asString(raw.title).trim()
  if (!title) throw new ImportError(`Node "${id}" at ${path} is missing a title.`)

  const status = STATUSES.has(raw.status) ? raw.status : 'todo'

  const node = { id, title, status }

  if (raw.priority != null) {
    if (!PRIORITIES.has(raw.priority)) throw new ImportError(`Node "${id}": priority must be p0–p3 (got "${raw.priority}").`)
    node.priority = raw.priority
  }
  if (Array.isArray(raw.tags)) {
    const tags = raw.tags.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim())
    if (tags.length) node.tags = tags
  }
  node.due = asString(raw.due)
  node.notes = asString(raw.notes)
  node.link = asString(raw.link)
  if (raw.side === 'left' || raw.side === 'right') node.side = raw.side
  if (Array.isArray(raw.requires)) {
    const reqs = raw.requires.filter((r) => typeof r === 'string' && r.trim())
    if (reqs.length) node.requires = reqs
  }
  if (Array.isArray(raw.children) && raw.children.length) {
    node.children = raw.children.map((c, i) => normalizeNode(c, seenIds, `${path}/${title}[${i}]`))
  } else {
    node.children = []
  }
  return node
}

// Validate + repair a whole track. Returns a clean track object ready to save.
export function normalizeTrack(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ImportError('File must contain a JSON object.')
  }
  // Accept either a bare track, or a single-track bundle {tracks:[one]}.
  if (Array.isArray(raw.tracks)) {
    if (raw.tracks.length !== 1) {
      throw new ImportError(`This file has ${raw.tracks.length} tracks. Upload one track at a time (a single object, or {"tracks":[ ... ]} with exactly one).`)
    }
    raw = raw.tracks[0]
  }

  let id = asString(raw.id).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const title = asString(raw.title).trim()
  if (!title) throw new ImportError('Track is missing a "title".')
  if (!id) id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || uid('track')

  if (!Array.isArray(raw.nodes)) throw new ImportError('Track must have a "nodes" array.')

  const seenIds = new Set()
  const nodes = raw.nodes.map((n, i) => normalizeNode(n, seenIds, `nodes[${i}]`))

  // Validate that every `requires` points at an existing node id.
  const allIds = new Set(seenIds)
  const checkReqs = (ns) => {
    for (const n of ns) {
      for (const r of n.requires || []) {
        if (!allIds.has(r)) throw new ImportError(`Node "${n.id}" requires "${r}", which doesn't exist in this track.`)
      }
      checkReqs(n.children || [])
    }
  }
  checkReqs(nodes)

  return {
    id,
    title,
    order: typeof raw.order === 'number' ? raw.order : 99,
    accent: /^#[0-9a-fA-F]{3,8}$/.test(raw.accent) ? raw.accent : '#2dd4d4',
    info: asString(raw.info),
    nodes,
  }
}

// Read a File object and return a normalized track (or throw ImportError).
export async function readTrackFile(file) {
  let text
  try {
    text = await file.text()
  } catch {
    throw new ImportError('Could not read the file.')
  }
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (e) {
    throw new ImportError('That file is not valid JSON. ' + (e.message || ''))
  }
  return normalizeTrack(parsed)
}
