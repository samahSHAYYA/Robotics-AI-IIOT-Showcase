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
    <div className={`kpi-card ${severityClass}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">
        {value}
        {unit && <span className="kpi-unit">{unit}</span>}
      </div>
      {trend && <div className="kpi-trend">{trendIcon}</div>}
    </div>
  )
}
