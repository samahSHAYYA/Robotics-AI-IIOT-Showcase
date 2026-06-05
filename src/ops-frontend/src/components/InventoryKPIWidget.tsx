import { useEffect, useState } from 'react'
import { authFetch } from '../utils/auth-fetch'

interface InventorySummary {
  total_items: number
  total_quantity: number
  ok_stock: number
  low_stock: number
  critical_stock: number
  recent_movements_24h: number
  stock_health_pct: number
}

export default function InventoryKPIWidget() {
  const [data, setData] = useState<InventorySummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    authFetch('/api/v1/inventory/summary')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="widget-loading">Loading...</div>
  if (!data) return <div className="widget-error">No inventory data</div>

  return (
    <div className="kpi-widget">
      <h3 className="widget-title">Inventory Management</h3>
      <div className="kpi-widget-grid">
        <div className="kpi-mini-card">
          <span className="kpi-mini-value">{data.total_items}</span>
          <span className="kpi-mini-label">Total Items</span>
        </div>
        <div className="kpi-mini-card">
          <span className="kpi-mini-value" style={{ color: data.stock_health_pct >= 80 ? 'var(--ok)' : data.stock_health_pct >= 50 ? 'var(--warning)' : 'var(--critical)' }}>
            {data.stock_health_pct}%
          </span>
          <span className="kpi-mini-label">Stock Health</span>
        </div>
        <div className="kpi-mini-card">
          <span className="kpi-mini-value" style={{ color: data.low_stock > 0 ? 'var(--warning)' : 'var(--ok)' }}>
            {data.low_stock}
          </span>
          <span className="kpi-mini-label">Low Stock</span>
        </div>
        <div className="kpi-mini-card">
          <span className="kpi-mini-value" style={{ color: data.critical_stock > 0 ? 'var(--critical)' : 'var(--ok)' }}>
            {data.critical_stock}
          </span>
          <span className="kpi-mini-label">Critical</span>
        </div>
      </div>
    </div>
  )
}
