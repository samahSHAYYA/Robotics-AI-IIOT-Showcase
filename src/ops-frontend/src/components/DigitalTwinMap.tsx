import type { RobotStatus } from '../types/telemetry'

interface DigitalTwinMapProps {
  robots: RobotStatus[]
  error?: string | null
}

const FACTORY_W = 600
const FACTORY_H = 400

export default function DigitalTwinMap({ robots, error }: DigitalTwinMapProps) {
  if (error) {
    return (
      <div class="digital-twin">
        <h3>Factory Floor</h3>
        <div class="error-banner">
          <span class="error-text">{error}</span>
        </div>
      </div>
    )
  }

  if (robots.length === 0) {
    return (
      <div class="digital-twin">
        <h3>Factory Floor</h3>
        <div class="empty-state">
          <div class="empty-state-text">Waiting for robot telemetry...</div>
        </div>
      </div>
    )
  }

  const scale = (v: number, max: number) => (v / max) * FACTORY_W

  return (
    <div class="digital-twin">
      <h3>Factory Floor</h3>
      <svg viewBox={`0 0 ${FACTORY_W} ${FACTORY_H}`} class="factory-svg">
        <rect x="0" y="0" width={FACTORY_W} height={FACTORY_H} fill="#1e293b" rx="8" />
        <line x1="200" y1="0" x2="200" y2={FACTORY_H} stroke="#334155" stroke-width="2" stroke-dasharray="8 4" />
        <line x1="400" y1="0" x2="400" y2={FACTORY_H} stroke="#334155" stroke-width="2" stroke-dasharray="8 4" />
        {robots.map((r) => {
          const cx = scale(r.pose.x, 10)
          const cy = scale(r.pose.y, 10)
          const color = r.status === 'active' ? '#22c55e' : r.status === 'error' ? '#ef4444' : '#6b7280'
          return (
            <g key={r.robot_id}>
              <circle cx={cx} cy={cy} r="12" fill={color} opacity="0.9" />
              <text x={cx} y={cy - 18} text-anchor="middle" fill="#e2e8f0" font-size="11">
                {r.robot_id}
              </text>
              <line
                x1={cx} y1={cy}
                x2={cx + 10 * Math.cos(r.pose.theta)}
                y2={cy + 10 * Math.sin(r.pose.theta)}
                stroke="#fff" stroke-width="2"
              />
            </g>
          )
        })}
      </svg>
    </div>
  )
}
