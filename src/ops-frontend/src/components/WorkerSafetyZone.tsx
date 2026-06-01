import { useState, useMemo } from 'react'
import type { WorkerStatus, RobotStatus } from '../types/telemetry'

const ZONES = [
  { id: 'assembly', label: 'Assembly Zone', color: '#22c55e', x: 2.5, y: 2.5, w: 3.5, h: 4.5 },
  { id: 'welding', label: 'Welding Bay', color: '#eab308', x: 5.0, y: 2.5, w: 3.5, h: 4.5 },
  { id: 'inspection', label: 'Inspection Zone', color: '#8b5cf6', x: 7.5, y: 2.5, w: 3.5, h: 4.5 },
]

const PROXIMITY_DIST = 2.0

interface WorkerSafetyZoneProps {
  workers: WorkerStatus[]
  robots: RobotStatus[]
  onToggleWorker?: (id: string) => void
}

function workerZoneColor(zone: string): string {
  const z = ZONES.find((z) => z.id === zone)
  return z ? z.color : '#6b7280'
}

export default function WorkerSafetyZone({ workers, robots, onToggleWorker }: WorkerSafetyZoneProps) {
  const [incidents, setIncidents] = useState<Array<{ worker: string; robot: string; time: string }>>([])
  const [showIncidents, setShowIncidents] = useState(false)

  const activeWorkers = useMemo(() => workers.filter((w) => w.active), [workers])

  const zoneCounts = useMemo(() => {
    const counts: Record<string, number> = { assembly: 0, welding: 0, inspection: 0 }
    for (const w of activeWorkers) {
      counts[w.zone] = (counts[w.zone] || 0) + 1
    }
    return counts
  }, [activeWorkers])

  const proximityAlerts = useMemo(() => {
    const alerts: Array<{ worker: string; robot: string }> = []
    for (const w of activeWorkers) {
      for (const r of robots) {
        const dx = w.x - r.pose.x
        const dy = w.y - r.pose.y
        if (Math.sqrt(dx * dx + dy * dy) < PROXIMITY_DIST) {
          alerts.push({ worker: w.name, robot: r.name })
        }
      }
    }
    return alerts
  }, [activeWorkers, robots])

  const handleLogIncident = () => {
    for (const a of proximityAlerts) {
      const exists = incidents.some(
        (i) => i.worker === a.worker && i.robot === a.robot && Date.now() - new Date(i.time).getTime() < 30000,
      )
      if (!exists) {
        setIncidents((prev) => [...prev, { ...a, time: new Date().toISOString() }].slice(-50))
      }
    }
  }

  if (incidents.length !== proximityAlerts.length) {
    setTimeout(handleLogIncident, 0)
  }

  const nearMissCount = proximityAlerts.length
  const safetyScore = Math.max(0, 100 - nearMissCount * 15 - (workers.filter((w) => !w.active).length * 5))

  return (
    <div className="worker-safety-zone">
      <div className="panel-head-row">
        <h3>Worker Safety Monitor</h3>
        <span className="safety-score" style={{ color: safetyScore > 80 ? '#22c55e' : safetyScore > 50 ? '#eab308' : '#ef4444' }}>
          {safetyScore}% Safe
        </span>
      </div>

      <div className="safety-grid">
        <div className="safety-metric">
          <span className="safety-metric-value">{activeWorkers.length}</span>
          <span className="safety-metric-label">Active Workers</span>
        </div>
        <div className="safety-metric">
          <span className="safety-metric-value" style={{ color: nearMissCount > 0 ? '#ef4444' : '#22c55e' }}>{nearMissCount}</span>
          <span className="safety-metric-label">Near Misses</span>
        </div>
        <div className="safety-metric">
          <span className="safety-metric-value">{workers.length}</span>
          <span className="safety-metric-label">Total Workers</span>
        </div>
      </div>

      <div className="safety-zone-list">
        {ZONES.map((zone) => {
          const count = zoneCounts[zone.id] || 0
          const maxWorkers = 3
          const capacityPct = Math.min(100, (count / maxWorkers) * 100)
          return (
            <div key={zone.id} className="safety-zone-row">
              <div className="safety-zone-header">
                <span className="safety-zone-dot" style={{ background: zone.color }} />
                <span className="safety-zone-name">{zone.label}</span>
                <span className="safety-zone-count">{count}/{maxWorkers}</span>
              </div>
              <div className="safety-zone-bar-bg">
                <div className="safety-zone-bar-fill" style={{ width: `${capacityPct}%`, background: zone.color }} />
              </div>
            </div>
          )
        })}
      </div>

      {activeWorkers.length > 0 && (
        <div className="safety-worker-list">
          <h4>Workers on Floor</h4>
          {activeWorkers.map((w) => (
            <div key={w.worker_id} className="safety-worker-row">
              <span className="safety-worker-dot" style={{ background: workerZoneColor(w.zone) }} />
              <span className="safety-worker-name">{w.name}</span>
              <span className="safety-worker-zone">{w.zone}</span>
            </div>
          ))}
        </div>
      )}

      {onToggleWorker && (
        <div className="safety-worker-controls">
          <h4>Worker Controls</h4>
          {workers.map((w) => (
            <label key={w.worker_id} className="safety-worker-toggle">
              <input type="checkbox" checked={w.active} onChange={() => onToggleWorker(w.worker_id)} />
              <span>{w.name}</span>
            </label>
          ))}
        </div>
      )}

      <div className="safety-incidents">
        <button className="safety-incidents-toggle" onClick={() => setShowIncidents(!showIncidents)}>
          {showIncidents ? 'Hide' : 'Show'} Incident Log ({incidents.length})
        </button>
        {showIncidents && (
          <div className="safety-incidents-log">
            {incidents.length === 0 ? (
              <div className="safety-incidents-empty">No incidents recorded</div>
            ) : (
              [...incidents].reverse().slice(0, 20).map((inc, i) => (
                <div key={`${inc.time}-${i}`} className="safety-incident-row">
                  <span className="safety-incident-icon">⚠</span>
                  <span className="safety-incident-text">
                    {inc.worker} near {inc.robot}
                  </span>
                  <span className="safety-incident-time">
                    {new Date(inc.time).toLocaleTimeString()}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
