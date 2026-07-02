import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { STATUSES, PRIORITIES } from './tree.js'

const cap = (s) => s[0].toUpperCase() + s.slice(1)
const STATUS_SEGMENTS = [
  { key: 'all', label: 'All' },
  ...STATUSES.map((s) => ({ key: s, label: cap(s) })),
]

function SearchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

export function FilterBar({ filter, setFilter, allTags, accent, onExpandAll, onCollapseAll, orientation, setOrientation, onLocateNext, nextCount }) {
  // Segmented status: single-select view (all/one status). Maps to filter.status Set.
  const activeSeg = filter.status.size === 1 ? [...filter.status][0] : 'all'
  const segRefs = useRef({})
  const [thumb, setThumb] = useState({ left: 2, width: 0 })

  useLayoutEffect(() => {
    const el = segRefs.current[activeSeg]
    if (el) setThumb({ left: el.offsetLeft, width: el.offsetWidth })
  }, [activeSeg, allTags.length])

  const setStatus = (key) =>
    setFilter((f) => ({ ...f, status: key === 'all' ? new Set() : new Set([key]) }))

  return (
    <div className="filter-bar" style={{ '--accent': accent }}>
      <label className="filter-search">
        <SearchIcon />
        <input
          type="text" placeholder="Search nodes…" value={filter.text}
          onChange={(e) => setFilter((f) => ({ ...f, text: e.target.value }))}
        />
      </label>

      <div className="segmented" role="tablist">
        <span className="thumb" style={{ transform: `translateX(${thumb.left - 2}px)`, width: thumb.width }} />
        {STATUS_SEGMENTS.map((s) => (
          <button
            key={s.key}
            ref={(el) => (segRefs.current[s.key] = el)}
            className={'seg' + (activeSeg === s.key ? ' active' : '')}
            onClick={() => setStatus(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <MultiMenu
        label="Priority"
        active={filter.priority}
        options={PRIORITIES.map((p) => ({ key: p, label: p.toUpperCase(), pill: p }))}
        onToggle={(key) => setFilter((f) => toggleSet(f, 'priority', key))}
      />

      {allTags.length > 0 && (
        <MultiMenu
          label="Tags"
          active={filter.tags}
          options={allTags.map((t) => ({ key: t, label: t }))}
          onToggle={(key) => setFilter((f) => toggleSet(f, 'tags', key))}
        />
      )}

      <div className="filter-spacer" />

      <button
        className={'toggle-switch' + (filter.nextUpOnly ? ' on' : '')}
        onClick={() => setFilter((f) => ({ ...f, nextUpOnly: !f.nextUpOnly }))}
        title="Show only unlocked, actionable nodes"
      >
        <span className="switch" />
        Next up
      </button>

      {onLocateNext && (
        <button
          className="filter-btn locate-next"
          onClick={onLocateNext}
          disabled={!nextCount}
          title="Jump to your next unlocked task (n)"
        >
          ◎ Next{nextCount ? ` · ${nextCount}` : ''}
        </button>
      )}

      {setOrientation && (
        <div className="orient-toggle" role="group" aria-label="Layout direction">
          <button
            className={'orient-btn' + (orientation !== 'TD' ? ' active' : '')}
            onClick={() => setOrientation('LR')} title="Left to right"
          >
            <OrientIcon dir="LR" /> LR
          </button>
          <button
            className={'orient-btn' + (orientation === 'TD' ? ' active' : '')}
            onClick={() => setOrientation('TD')} title="Top down"
          >
            <OrientIcon dir="TD" /> TD
          </button>
        </div>
      )}

      <div className="tree-tools">
        <button className="icon-btn" onClick={onExpandAll} title="Expand all">⊕</button>
        <button className="icon-btn" onClick={onCollapseAll} title="Collapse all">⊖</button>
      </div>
    </div>
  )
}

function OrientIcon({ dir }) {
  // tiny node-tree glyph in the given direction
  if (dir === 'TD') {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3">
        <rect x="3.5" y="0.5" width="5" height="3" rx="1" />
        <rect x="0.5" y="8.5" width="4" height="3" rx="1" />
        <rect x="7.5" y="8.5" width="4" height="3" rx="1" />
        <path d="M6 3.5V6M6 6H2.5V8.5M6 6H9.5V8.5" />
      </svg>
    )
  }
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3">
      <rect x="0.5" y="3.5" width="3" height="5" rx="1" />
      <rect x="8.5" y="0.5" width="3" height="4" rx="1" />
      <rect x="8.5" y="7.5" width="3" height="4" rx="1" />
      <path d="M3.5 6H6M6 6V2.5H8.5M6 6V9.5H8.5" />
    </svg>
  )
}

function toggleSet(filter, field, key) {
  const next = new Set(filter[field])
  if (next.has(key)) next.delete(key)
  else next.add(key)
  return { ...filter, [field]: next }
}

function MultiMenu({ label, active, options, onToggle }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div className="filter-menu" ref={ref}>
      <button
        className={'filter-btn' + (open ? ' open' : '') + (active.size ? ' has-value' : '')}
        onClick={() => setOpen((o) => !o)}
      >
        {label}{active.size ? ` · ${active.size}` : ''}
        <span className="caret">▾</span>
      </button>
      {open && (
        <div className="menu-pop">
          {options.map((o) => (
            <button
              key={o.key}
              className={'opt' + (active.has(o.key) ? ' checked' : '')}
              onClick={() => onToggle(o.key)}
            >
              {o.pill ? <span className={'pri-pill ' + o.pill}><span className="pri-dot" />{o.label}</span> : o.label}
              <span className="tick">✓</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
