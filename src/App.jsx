import { useEffect, useMemo, useRef, useState } from 'react'
import { RoadmapTree } from './RoadmapTree.jsx'
import { PriorityPill } from './ui.jsx'
import { useAuth, SignIn, doSignOut } from './auth.jsx'
import { loadTracks, saveTrack, createTrack } from './store.js'
import { exportTrack, exportAllTracks, readTrackFile, ImportError } from './io.js'
import { THEMES, DEFAULT_THEME } from './themes.js'
import {
  STATUS_CYCLE, uid, walk, countTasks, buildCompletion, buildUnlocked,
  collectTags, dueClass, fmtDue, PRIORITY_RANK,
} from './tree.js'

// Old `sections` shape -> `nodes`. New files already use `nodes`.
function migrateTrack(track) {
  if (track.nodes) return track
  const nodes = (track.sections || []).map((s, i) => ({
    id: uid('n'),
    title: s.title,
    status: 'todo', due: '', notes: '', link: '',
    side: i % 2 === 0 ? 'left' : 'right',
    children: (s.tasks || []).map((t) => ({ ...t, children: t.children || [] })),
  }))
  const { sections, ...rest } = track
  return { ...rest, nodes }
}

function useCountUp(value) {
  const [shown, setShown] = useState(value)
  const ref = useRef(value)
  useEffect(() => {
    const from = ref.current
    const to = value
    if (from === to) return
    const start = performance.now()
    const dur = 280
    let raf
    const tick = (now) => {
      const p = Math.min(1, (now - start) / dur)
      const eased = 1 - Math.pow(1 - p, 3)
      setShown(Math.round(from + (to - from) * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
      else ref.current = to
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return shown
}

// Theme is global (applies even on the sign-in screen). main.jsx sets the initial
// attribute pre-mount; this keeps React state in sync and persists changes.
function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem('life-theme') || DEFAULT_THEME)
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('life-theme', theme)
  }, [theme])
  return [theme, setTheme]
}

export default function App() {
  const { user, loading } = useAuth()
  useTheme()

  if (loading) return <div className="loading">loading…</div>
  if (!user) return <SignIn />
  return <TrackerApp user={user} />
}

function TrackerApp({ user }) {
  const [tracks, setTracks] = useState(null)
  const [activeId, setActiveId] = useState('dashboard')
  const [theme, setTheme] = useTheme()
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const saveTimers = useRef({})

  useEffect(() => {
    let alive = true
    loadTracks(user.uid)
      .then((data) => { if (alive) setTracks(data.map(migrateTrack)) })
      .catch((e) => { if (alive) { setError(String(e)); setTracks([]) } })
    return () => { alive = false }
  }, [user.uid])

  function persist(track) {
    clearTimeout(saveTimers.current[track.id])
    saveTimers.current[track.id] = setTimeout(() => {
      saveTrack(user.uid, track).catch((e) => setError(String(e)))
    }, 400)
  }

  function updateTrack(id, mutator) {
    setTracks((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t
        const updated = mutator(structuredClone(t))
        persist(updated)
        return updated
      })
    )
  }

  if (!tracks) return <div className="loading">loading your tracks…</div>
  const active = tracks.find((t) => t.id === activeId)

  return (
    <div className="app">
      <Sidebar
        tracks={tracks} activeId={activeId} setActiveId={setActiveId}
        theme={theme} setTheme={setTheme} user={user}
        onExportAll={() => exportAllTracks(tracks)}
        onImportTrack={async (file) => {
          setError(''); setNotice('')
          try {
            const track = await readTrackFile(file)
            const exists = tracks.some((t) => t.id === track.id)
            await createTrack(user.uid, track) // setDoc overwrites by id (create or replace)
            setTracks((p) => {
              const without = p.filter((t) => t.id !== track.id)
              return [...without, track].sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
            })
            setActiveId(track.id)
            setNotice(`${exists ? 'Replaced' : 'Imported'} "${track.title}".`)
          } catch (e) {
            setError(e instanceof ImportError ? e.message : 'Import failed: ' + String(e))
          }
        }}
        onAddTrack={async () => {
          const title = prompt('New track name:')
          if (!title) return
          const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || uid('track')
          const track = {
            id, title, order: tracks.length + 1, accent: '#2dd4d4', info: '',
            nodes: [{ id: uid('n'), title: 'Topic 1', status: 'todo', due: '', notes: '', link: '', side: 'left', children: [] }],
          }
          try {
            await createTrack(user.uid, track)
            setTracks((p) => [...p, track])
            setActiveId(id)
          } catch (e) { setError(String(e)) }
        }}
      />
      <main className="main">
        {error && <div className="banner-error" onClick={() => setError('')}>⚠ {error} (click to dismiss)</div>}
        {notice && <div className="banner-notice" onClick={() => setNotice('')}>✓ {notice} (click to dismiss)</div>}
        {activeId === 'dashboard' ? (
          <Dashboard tracks={tracks} setActiveId={setActiveId} />
        ) : active ? (
          <TrackView key={active.id} track={active} updateTrack={updateTrack} onExport={() => exportTrack(active)} />
        ) : (
          <div className="empty">Track not found.</div>
        )}
      </main>
    </div>
  )
}

function Sidebar({ tracks, activeId, setActiveId, theme, setTheme, onAddTrack, onExportAll, onImportTrack, user }) {
  const fileRef = useRef(null)
  return (
    <aside className="sidebar">
      <div className="brand">
        <h1>life</h1>
        <span className="sub">study tracker</span>
      </div>

      <button className={'nav-item' + (activeId === 'dashboard' ? ' active' : '')} onClick={() => setActiveId('dashboard')}>
        <span className="nav-dot" style={{ background: 'var(--text-dim)' }} />
        Dashboard
      </button>

      <div className="nav-section-label">Tracks</div>
      {tracks.map((t) => {
        const { done, total } = countTasks(t)
        return (
          <button
            key={t.id}
            className={'nav-item' + (activeId === t.id ? ' active' : '')}
            style={{ '--accent': t.accent }}
            onClick={() => setActiveId(t.id)}
          >
            <span className="nav-dot" style={{ background: t.accent }} />
            {t.title}
            <span className="nav-count">{done}/{total}</span>
          </button>
        )
      })}

      <div className="sidebar-footer">
        <button className="icon-btn" onClick={onAddTrack}>+ Track</button>
        <ThemePicker theme={theme} setTheme={setTheme} />
      </div>
      <div className="sidebar-footer io-row">
        <button className="icon-btn" onClick={() => fileRef.current?.click()} title="Import a track from a .json file">↑ Import</button>
        <button className="icon-btn" onClick={onExportAll} title="Download all tracks as JSON">↓ Export all</button>
        <input
          ref={fileRef} type="file" accept="application/json,.json" hidden
          onChange={(e) => {
            const f = e.target.files && e.target.files[0]
            if (f) onImportTrack(f)
            e.target.value = '' // allow re-importing the same filename
          }}
        />
      </div>

      {user && !user.local && (
        <div className="account">
          <div className="account-info" title={user.email || ''}>
            <span className="account-name">{user.displayName || user.email || 'Account'}</span>
            {user.email && user.displayName && <span className="account-email">{user.email}</span>}
          </div>
          <button className="icon-btn" onClick={doSignOut} title="Sign out">Sign out</button>
        </div>
      )}
    </aside>
  )
}

function ThemePicker({ theme, setTheme }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const current = THEMES.find((t) => t.id === theme) || THEMES[0]

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div className="theme-picker" ref={ref}>
      <button className="icon-btn theme-trigger" onClick={() => setOpen((o) => !o)} title="Theme">
        <span className="theme-chip" style={{ background: current.swatch.surface, borderColor: current.swatch.accent }}>
          <span style={{ background: current.swatch.accent }} />
        </span>
        Theme
      </button>
      {open && (
        <div className="theme-menu">
          <div className="theme-menu-label">// THEME</div>
          <div className="theme-grid">
            {THEMES.map((t) => (
              <button
                key={t.id}
                className={'theme-swatch' + (t.id === theme ? ' active' : '')}
                onClick={() => { setTheme(t.id); setOpen(false) }}
                title={t.name}
                style={{ '--sw-bg': t.swatch.bg, '--sw-surface': t.swatch.surface, '--sw-accent': t.swatch.accent, '--sw-text': t.swatch.text }}
              >
                <span className="sw-preview">
                  <span className="sw-bar" />
                  <span className="sw-dot" />
                </span>
                <span className="sw-name">{t.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Dashboard({ tracks, setActiveId }) {
  const upcoming = useMemo(() => {
    const items = []
    for (const t of tracks) {
      walk(t.nodes, (n) => {
        if (n.due && n.status !== 'done') items.push({ ...n, track: t.title, accent: t.accent })
      })
    }
    return items.sort((a, b) => a.due.localeCompare(b.due)).slice(0, 8)
  }, [tracks])

  const nextUp = useMemo(() => {
    const items = []
    for (const t of tracks) {
      const complete = buildCompletion(t.nodes)
      const unlocked = buildUnlocked(t.nodes, complete)
      walk(t.nodes, (n) => {
        if (unlocked.has(n.id) && n.status === 'todo') {
          items.push({ id: n.id, title: n.title, priority: n.priority, track: t.title, trackId: t.id, accent: t.accent })
        }
      })
    }
    // High priority first, then track order.
    items.sort((a, b) => (PRIORITY_RANK[a.priority] ?? 4) - (PRIORITY_RANK[b.priority] ?? 4))
    return items.slice(0, 10)
  }, [tracks])

  return (
    <>
      <div className="head"><div className="head-top"><h2 className="dash-title">Dashboard</h2></div></div>

      <div className="dash-grid">
        {tracks.map((t) => <DashCard key={t.id} track={t} onClick={() => setActiveId(t.id)} />)}
      </div>

      <div className="section-block">
        <h3>Next up</h3>
        {nextUp.length === 0 ? (
          <div className="empty">Nothing unlocked — mark prerequisites done to surface the next steps.</div>
        ) : nextUp.map((item) => (
          <div key={item.trackId + item.id} className="up-item" onClick={() => setActiveId(item.trackId)} style={{ cursor: 'pointer', '--accent': item.accent }}>
            <span className="next-badge">next</span>
            {item.priority && <PriorityPill level={item.priority} />}
            <span>{item.title}</span>
            <span className="up-track">{item.track}</span>
          </div>
        ))}
      </div>

      <div className="section-block">
        <h3>Upcoming deadlines</h3>
        {upcoming.length === 0 ? (
          <div className="empty">No due dates set yet. Add them to nodes to see them here.</div>
        ) : upcoming.map((item) => (
          <div key={item.id} className={'up-item ' + (dueClass(item.due) === 'overdue' ? 'overdue' : '')}>
            <span className={'up-due ' + dueClass(item.due)}>{fmtDue(item.due)}</span>
            <span className="nav-dot" style={{ background: item.accent }} />
            <span>{item.title}</span>
            <span className="up-track">{item.track}</span>
          </div>
        ))}
      </div>
    </>
  )
}

function DashCard({ track, onClick }) {
  const { done, total, pct } = countTasks(track)
  const shownPct = useCountUp(pct)
  return (
    <div className="dash-card" onClick={onClick} style={{ '--accent': track.accent }}>
      <h3>{track.title}</h3>
      <div className="pct">{shownPct}%</div>
      <div className="meta">{done} of {total} done</div>
      <div className="mini-track"><div className="mini-fill" style={{ width: pct + '%' }} /></div>
    </div>
  )
}

function TrackView({ track, updateTrack, onExport }) {
  const { done, total, pct } = countTasks(track)
  const shownPct = useCountUp(pct)
  const allTags = useMemo(() => collectTags(track.nodes), [track])

  const [filter, setFilter] = useState({
    text: '', status: new Set(), priority: new Set(), tags: new Set(), nextUpOnly: false,
  })

  return (
    <>
      <div className="head">
        <div className="head-top">
          <span className="accent-bar" style={{ '--accent': track.accent, background: track.accent }} />
          <h2>{track.title}</h2>
          <button className="icon-btn head-export" onClick={onExport} title="Download this track as JSON (edit it with an LLM, then re-import)">
            ↓ Export JSON
          </button>
        </div>
        <div className="progress-wrap" style={{ '--accent': track.accent }}>
          <div className="progress-meta">
            <span>{done} / {total} complete</span>
            <span className="pct">{shownPct}%</span>
          </div>
          <div className="progress-track"><div className="progress-fill" style={{ width: pct + '%' }} /></div>
        </div>
        <div className="info-card">
          <label>Info / notes</label>
          <textarea
            value={track.info || ''} placeholder="Resources, links, goals…"
            onChange={(e) => updateTrack(track.id, (t) => { t.info = e.target.value; return t })}
          />
        </div>
      </div>

      <RoadmapTree
        track={track}
        updateTrack={updateTrack}
        filter={filter}
        setFilter={setFilter}
        allTags={allTags}
        helpers={{ STATUS_CYCLE, dueClass, fmtDue, uid }}
      />
    </>
  )
}
