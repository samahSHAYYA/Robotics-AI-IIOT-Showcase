import { useEffect, useState } from 'react'
import { authFetch } from '../utils/auth-fetch'

interface ShiftsSummary {
  total_shifts: number
  total_workers: number
  active_workers: number
  active_shifts: number
  worker_utilization: number
  workers_per_shift: Record<string, number>
}

export default function ShiftsKPIWidget() {
  const [data, setData] = useState<ShiftsSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    authFetch('/api/v1/shifts/summary')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="widget-loading">Loading...</div>
  if (!data) return <div className="widget-error">No shift data</div>

  return (
    <div className="kpi-widget">
      <h3 className="widget-title">Shift Scheduling</h3>
      <div className="kpi-widget-grid">
        <div className="kpi-mini-card">
          <span className="kpi-mini-value">{data.active_shifts}</span>
          <span className="kpi-mini-label">Active Shifts</span>
        </div>
        <div className="kpi-mini-card">
          <span className="kpi-mini-value">{data.active_workers}</span>
          <span className="kpi-mini-label">Active Workers</span>
        </div>
        <div className="kpi-mini-card">
          <span className="kpi-mini-value">{data.total_shifts}</span>
          <span className="kpi-mini-label">Total Shifts</span>
        </div>
        <div className="kpi-mini-card">
          <span className="kpi-mini-value">{data.worker_utilization}%</span>
          <span className="kpi-mini-label">Utilization</span>
        </div>
      </div>
    </div>
  )
}
