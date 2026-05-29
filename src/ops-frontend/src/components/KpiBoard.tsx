import GaugeCard from './GaugeCard'
import type { TelemetrySnapshot } from '../types/telemetry'

interface KpiBoardProps {
  telemetry?: TelemetrySnapshot
  error?: string | null
  onRetry?: () => void
}

export default function KpiBoard({ telemetry, error, onRetry }: KpiBoardProps) {
  if (error) {
    return (
      <div class="kpi-board">
        <div class="error-banner">
          <span class="error-text">{error}</span>
          {onRetry && <button class="btn-retry" onClick={onRetry}>Retry</button>}
        </div>
      </div>
    )
  }

  if (!telemetry) {
    return (
      <div class="skeleton-board">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} class="skeleton-card">
            <div class="skeleton-gauge" />
            <div class="skeleton-label" />
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
    <div class="kpi-board">
      <GaugeCard label="Throughput" value={throughput} unit="units" max={5000} threshold_warn={3000} threshold_crit={1000} />
      <GaugeCard label="Defect Rate" value={defectRate} unit="%" max={10} threshold_warn={3} threshold_crit={7} />
      <GaugeCard label="Robot Uptime" value={uptime} unit="%" threshold_warn={90} threshold_crit={80} />
      <GaugeCard label="Active Robots" value={robotCount} unit="bots" max={20} threshold_warn={5} threshold_crit={2} />
    </div>
  )
}
