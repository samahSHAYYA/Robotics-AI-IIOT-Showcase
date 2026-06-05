import { useEffect, useState } from 'react'
import { authFetch } from '../utils/auth-fetch'

interface IntegrationsSummary {
  total_integrations: number
  active_integrations: number
  failed_sync: number
  success_sync: number
  health_pct: number
  by_type: Record<string, number>
}

export default function IntegrationsKPIWidget() {
  const [data, setData] = useState<IntegrationsSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    authFetch('/api/v1/integrations/summary')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="widget-loading">Loading...</div>
  if (!data) return <div className="widget-error">No integration data</div>

  return (
    <div className="kpi-widget">
      <h3 className="widget-title">Integration Service</h3>
      <div className="kpi-widget-grid">
        <div className="kpi-mini-card">
          <span className="kpi-mini-value">{data.active_integrations}</span>
          <span className="kpi-mini-label">Active</span>
        </div>
        <div className="kpi-mini-card">
          <span className="kpi-mini-value" style={{ color: data.health_pct >= 90 ? 'var(--ok)' : data.health_pct >= 70 ? 'var(--warning)' : 'var(--critical)' }}>
            {data.health_pct}%
          </span>
          <span className="kpi-mini-label">Health</span>
        </div>
        <div className="kpi-mini-card">
          <span className="kpi-mini-value" style={{ color: data.failed_sync > 0 ? 'var(--critical)' : 'var(--ok)' }}>
            {data.failed_sync}
          </span>
          <span className="kpi-mini-label">Failed Sync</span>
        </div>
        <div className="kpi-mini-card">
          <span className="kpi-mini-value">{data.total_integrations}</span>
          <span className="kpi-mini-label">Total</span>
        </div>
      </div>
    </div>
  )
}
