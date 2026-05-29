import type { ChartConfig } from '../types/agent'

interface TelemetryChartProps {
  config: ChartConfig
}

const COLORS = ['#3b82f6', '#22c55e', '#eab308', '#ef4444', '#a855f7']
const W = 400
const H = 180
const PAD = { top: 20, right: 16, bottom: 30, left: 44 }

function seriesToPath(data: { timestamp: string; value: number }[], color: string, xScale: (i: number) => number, yScale: (v: number) => number) {
  if (data.length === 0) return null
  const pts = data.map((d, i) => `${xScale(i)},${yScale(d.value)}`)
  return <polyline key={color} points={pts.join(' ')} fill="none" stroke={color} stroke-width="2" stroke-linejoin="round" />
}

export default function TelemetryChart({ config }: TelemetryChartProps) {
  const allValues = config.series.flatMap((s) => s.data.map((d) => d.value))
  if (allValues.length === 0) return null

  const minY = Math.min(...allValues) * 0.9
  const maxY = Math.max(...allValues) * 1.1
  const yRange = maxY - minY || 1
  const maxPoints = Math.max(...config.series.map((s) => s.data.length))

  const xScale = (i: number) => PAD.left + (i / Math.max(maxPoints - 1, 1)) * (W - PAD.left - PAD.right)
  const yScale = (v: number) => PAD.top + ((maxY - v) / yRange) * (H - PAD.top - PAD.bottom)

  const yTicks = []
  for (let i = 0; i <= 4; i++) {
    const v = minY + (yRange * i) / 4
    yTicks.push(v)
  }

  return (
    <div className="telemetry-chart">
      <div className="chart-title">{config.title}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg">
        {/* Grid lines */}
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} y1={yScale(v)} x2={W - PAD.right} y2={yScale(v)} stroke="#334155" stroke-width="1" />
            <text x={PAD.left - 6} y={yScale(v) + 3} text-anchor="end" fill="#94a3b8" font-size="10">
              {v.toFixed(0)}
            </text>
          </g>
        ))}
        {/* Series */}
        {config.series.map((s, i) => seriesToPath(s.data, COLORS[i % COLORS.length], xScale, yScale))}
        {/* Legend */}
        {config.series.length > 1 && (
          <g>
            {config.series.map((s, i) => (
              <g key={s.name} transform={`translate(${PAD.left + 8 + i * 120}, ${H - 6})`}>
                <rect x={0} y={-6} width={8} height={8} rx={2} fill={COLORS[i % COLORS.length]} />
                <text x={12} y={0} fill="#94a3b8" font-size="9">{s.name}</text>
              </g>
            ))}
          </g>
        )}
        {/* Y-axis label */}
        <text
          x={8}
          y={H / 2}
          text-anchor="middle"
          fill="#94a3b8"
          font-size="9"
          transform={`rotate(-90, 8, ${H / 2})`}
        >
          {config.y_label}
        </text>
      </svg>
    </div>
  )
}
