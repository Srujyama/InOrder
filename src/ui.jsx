// Small shared presentational components.

export function PriorityPill({ level }) {
  if (!level) return null
  return (
    <span className={'pri-pill ' + level}>
      <span className="pri-dot" />
      {level.toUpperCase()}
    </span>
  )
}
