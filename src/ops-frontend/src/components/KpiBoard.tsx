import GaugeCard from './GaugeCard'
import type { TelemetrySnapshot } from '../types/telemetry'

interface KpiBoardProps {
  telemetry?: TelemetrySnapshot
  error?: string | null
  onRetry?: () => void
  diffs?: Record<string, { value: number; direction: 'up' | 'down' }>
}

export default function KpiBoard({ telemetry, error, onRetry, diffs }: KpiBoardProps) {
  if (error) {
    return (
      <div className="kpi-board">
        <div className="error-banner">
          <span className="error-text">{error}</span>
          {onRetry && <button className="btn-retry" onClick={onRetry}>Retry</button>}
        </div>
      </div>
    )
  }

  if (!telemetry) {
    return (
      <div className="skeleton-board">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton-card">
            <div className="skeleton-gauge" />
            <div className="skeleton-label" />
          </div>
        ))}
      </div>
    )
  }

  const throughput = telemetry.throughput ?? 0
  const defectRate = telemetry.defect_rate_pct ?? 0
  const uptime = telemetry.robot_uptime_pct ?? 100
  const robotCount = telemetry.robots?.length ?? 0

  return (
    <div className="kpi-board">
      <GaugeCard label="Throughput" value={throughput} unit="units" max={5000} threshold_warn={3000} threshold_crit={1000} diff={diffs?.['Throughput'] ?? null} />
      <GaugeCard label="Defect Rate" value={defectRate} unit="%" max={10} threshold_warn={3} threshold_crit={7} diff={diffs?.['Defect Rate'] ?? null} />
      <GaugeCard label="Robot Uptime" value={uptime} unit="%" threshold_warn={90} threshold_crit={80} diff={diffs?.['Robot Uptime'] ?? null} />
      <GaugeCard label="Active Robots" value={robotCount} unit="bots" max={20} threshold_warn={5} threshold_crit={2} diff={diffs?.['Active Robots'] ?? null} />
    </div>
  )
}
