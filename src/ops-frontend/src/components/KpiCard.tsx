interface KpiCardProps {
  label: string
  value: string | number
  unit?: string
  trend?: 'up' | 'down' | 'stable'
  severity?: 'ok' | 'warning' | 'critical'
}

export default function KpiCard({ label, value, unit, trend, severity }: KpiCardProps) {
  const trendIcon = trend === 'up' ? '\u2191' : trend === 'down' ? '\u2193' : '\u2192'
  const severityClass = severity === 'critical' ? 'kpi--critical' : severity === 'warning' ? 'kpi--warning' : ''

  return (
    <div class={`kpi-card ${severityClass}`}>
      <div class="kpi-label">{label}</div>
      <div class="kpi-value">
        {value}
        {unit && <span class="kpi-unit">{unit}</span>}
      </div>
      {trend && <div class="kpi-trend">{trendIcon}</div>}
    </div>
  )
}
