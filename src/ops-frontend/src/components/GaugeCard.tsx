interface GaugeCardProps {
  label: string
  value: number
  unit: string
  min?: number
  max?: number
  threshold_warn?: number
  threshold_crit?: number
  diff?: { value: number; direction: 'up' | 'down' } | null
}

function polarToCartesian(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function describeArc(cx: number, cy: number, r: number, start: number, end: number) {
  const s = polarToCartesian(cx, cy, r, start)
  const e = polarToCartesian(cx, cy, r, end)
  const large = end - start > 180 ? 1 : 0
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`
}

const STOPS = [
  { pos: 0, color: '#22c55e' },
  { pos: 50, color: '#eab308' },
  { pos: 100, color: '#ef4444' },
]

function valueColor(val: number): string {
  if (val < 50) return STOPS[0].color
  if (val < 75) return STOPS[1].color
  return STOPS[2].color
}

export default function GaugeCard({
  label, value, unit, min = 0, max = 100,
  threshold_warn = 70, threshold_crit = 90,
  diff,
}: GaugeCardProps) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))
  const color = valueColor(pct)
  const cx = 80, cy = 80, r = 60

  return (
    <div className="gauge-card">
      <svg viewBox="0 0 160 130" className="gauge-svg">
        <defs>
          <linearGradient id={`grad-${label.replace(/\s/g, '')}`} x1="0%" y1="0%" x2="100%" y2="0%">
            {STOPS.map((s) => (
              <stop key={s.pos} offset={`${s.pos}%`} stopColor={s.color} />
            ))}
          </linearGradient>
        </defs>
        <path d={describeArc(cx, cy, r, 210, 330)} fill="none" stroke="#1e293b" strokeWidth="10" strokeLinecap="round" />
        <path
          d={describeArc(cx, cy, r, 210, 210 + pct * 1.2)}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          className="gauge-arc"
        />
        {value >= threshold_warn && value < threshold_crit && (
          <path
            d={describeArc(cx, cy, r, 210 + threshold_warn * 1.2, 210 + threshold_crit * 1.2)}
            fill="none"
            stroke="#eab308"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray="4 4"
            opacity="0.5"
          />
        )}
        <text x={cx} y={cy - 4} textAnchor="middle" fill="#e2e8f0" fontSize="22" fontWeight="700">
          {value.toFixed(1)}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" fill="#94a3b8" fontSize="11">{unit}</text>
      </svg>
      <div className="gauge-label">
        {label}
        {diff && (
          <span className={`tm-diff-badge tm-diff-badge--${diff.direction}`}>
            <span className="tm-diff-arrow">{diff.direction === 'up' ? '↑' : '↓'}</span>
            {diff.value.toFixed(1)}
          </span>
        )}
      </div>
    </div>
  )
}
