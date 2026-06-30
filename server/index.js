import express from 'express'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(__dirname, '..', 'data')
const PORT = 5174

const app = express()
app.use(express.json({ limit: '5mb' }))

async function listTrackFiles() {
  const entries = await fs.readdir(DATA_DIR)
  return entries.filter((f) => f.endsWith('.json'))
}

function trackPath(id) {
  // ids are filenames without extension; guard against path traversal.
  const safe = path.basename(id).replace(/[^a-z0-9_-]/gi, '')
  return path.join(DATA_DIR, `${safe}.json`)
}

// List all tracks (full content — these files are small).
app.get('/api/tracks', async (_req, res) => {
  try {
    const files = await listTrackFiles()
    const tracks = await Promise.all(
      files.map(async (f) => {
        const raw = await fs.readFile(path.join(DATA_DIR, f), 'utf8')
        return JSON.parse(raw)
      })
    )
    tracks.sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
    res.json(tracks)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// Save a single track (full document replace).
app.put('/api/tracks/:id', async (req, res) => {
  try {
    const file = trackPath(req.params.id)
    const body = req.body
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'invalid body' })
    }
    await fs.writeFile(file, JSON.stringify(body, null, 2) + '\n', 'utf8')
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// Create a new track.
app.post('/api/tracks', async (req, res) => {
  try {
    const body = req.body || {}
    if (!body.id) return res.status(400).json({ error: 'id required' })
    const file = trackPath(body.id)
    await fs.writeFile(file, JSON.stringify(body, null, 2) + '\n', 'utf8')
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// Delete a track.
app.delete('/api/tracks/:id', async (req, res) => {
  try {
    await fs.unlink(trackPath(req.params.id))
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

app.listen(PORT, () => {
  console.log(`[life] data server on http://localhost:${PORT} (data dir: ${DATA_DIR})`)
})
