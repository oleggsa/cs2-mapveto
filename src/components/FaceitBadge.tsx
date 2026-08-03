// Small circular level badge in the style of Faceit's own avatar overlay,
// with the exact ELO shown in a tooltip on hover.
const LEVEL_COLORS: Record<number, string> = {
  1: '#9d9d9d',
  2: '#9d9d9d',
  3: '#ffc107',
  4: '#ffc107',
  5: '#ff8a00',
  6: '#ff8a00',
  7: '#ff4444',
  8: '#ff4444',
  9: '#ff0000',
  10: '#ff0000',
}

interface Props {
  level: number | null | undefined
  elo?: number | null
}

export function FaceitBadge({ level, elo }: Props) {
  if (!level) return null
  const color = LEVEL_COLORS[level] ?? '#ff0000'
  const textColor = level <= 2 ? '#1a1a1a' : '#fff'

  return (
    <span className="faceit-badge" style={{ background: color, color: textColor }}>
      {level}
      {elo != null && <span className="faceit-badge-tooltip">{elo} ELO</span>}
    </span>
  )
}
