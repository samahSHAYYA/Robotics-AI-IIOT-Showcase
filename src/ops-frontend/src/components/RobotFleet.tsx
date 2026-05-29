import type { RobotStatus } from '../types/telemetry'

interface RobotFleetProps {
  robots: RobotStatus[]
}

const statusColors: Record<string, string> = {
  idle: '#6b7280',
  active: '#22c55e',
  maintenance: '#eab308',
  error: '#ef4444',
  offline: '#9ca3af',
}

export default function RobotFleet({ robots }: RobotFleetProps) {
  return (
    <div class="robot-fleet">
      <h3>Robot Fleet</h3>
      <div class="fleet-grid">
        {robots.length === 0 && <div class="fleet-empty">No robots connected</div>}
        {robots.map((r) => (
          <div key={r.robot_id} class="robot-card">
            <div class="robot-header">
              <span class="robot-name">{r.name}</span>
              <span class="robot-status" style={{ backgroundColor: statusColors[r.status] ?? '#6b7280' }}>
                {r.status}
              </span>
            </div>
            <div class="robot-pose">
              ({r.pose.x.toFixed(1)}, {r.pose.y.toFixed(1)}, {r.pose.theta.toFixed(1)}°)
            </div>
            <div class="robot-task">Task: {r.current_task ?? 'none'}</div>
            <div class="robot-uptime">Uptime: {r.uptime_pct.toFixed(1)}%</div>
          </div>
        ))}
      </div>
    </div>
  )
}
