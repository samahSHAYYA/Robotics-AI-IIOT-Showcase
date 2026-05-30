import { useState, useEffect, useRef } from 'react'
import type { RobotStatus } from '../types/telemetry'

interface EnergyWidgetProps {
  robots: RobotStatus[]
}

const statusColors: Record<string, string> = {
  idle: '#6b7280',
  active: '#22c55e',
  moving: '#22c55e',
  maintenance: '#eab308',
  error: '#ef4444',
  offline: '#9ca3af',
}

function getEnergyRange(status: RobotStatus['status']): [number, number] {
  switch (status) {
    case 'moving':
    case 'active':
      return [40, 80]
    case 'idle':
      return [5, 15]
    case 'error':
    case 'maintenance':
      return [10, 20]
    case 'offline':
      return [0, 0]
  }
}

function randBetween(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) * 10) / 10
}

export default function EnergyWidget({ robots }: EnergyWidgetProps) {
  const [energyMap, setEnergyMap] = useState<Record<string, number>>({})
  const robotsRef = useRef(robots)

  robotsRef.current = robots

  useEffect(() => {
    const id = setInterval(() => {
      const next: Record<string, number> = {}
      for (const r of robotsRef.current) {
        const [min, max] = getEnergyRange(r.status)
        next[r.robot_id] = randBetween(min, max)
      }
      setEnergyMap(next)
    }, 2000)

    return () => clearInterval(id)
  }, [])

  if (robots.length === 0) return null

  const maxEnergy = 80

  return (
    <div className="energy-widget">
      <div className="energy-bars">
        {robots.map((r) => {
          const value = energyMap[r.robot_id] ?? 0
          const pct = Math.min((value / maxEnergy) * 100, 100)
          const color = statusColors[r.status] ?? '#6b7280'
          return (
            <div key={r.robot_id} className="energy-bar-row">
              <span className="energy-bar-label">
                <span style={{ color }}>●</span> {r.name}
              </span>
              <div className="energy-bar-track">
                <div
                  className="energy-bar-fill"
                  style={{ width: `${pct}%`, background: color }}
                />
              </div>
              <span className="energy-bar-value">{value.toFixed(1)} kW</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
