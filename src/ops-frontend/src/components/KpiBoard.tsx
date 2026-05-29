import GaugeCard from './GaugeCard'
import type { TelemetrySnapshot } from '../types/telemetry'

interface KpiBoardProps {
  telemetry?: TelemetrySnapshot
}

export default function KpiBoard({ telemetry }: KpiBoardProps) {
  const cpuTemp = telemetry?.cpu_temp_c ?? 45
  const battery = telemetry?.battery_pct ?? 85
  const motorLoad = telemetry?.motor_load_pct ?? 40
  const latency = telemetry?.network_latency_ms ?? 15

  return (
    <div class="kpi-board">
      <GaugeCard label="CPU Temperature" value={cpuTemp} unit="°C" max={100} threshold_warn={60} threshold_crit={80} />
      <GaugeCard label="Battery" value={battery} unit="%" threshold_warn={40} threshold_crit={20} />
      <GaugeCard label="Motor Load" value={motorLoad} unit="%" threshold_warn={70} threshold_crit={90} />
      <GaugeCard label="Network Latency" value={latency} unit="ms" max={300} threshold_warn={100} threshold_crit={200} />
    </div>
  )
}
