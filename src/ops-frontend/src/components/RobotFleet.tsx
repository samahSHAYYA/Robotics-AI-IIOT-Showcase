import type { RobotStatus } from '../types/telemetry'

interface RobotFleetProps {
  robots: RobotStatus[]
  error?: string | null
  highlightedRobotId?: string | null
  role?: string
}

const statusColors: Record<string, string> = {
  idle: '#6b7280',
  active: '#22c55e',
  moving: '#22c55e',
  maintenance: '#eab308',
  error: '#ef4444',
  offline: '#9ca3af',
}

export default function RobotFleet({ robots, error, highlightedRobotId }: RobotFleetProps) {
  if (error) {
    return (
      <div className="robot-fleet">
        <h3>Robot Fleet</h3>
        <div className="error-banner">
          <span className="error-text">{error}</span>
        </div>
      </div>
    )
  }

  if (robots.length === 0) {
    return (
      <div className="robot-fleet">
        <h3>Robot Fleet</h3>
        <div className="empty-state">
          <div className="empty-state-icon">🤖</div>
          <div className="empty-state-text">No robots connected</div>
        </div>
      </div>
    )
  }

  return (
    <div className="robot-fleet">
      <h3>Robot Fleet</h3>
      <div className="fleet-grid">
        {robots.map((r) => (
          <div
            key={r.robot_id}
            className="robot-card"
            style={r.robot_id === highlightedRobotId ? { borderColor: '#3b82f6', borderWidth: '2px', background: 'rgba(59,130,246,0.08)' } : undefined}
          >
            <div className="robot-header">
              <span className="robot-name">{r.name}</span>
              <span className="robot-status" style={{ backgroundColor: statusColors[r.status] ?? '#6b7280' }}>
                {r.status}
              </span>
            </div>
            <div className="robot-pose">
              ({r.pose.x.toFixed(1)}, {r.pose.y.toFixed(1)}, {r.pose.theta.toFixed(1)}°)
            </div>
            <div className="robot-task">Task: {r.current_task ?? 'none'}</div>
            <div className="robot-uptime">Uptime: {r.uptime_pct.toFixed(1)}%</div>
          </div>
        ))}
      </div>
    </div>
  )
}
