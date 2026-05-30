import { useState, useRef, useCallback } from 'react'
import type { RobotStatus } from '../types/telemetry'

interface OEEWidgetProps {
  robots: RobotStatus[]
}

interface OEEData {
  availability: number
  performance: number
  quality: number
  oee: number
}

function availabilityFromStatus(status: RobotStatus['status']): number {
  switch (status) {
    case 'active':
    case 'moving':
      return 0.98
    case 'idle':
    case 'offline':
      return 0.20
    case 'error':
    case 'maintenance':
      return 0.90
  }
}

function randomBetween(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) * 1000) / 1000
}

function computeOEE(r: RobotStatus): OEEData {
  const availability = availabilityFromStatus(r.status)
  const performance = randomBetween(0.85, 0.98)
  const quality = randomBetween(0.92, 0.99)
  const oee = Math.round(availability * performance * quality * 10000) / 100
  return { availability, performance, quality, oee }
}

function oeeColor(oee: number): string {
  if (oee >= 85) return '#22c55e'
  if (oee >= 70) return '#eab308'
  return '#ef4444'
}

export default function OEEWidget({ robots }: OEEWidgetProps) {
  const dataRef = useRef<Record<string, OEEData>>({})
  const [expanded, setExpanded] = useState(false)
  const [, forceUpdate] = useState(0)

  const refresh = useCallback(() => {
    const next: Record<string, OEEData> = {}
    for (const r of robots) {
      next[r.robot_id] = computeOEE(r)
    }
    dataRef.current = next
    forceUpdate((v) => v + 1)
  }, [robots])

  if (robots.length === 0) return null

  const allOee = robots.map((r) => {
    if (!dataRef.current[r.robot_id]) {
      dataRef.current[r.robot_id] = computeOEE(r)
    }
    return dataRef.current[r.robot_id]
  })

  const avgOee = allOee.length > 0
    ? Math.round((allOee.reduce((s, d) => s + d.oee, 0) / allOee.length) * 100) / 100
    : 0

  const color = oeeColor(avgOee)
  const trendUp = randomBetween(0, 1) > 0.5

  return (
    <div className="oee-widget">
      <div className="oee-header-row">
        <h3>Overall OEE</h3>
        <button className="oee-refresh-btn" onClick={refresh}>↻</button>
      </div>
      <div className="oee-gauge">
        <div className="oee-value" style={{ color }}>
          {avgOee.toFixed(1)}%
        </div>
        <span className={`oee-trend ${trendUp ? 'oee-trend--up' : 'oee-trend--down'}`}>
          {trendUp ? '↑' : '↓'}
        </span>
      </div>
      <div className="oee-bars">
        <div className="oee-bar-row">
          <span className="oee-bar-label">Availability</span>
          <div className="oee-bar-track">
            <div
              className="oee-bar-fill"
              style={{ width: `${allOee.reduce((s, d) => s + d.availability, 0) / allOee.length * 100}%`, background: '#3b82f6' }}
            />
          </div>
          <span className="oee-sub">{(allOee.reduce((s, d) => s + d.availability, 0) / allOee.length * 100).toFixed(1)}%</span>
        </div>
        <div className="oee-bar-row">
          <span className="oee-bar-label">Performance</span>
          <div className="oee-bar-track">
            <div
              className="oee-bar-fill"
              style={{ width: `${allOee.reduce((s, d) => s + d.performance, 0) / allOee.length * 100}%`, background: '#8b5cf6' }}
            />
          </div>
          <span className="oee-sub">{(allOee.reduce((s, d) => s + d.performance, 0) / allOee.length * 100).toFixed(1)}%</span>
        </div>
        <div className="oee-bar-row">
          <span className="oee-bar-label">Quality</span>
          <div className="oee-bar-track">
            <div
              className="oee-bar-fill"
              style={{ width: `${allOee.reduce((s, d) => s + d.quality, 0) / allOee.length * 100}%`, background: '#22c55e' }}
            />
          </div>
          <span className="oee-sub">{(allOee.reduce((s, d) => s + d.quality, 0) / allOee.length * 100).toFixed(1)}%</span>
        </div>
      </div>
      <button className="oee-breakdown-toggle" onClick={() => setExpanded((p) => !p)}>
        {expanded ? 'Hide' : 'Show'} per-robot breakdown
      </button>
      {expanded && (
        <div className="oee-breakdown">
          {robots.map((r) => {
            const d = dataRef.current[r.robot_id] ?? computeOEE(r)
            const rc = oeeColor(d.oee)
            return (
              <div key={r.robot_id} className="oee-robot-row">
                <span className="oee-robot-name">{r.name}</span>
                <span className="oee-robot-oee" style={{ color: rc }}>{d.oee.toFixed(1)}%</span>
                <span className="oee-robot-sub">A:{d.availability.toFixed(2)} P:{d.performance.toFixed(2)} Q:{d.quality.toFixed(2)}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
