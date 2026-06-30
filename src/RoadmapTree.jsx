import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { FilterBar } from './FilterBar.jsx'
import { PriorityPill } from './ui.jsx'
import {
  walk, findNode, removeNode, buildCompletion, buildUnlocked,
  computeVisible, filterActive,
} from './tree.js'

/*
  Clean directional tree renderer. A single flow direction (Left→Right or Top→Down):
  depth advances along the primary axis; siblings stack along the cross axis; a node
  centers against its subtree. No central spine / left-right splitting (that was the
  source of crossing-line clutter). Subtree packing guarantees no card overlap.
*/

const ROW_GAP = 16        // cross-axis gap between sibling subtrees
const CARD_W = 280        // card width (LR primary axis advance per depth uses this)
const COL_GAP = 72        // LR: horizontal gap between depth columns
const LANE_GAP = 64       // TD: vertical gap between depth rows
const TOPIC_GAP = 28      // gap between top-level topics (cross axis)
const MARGIN = 28

// Estimated card extent before measurement.
function CARD_EST_H(node) {
  const lines = Math.ceil((node.title || '').length / 26)
  const metaLine = node.due || node.priority || (node.tags && node.tags.length) ? 22 : 0
  return 28 + Math.max(1, lines) * 17 + 14 + metaLine
}

// `collapsed` is a Set of node ids whose children are hidden (UI-only, never persisted).
// `orientation` is 'LR' or 'TD'. Returns positioned slots in canvas coordinates.
export function layout(nodes, containerWidth, heights, collapsed, orientation = 'LR') {
  const slots = []
  const isLR = orientation !== 'TD'
  const hOf = (node) => heights[node.id] || CARD_EST_H(node)
  const wOf = () => CARD_W
  const kids = (node) => (collapsed.has(node.id) ? [] : node.children || [])

  // Cross-axis extent of a whole subtree (height in LR, width in TD).
  const crossOf = (node) => (isLR ? hOf(node) : wOf(node))
  const subtreeCross = new Map()
  function measure(node) {
    const children = kids(node)
    const own = crossOf(node)
    if (!children.length) { subtreeCross.set(node.id, own); return own }
    let block = 0
    children.forEach((c, i) => { block += measure(c); if (i < children.length - 1) block += ROW_GAP })
    const cross = Math.max(own, block)
    subtreeCross.set(node.id, cross)
    return cross
  }

  // Primary-axis position per depth.
  // LR: x = depth * (CARD_W + COL_GAP).  TD: y = depth * (rowHeight + LANE_GAP).
  function primaryPos(depth) {
    return isLR ? depth * (CARD_W + COL_GAP) : depth * (56 + LANE_GAP)
  }

  // crossStart = top (LR) or left (TD) of this subtree's band.
  function place(node, crossStart, depth, topicId, parentId) {
    const children = kids(node)
    const cross = subtreeCross.get(node.id)
    const own = crossOf(node)
    const primary = primaryPos(depth)
    // center the card against its subtree band along the cross axis
    const myCross = crossStart + (cross - own) / 2
    const x = isLR ? primary : myCross
    const y = isLR ? myCross : primary
    slots.push({ node, depth, x, y, parentId, topicId, ownH: hOf(node) })
    let cursor = crossStart
    for (const c of children) {
      place(c, cursor, depth + 1, topicId, node.id)
      cursor += subtreeCross.get(c.id) + ROW_GAP
    }
  }

  let cursor = MARGIN
  for (const topic of nodes) {
    const cross = measure(topic)
    place(topic, cursor, 0, topic.id, null)
    cursor += cross + TOPIC_GAP
  }

  if (!slots.length) return { slots, height: 360, contentWidth: containerWidth, orientation }

  // Normalize to positive margins; compute content bounds.
  const minX = Math.min(...slots.map((s) => s.x))
  const minY = Math.min(...slots.map((s) => s.y))
  const dx = MARGIN - minX
  const dy = MARGIN - minY
  for (const s of slots) { s.x += dx; s.y += dy }
  const contentWidth = Math.max(...slots.map((s) => s.x + CARD_W)) + MARGIN
  const height = Math.max(360, Math.max(...slots.map((s) => s.y + s.ownH)) + MARGIN + 40)
  return { slots, height, contentWidth, orientation }
}

// ---- collapse default: collapse every topic with children EXCEPT those whose subtree
// contains a "next up" node. Returns a Set of collapsed ids. ----
function defaultCollapsed(nodes, unlocked) {
  const collapsed = new Set()
  function containsUnlocked(node) {
    if (unlocked.has(node.id)) return true
    return (node.children || []).some(containsUnlocked)
  }
  for (const topic of nodes) {
    if ((topic.children || []).length && !containsUnlocked(topic)) collapsed.add(topic.id)
  }
  return collapsed
}

export function RoadmapTree({ track, updateTrack, filter, setFilter, allTags, helpers }) {
  const { uid } = helpers
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const cardRefs = useRef({})
  const [width, setWidth] = useState(1000)
  const [paths, setPaths] = useState([])
  const heightsRef = useRef({})
  const [layoutVersion, setLayoutVersion] = useState(0)
  const [tick, setTick] = useState(0)
  const remeasure = () => setTick((t) => t + 1)

  // Completion + unlocked sets for this track.
  const { complete, unlocked } = useMemo(() => {
    const complete = buildCompletion(track.nodes)
    return { complete, unlocked: buildUnlocked(track.nodes, complete) }
  }, [track])

  // Collapse state: persisted per track in localStorage; first time, smart default.
  const storeKey = `life-collapsed-${track.id}`
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem(storeKey)
    if (saved) { try { return new Set(JSON.parse(saved)) } catch { /* fall through */ } }
    return defaultCollapsed(track.nodes, unlocked)
  })
  useEffect(() => {
    localStorage.setItem(storeKey, JSON.stringify([...collapsed]))
  }, [collapsed, storeKey])

  // Layout orientation: 'LR' (default) or 'TD'. Persisted globally.
  const [orientation, setOrientation] = useState(() => localStorage.getItem('life-orientation') || 'LR')
  useEffect(() => { localStorage.setItem('life-orientation', orientation) }, [orientation])

  // Dependency-arrow visibility (calm by default; spotlight a node's deps on hover).
  const [hoverId, setHoverId] = useState(null)

  const toggleCollapse = (id) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  const expandAll = () => setCollapsed(new Set())
  const collapseAll = () => {
    const all = new Set()
    walk(track.nodes, (n) => { if ((n.children || []).length) all.add(n.id) })
    setCollapsed(all)
  }

  // Filter -> set of visible ids (null = show all).
  const visible = useMemo(() => computeVisible(track.nodes, filter, unlocked), [track, filter, unlocked])
  const isActive = filterActive(filter)

  // When filtering, force-expand any branch on the path to a match so matches render.
  const effectiveCollapsed = useMemo(() => {
    if (!isActive || !visible) return collapsed
    const next = new Set(collapsed)
    walk(track.nodes, (n) => { if (visible.has(n.id)) next.delete(n.id) })
    return next
  }, [collapsed, isActive, visible, track])

  // Container width.
  useLayoutEffect(() => {
    if (!wrapRef.current) return
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const w = Math.round(e.contentRect.width)
        setWidth((prev) => (prev === w ? prev : w))
      }
    })
    ro.observe(wrapRef.current)
    setWidth(Math.round(wrapRef.current.clientWidth))
    return () => ro.disconnect()
  }, [])

  // Forget measured heights when switching tracks.
  const lastTrackId = useRef(track.id)
  if (lastTrackId.current !== track.id) {
    lastTrackId.current = track.id
    heightsRef.current = {}
  }

  const { slots, height, contentWidth } = useMemo(
    () => layout(track.nodes, width, heightsRef.current, effectiveCollapsed, orientation),
    [track, width, tick, layoutVersion, effectiveCollapsed, orientation]
  )

  // Pass 1: measure heights -> re-flow once if they changed.
  useLayoutEffect(() => {
    let changed = false
    for (const s of slots) {
      const el = cardRefs.current[s.node.id]
      if (!el) continue
      const h = el.offsetHeight
      if (Math.abs((heightsRef.current[s.node.id] || 0) - h) > 0.5) {
        heightsRef.current[s.node.id] = h
        changed = true
      }
    }
    if (changed) setLayoutVersion((v) => v + 1)
  }, [slots, tick])

  // Pass 2: build SVG paths from measured rects (relative to canvas).
  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const box = canvas.getBoundingClientRect()
    const rectOf = (id) => {
      const el = cardRefs.current[id]
      if (!el) return null
      const b = el.getBoundingClientRect()
      return {
        left: b.left - box.left, right: b.right - box.left,
        top: b.top - box.top, bottom: b.bottom - box.top,
        cx: b.left - box.left + b.width / 2, cy: b.top - box.top + b.height / 2,
      }
    }
    const isLR = orientation !== 'TD'
    const child = []
    const dep = []
    const ports = {} // node id -> {x,y} marker (where its incoming edge meets it)

    // Parent -> child connectors: exit parent on the leading edge, enter child on the
    // trailing edge, with a smooth curve in the flow direction.
    for (const s of slots) {
      if (s.depth === 0) continue
      const c = rectOf(s.node.id)
      const p = s.parentId ? rectOf(s.parentId) : null
      if (!c || !p) continue
      if (isLR) {
        child.push({ d: flowCurve(p.right, p.cy, c.left, c.cy, 'LR'), id: s.node.id })
        ports[s.node.id] = { x: c.left, y: c.cy }
      } else {
        child.push({ d: flowCurve(p.cx, p.bottom, c.cx, c.top, 'TD'), id: s.node.id })
        ports[s.node.id] = { x: c.cx, y: c.top }
      }
    }

    // Dependency edges — calm, routed cleanly along the flow axis.
    for (const s of slots) {
      for (const reqId of s.node.requires || []) {
        const f = rectOf(reqId)
        const t = rectOf(s.node.id)
        if (!f || !t) continue
        const d = isLR
          ? depFlow(f.right, f.cy, t.left, t.cy, 'LR')
          : depFlow(f.cx, f.bottom, t.cx, t.top, 'TD')
        dep.push({ d, id: s.node.id + '<' + reqId, from: reqId, to: s.node.id })
      }
    }

    setPaths((prev) => {
      const sig = JSON.stringify([child.map((c) => c.d), dep.map((d) => d.d)])
      if (prev.sig === sig) return prev
      return { child, dep, ports, sig }
    })
  }, [slots, width, tick, track, layoutVersion, effectiveCollapsed, orientation])

  const childPaths = paths.child || []
  const depPaths = paths.dep || []
  const ports = paths.ports || {}

  return (
    <>
      <FilterBar
        filter={filter} setFilter={setFilter} allTags={allTags} accent={track.accent}
        onExpandAll={expandAll} onCollapseAll={collapseAll}
        orientation={orientation} setOrientation={setOrientation}
      />
      <div className="roadmap-scroll" ref={wrapRef}>
        <div className={'roadmap-canvas ' + (orientation === 'TD' ? 'is-td' : 'is-lr')} ref={canvasRef} style={{ height, width: contentWidth }}>
          <svg className="roadmap-svg" width={contentWidth} height={height} style={{ '--accent': track.accent }}>
            <defs>
              <marker id="dep-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                <path d="M 0 1 L 9 5 L 0 9" fill="none" stroke="var(--text-faint)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </marker>
            </defs>

            {/* dependency edges — calm; spotlight the hovered node's edges */}
            {depPaths.map((p) => {
              const active = hoverId && (p.from === hoverId || p.to === hoverId)
              return (
                <path key={'dep' + p.id} d={p.d} className={'edge-dep' + (active ? ' active' : '')}
                  markerEnd="url(#dep-arrow)" fill="none" />
              )
            })}

            {/* parent → child tree connectors (the primary, confident lines) */}
            {childPaths.map((p) => {
              const active = hoverId && p.id === hoverId
              return (
                <path key={'ch' + p.id} d={p.d}
                  className={'edge-child' + (active ? ' active' : '')}
                  style={{ stroke: track.accent }} fill="none" />
              )
            })}

            {/* station markers where each edge meets a node */}
            {slots.filter((s) => s.depth > 0 && ports[s.node.id]).map((s) => {
              const pt = ports[s.node.id]
              return (
                <g key={'st' + s.node.id}>
                  <circle cx={pt.x} cy={pt.y} r="4" className="spine-bead-ring" style={{ stroke: track.accent }} />
                  <circle cx={pt.x} cy={pt.y} r="2" className="spine-bead" style={{ fill: track.accent }} />
                </g>
              )
            })}
          </svg>

          {slots.map((s) => {
            const dim = isActive && visible && !visible.has(s.node.id)
            return (
              <NodeCard
                key={s.node.id}
                slot={s}
                accent={track.accent}
                cardRefs={cardRefs}
                helpers={helpers}
                unlocked={unlocked.has(s.node.id)}
                collapsed={effectiveCollapsed.has(s.node.id)}
                dimmed={dim}
                allTags={allTags}
                onMeasure={remeasure}
                onHover={setHoverId}
                onChange={(mut) => updateTrack(track.id, (t) => { const n = findNode(t.nodes, s.node.id); if (n) mut(n); return t })}
                onAddChild={() => updateTrack(track.id, (t) => {
                  const n = findNode(t.nodes, s.node.id)
                  if (n) { n.children = n.children || []; n.children.push({ id: uid('n'), title: 'New item', status: 'todo', due: '', notes: '', link: '', children: [] }) }
                  return t
                })}
                onDelete={() => updateTrack(track.id, (t) => { removeNode(t.nodes, s.node.id); return t })}
                onToggleCollapse={() => { toggleCollapse(s.node.id); remeasure() }}
              />
            )
          })}

          <button
            className="add-topic-btn"
            onClick={() => updateTrack(track.id, (t) => {
              t.nodes.push({ id: uid('n'), title: 'New topic', status: 'todo', due: '', notes: '', link: '', children: [] })
              return t
            })}
          >
            + Add topic
          </button>
        </div>
      </div>
    </>
  )
}

function autoGrow(el) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}

const STATUS_GLYPH = { todo: '', doing: '–', done: '✓' }

function NodeCard({ slot, accent, cardRefs, helpers, unlocked, collapsed, dimmed, allTags, onMeasure, onHover, onChange, onAddChild, onDelete, onToggleCollapse }) {
  const { STATUS_CYCLE, dueClass, fmtDue } = helpers
  const { node, x, y, depth } = slot
  const hasChildren = (node.children || []).length > 0
  const isLeaf = !hasChildren
  const [open, setOpen] = useState(false)
  const titleRef = useRef(null)
  const menuBtnRef = useRef(null)

  useLayoutEffect(() => { autoGrow(titleRef.current) }, [node.title, slot.x])

  const cls = ['node-card']
  if (node.status === 'done') cls.push('done')
  if (node.status === 'doing') cls.push('doing')
  if (depth === 0) cls.push('topic'); else cls.push('leaf')
  if (unlocked && node.status === 'todo') cls.push('next-up')
  if (dimmed) cls.push('dimmed')
  if (open) cls.push('editing')

  return (
    <div
      ref={(el) => (cardRefs.current[node.id] = el)}
      className={cls.join(' ')}
      style={{ left: x, top: y, width: CARD_W, '--accent': accent, borderColor: depth === 0 ? 'var(--accent-line)' : undefined }}
      onMouseEnter={() => onHover && onHover(node.id)}
      onMouseLeave={() => onHover && onHover(null)}
    >
      <div className="node-row">
        <button
          className={'check ' + node.status}
          onClick={() => onChange((n) => { n.status = STATUS_CYCLE[n.status] })}
          title={node.status}
        >
          {node.status !== 'todo' && <span className="glyph">{STATUS_GLYPH[node.status]}</span>}
        </button>

        <textarea
          ref={titleRef} className="node-title" rows={1} value={node.title} title={node.title}
          onChange={(e) => { onChange((n) => { n.title = e.target.value }); autoGrow(e.target); if (onMeasure) requestAnimationFrame(onMeasure) }}
          onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }}
        />

        {hasChildren && (
          <button className="collapse-btn" onClick={onToggleCollapse} title={collapsed ? 'Expand' : 'Collapse'}>
            {collapsed ? '▸' : '▾'}
          </button>
        )}
        <button ref={menuBtnRef} className="node-menu" onClick={() => setOpen((o) => !o)} title="Details">⋯</button>
      </div>

      <div className="node-tags">
        {unlocked && node.status === 'todo' && <span className="next-badge">next up</span>}
        {node.due && <span className={'due-pill ' + dueClass(node.due)}>{fmtDue(node.due)}</span>}
        {node.priority && <PriorityPill level={node.priority} />}
        {(node.tags || []).map((t) => <span key={t} className="tag-chip">{t}</span>)}
      </div>

      {open && (
        <NodePopover
          node={node} accent={accent} anchorRef={menuBtnRef} allTags={allTags}
          onClose={() => setOpen(false)}
          onChange={onChange} onAddChild={() => { onAddChild(); setOpen(false) }} onDelete={onDelete}
        />
      )}
    </div>
  )
}

function NodePopover({ node, accent, allTags, onClose, onChange, onAddChild, onDelete }) {
  const [tagDraft, setTagDraft] = useState('')

  const addTag = (raw) => {
    const t = raw.trim().toLowerCase()
    if (!t) return
    onChange((n) => { n.tags = n.tags || []; if (!n.tags.includes(t)) n.tags.push(t) })
    setTagDraft('')
  }
  const removeTag = (t) => onChange((n) => { n.tags = (n.tags || []).filter((x) => x !== t) })
  const setPriority = (p) => onChange((n) => { if (p) n.priority = p; else delete n.priority })

  return (
    <>
      <div className="node-pop-backdrop" onClick={onClose} />
      <div className="node-pop" style={{ '--accent': accent }} onClick={(e) => e.stopPropagation()}>
        <div className="pop-field">
          <label>Priority</label>
          <div className="pri-picker">
            {['p0', 'p1', 'p2', 'p3'].map((p) => (
              <span key={p} className={'pri-pill ' + p + (node.priority === p ? ' sel' : '')} onClick={() => setPriority(node.priority === p ? '' : p)}>
                <span className="pri-dot" />{p.toUpperCase()}
              </span>
            ))}
            <span className={'pri-none' + (!node.priority ? ' sel' : '')} onClick={() => setPriority('')}>none</span>
          </div>
        </div>

        <div className="pop-field">
          <label>Tags</label>
          <div className="tag-input">
            {(node.tags || []).map((t) => (
              <span key={t} className="tag-chip">{t}<span className="x" onClick={() => removeTag(t)}>×</span></span>
            ))}
            <input
              list="all-tags" value={tagDraft} placeholder="add tag…"
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagDraft) } }}
              onBlur={() => addTag(tagDraft)}
            />
            <datalist id="all-tags">{allTags.map((t) => <option key={t} value={t} />)}</datalist>
          </div>
        </div>

        <div className="pop-field">
          <label>Due date</label>
          <input type="date" value={node.due || ''} onChange={(e) => onChange((n) => { n.due = e.target.value })} />
        </div>

        <div className="pop-field">
          <label>Link</label>
          <input className="text" value={node.link || ''} placeholder="https://" onChange={(e) => onChange((n) => { n.link = e.target.value })} />
          {node.link && <a className="pop-link" href={node.link} target="_blank" rel="noreferrer">open ↗</a>}
        </div>

        <div className="pop-actions">
          <button onClick={onAddChild}>+ child</button>
          <button className="danger" onClick={onDelete}>delete</button>
        </div>
      </div>
    </>
  )
}

// ---- SVG path builders ----
// Smooth parent→child curve in the flow direction (control points along the primary axis).
function flowCurve(x1, y1, x2, y2, dir) {
  if (dir === 'TD') {
    const midY = (y1 + y2) / 2
    return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`
  }
  const midX = (x1 + x2) / 2
  return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`
}
// Dependency edge — gentle curve, routed along the flow axis so it reads cleanly.
function depFlow(x1, y1, x2, y2, dir) {
  if (dir === 'TD') {
    const dy = Math.max(24, Math.abs(y2 - y1) * 0.35)
    return `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`
  }
  const dx = Math.max(24, Math.abs(x2 - x1) * 0.35)
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
}
