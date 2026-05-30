import { useState, useEffect, useCallback } from 'react'

interface AnalyticsCurrent {
  avg_uptime: number
  alert_rate: number
  robot_utilization: number
}

interface HistoryPoint {
  timestamp: string
  avg_uptime: number
  alert_rate: number
  robot_utilization: number
}

function valueColor(current: number, type: 'uptime' | 'alert' | 'util'): string {
  if (type === 'uptime') return current >= 90 ? 'var(--ok)' : current >= 75 ? 'var(--warning)' : 'var(--critical)'
  if (type === 'alert') return current <= 5 ? 'var(--ok)' : current <= 15 ? 'var(--warning)' : 'var(--critical)'
  return current >= 80 ? 'var(--ok)' : current >= 60 ? 'var(--warning)' : 'var(--critical)'
}

function miniChartPath(data: number[], width: number, height: number): string {
  if (data.length < 2) return ''
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const stepX = width / (data.length - 1)
  return data.map((v, i) => {
    const x = i * stepX
    const y = height - ((v - min) / range) * (height - 4) - 2
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
}

export default function AnalyticsWidget() {
  const [current, setCurrent] = useState<AnalyticsCurrent | null>(null)
  const [history, setHistory] = useState<HistoryPoint[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const [curRes, histRes] = await Promise.all([
        fetch('/api/v1/analytics/current'),
        fetch('/api/v1/analytics/history'),
      ])
      if (curRes.ok) {
        const curData = await curRes.json()
        setCurrent(curData)
      }
      if (histRes.ok) {
        const histData = await histRes.json()
        setHistory(Array.isArray(histData) ? histData : histData.points ?? [])
      }
    } catch {
      /* silently fail */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, 5000)
    return () => clearInterval(id)
  }, [fetchData])

  if (loading) {
    return (
      <div className="analytics-widget">
        <div className="empty-state" style={{ padding: '0.5rem' }}>
          <div className="empty-state-text">Loading analytics...</div>
        </div>
      </div>
    )
  }

  const uptimePct = current ? current.avg_uptime : 0
  const alertRate = current ? current.alert_rate : 0
  const utilPct = current ? current.robot_utilization : 0

  const uptimePoints = history.map(h => h.avg_uptime)
  const alertPoints = history.map(h => h.alert_rate)
  const utilPoints = history.map(h => h.robot_utilization)

  return (
    <div className="analytics-widget">
      <h3>Analytics</h3>
      <div className="analytics-metrics">
        <div className="analytics-metric">
          <span className="analytics-metric-label">Avg Uptime</span>
          <span className="analytics-metric-value" style={{ color: valueColor(uptimePct, 'uptime') }}>
            {uptimePct.toFixed(1)}%
          </span>
        </div>
        <div className="analytics-metric">
          <span className="analytics-metric-label">Alert Rate</span>
          <span className="analytics-metric-value" style={{ color: valueColor(alertRate, 'alert') }}>
            {alertRate.toFixed(1)}/h
          </span>
        </div>
        <div className="analytics-metric">
          <span className="analytics-metric-label">Utilization</span>
          <span className="analytics-metric-value" style={{ color: valueColor(utilPct, 'util') }}>
            {utilPct.toFixed(1)}%
          </span>
        </div>
      </div>
      <div className="analytics-chart">
        <svg className="analytics-chart-svg" viewBox="0 0 200 50" preserveAspectRatio="none">
          {uptimePoints.length >= 2 && (
            <path d={miniChartPath(uptimePoints, 200, 50)} fill="none" stroke="var(--ok)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          )}
          {utilPoints.length >= 2 && (
            <path d={miniChartPath(utilPoints, 200, 50)} fill="none" stroke="var(--accent)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" opacity="0.6" />
          )}
          {alertPoints.length >= 2 && (
            <path d={miniChartPath(alertPoints, 200, 50)} fill="none" stroke="var(--critical)" strokeWidth="1" vectorEffect="non-scaling-stroke" opacity="0.5" strokeDasharray="2,2" />
          )}
        </svg>
      </div>
    </div>
  )
}
