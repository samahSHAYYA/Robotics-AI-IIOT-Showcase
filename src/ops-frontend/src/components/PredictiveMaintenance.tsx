import { useEffect, useRef, useState } from 'react'
import type { RobotStatus } from '../types/telemetry'

interface PredictiveMaintenanceProps {
  robots: RobotStatus[]
}

const INTENSITY_MAP: Record<string, number> = {
  moving: 2.0,
  active: 2.0,
  idle: 0.3,
  maintenance: 1.5,
  error: 1.5,
  offline: 0.0,
}

function healthColor(rul: number): string {
  if (rul >= 70) return '#22c55e'
  if (rul >= 30) return '#eab308'
  return '#ef4444'
}

function maintenanceMsg(rul: number): string | null {
  if (rul < 15) return 'Immediate maintenance required!'
  if (rul < 30) return 'Schedule maintenance soon'
  return null
}

export default function PredictiveMaintenance({ robots }: PredictiveMaintenanceProps) {
  const wearRef = useRef<Record<string, number>>({})
  const [, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      const next: Record<string, number> = {}
      for (const r of robots) {
        const base = wearRef.current[r.robot_id] ?? 0
        const intensity = INTENSITY_MAP[r.status] ?? 0.3
        const increment = 0.5 * intensity * (r.uptime_pct / 100)
        next[r.robot_id] = Math.min(base + increment, 100)
      }
      wearRef.current = next
      setTick((v) => v + 1)
    }, 1000)
    return () => clearInterval(id)
  }, [robots])

  const handleAskAi = (robotName: string) => {
    window.dispatchEvent(new CustomEvent('chat-pre-fill', {
      detail: `What is the maintenance status of ${robotName}?`,
    }))
  }

  if (robots.length === 0) return null

  return (
    <div className="pm-widget">
      <div className="pm-list">
        {robots.map((r) => {
          const wear = wearRef.current[r.robot_id] ?? 0
          const rul = Math.max(0, Math.min(100, 100 - wear))
          const color = healthColor(rul)
          const msg = maintenanceMsg(rul)
          return (
            <div key={r.robot_id} className="pm-robot-row">
              <div className="pm-header">
                <span className="pm-name">{r.name}</span>
                <span className="pm-rul-label" style={{ color }}>
                  {rul.toFixed(1)}% RUL
                </span>
              </div>
              <div className="pm-health-bar">
                <div
                  className="pm-health-fill"
                  style={{ width: `${rul}%`, background: color }}
                />
              </div>
              {msg && <div className="pm-recommendation" style={{ color }}>{msg}</div>}
              <button className="pm-ask-btn" onClick={() => handleAskAi(r.name)}>
                Ask AI about maintenance
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
