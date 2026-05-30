import { useState, useEffect, useCallback } from 'react'
import type { RobotStatus } from '../types/telemetry'

interface ShiftSchedulerProps {
  robots: RobotStatus[]
  onAssignTask: (id: string, task: string) => void
}

type Shift = 'morning' | 'afternoon' | 'night'

const SHIFT_CONFIG: Record<Shift, { label: string; hours: string }> = {
  morning: { label: 'Morning', hours: '06:00 – 14:00' },
  afternoon: { label: 'Afternoon', hours: '14:00 – 22:00' },
  night: { label: 'Night', hours: '22:00 – 06:00' },
}

function loadAssignments(): Record<string, Shift> {
  try {
    const raw = localStorage.getItem('shiftAssignments')
    if (raw) return JSON.parse(raw)
  } catch { }
  return {}
}

function saveAssignments(a: Record<string, Shift>) {
  try { localStorage.setItem('shiftAssignments', JSON.stringify(a)) } catch { }
}

function currentShift(): Shift {
  const h = new Date().getHours()
  if (h >= 6 && h < 14) return 'morning'
  if (h >= 14 && h < 22) return 'afternoon'
  return 'night'
}

export default function ShiftScheduler({ robots, onAssignTask }: ShiftSchedulerProps) {
  const [assignments, setAssignments] = useState<Record<string, Shift>>(loadAssignments)
  const [activeShift, setActiveShift] = useState<Shift>(currentShift)
  const [animatingId, setAnimatingId] = useState<string | null>(null)

  useEffect(() => {
    const id = setInterval(() => setActiveShift(currentShift()), 60000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    saveAssignments(assignments)
  }, [assignments])

  const getRobotShift = useCallback((robotId: string): Shift => {
    return assignments[robotId] ?? 'morning'
  }, [assignments])

  const changeShift = useCallback((robotId: string, newShift: Shift) => {
    setAnimatingId(robotId)
    setAssignments(prev => ({ ...prev, [robotId]: newShift }))
    const taskNames: Record<Shift, string> = {
      morning: 'production-line-a',
      afternoon: 'production-line-b',
      night: 'maintenance-round',
    }
    onAssignTask(robotId, taskNames[newShift])
    setTimeout(() => setAnimatingId(null), 400)
  }, [onAssignTask])

  const shifts: Shift[] = ['morning', 'afternoon', 'night']

  return (
    <div className="shift-scheduler">
      <h3>Shift Scheduler</h3>
      <div className="shift-columns">
        {shifts.map(shift => {
          const isActive = shift === activeShift
          const assignedRobots = robots.filter(r => getRobotShift(r.robot_id) === shift)
          return (
            <div
              key={shift}
              className={`shift-column${isActive ? ' shift-column--active' : ''}`}
            >
              <div className="shift-header">
                <span className="shift-title">{SHIFT_CONFIG[shift].label}</span>
                <span className="shift-hours">{SHIFT_CONFIG[shift].hours}</span>
                {isActive && <span className="shift-badge">Now</span>}
              </div>
              <div className="shift-robot-list">
                {assignedRobots.length === 0 && (
                  <div className="shift-empty">No robots assigned</div>
                )}
                {assignedRobots.map(r => (
                  <div
                    key={r.robot_id}
                    className={`shift-robot-card${animatingId === r.robot_id ? ' shift-robot-card--animating' : ''}`}
                  >
                    <div className="shift-robot-info">
                      <span className="shift-robot-name">{r.name}</span>
                      <span className={`robot-status robot-status--${r.status}`}>{r.status}</span>
                    </div>
                    <div className="shift-robot-actions">
                      {shifts.filter(s => s !== shift).map(s => (
                        <button
                          key={s}
                          className="shift-move-btn"
                          onClick={() => changeShift(r.robot_id, s)}
                          title={`Move to ${SHIFT_CONFIG[s].label}`}
                        >
                          {SHIFT_CONFIG[s].label[0]}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
