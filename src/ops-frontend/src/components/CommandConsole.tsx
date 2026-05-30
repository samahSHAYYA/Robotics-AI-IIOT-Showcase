import { useState } from 'react'

interface CommandConsoleProps {
  role?: string
  onStartRobot: (id: string) => void
  onStopRobot: (id: string) => void
  onAssignTask: (id: string, task: string) => void
  onEmergencyStop: (id: string) => void
}

const ROBOTS = [
  { value: 'C3', label: 'C3 Humanoid' },
  { value: 'W2', label: 'W2 Welder Arm' },
  { value: 'Q1', label: 'Q1 Inspector' },
]

const QUICK_TASKS = [
  'Assembly Line A',
  'Assembly Line B',
  'Welding Station 3',
  'Visual Inspection',
  'Quality Check',
  'Material Handling',
  'Packaging Zone',
  'Charging Station',
  'Maintenance Bay',
]

export default function CommandConsole({
  role,
  onStartRobot,
  onStopRobot,
  onAssignTask,
  onEmergencyStop,
}: CommandConsoleProps) {
  const [robotId, setRobotId] = useState('C3')
  const [task, setTask] = useState('')

  const isViewer = role === 'viewer'

  return (
    <div className={`command-console ${isViewer ? 'command-console--readonly' : ''}`}>
      <h3>Command Console</h3>

      <label className="cc-select-label">
        Robot
        <select value={robotId} onChange={(e) => setRobotId(e.target.value)} disabled={isViewer}>
          {ROBOTS.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </label>

      <div className="cc-btn-row">
        <button className="btn-start" onClick={() => onStartRobot(robotId)} title="Resume movement" disabled={isViewer}>
          ▶ Resume
        </button>
        <button className="btn-stop" onClick={() => onStopRobot(robotId)} title="Pause movement" disabled={isViewer}>
          ⏸ Pause
        </button>
        <button className="btn-danger" onClick={() => onEmergencyStop(robotId)} title="Emergency stop" disabled={isViewer}>
          ⚠ E-Stop
        </button>
      </div>

      <button
        className="btn-base"
        onClick={() => onAssignTask(robotId, 'Returning to Base')}
        disabled={isViewer}
      >
        ↲ Return to Base
      </button>

      <label className="cc-select-label">
        Quick Task
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) {
              onAssignTask(robotId, e.target.value)
            }
          }}
          disabled={isViewer}
        >
          <option value="">— select —</option>
          {QUICK_TASKS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </label>

      <form
        className="task-row"
        onSubmit={(e) => {
          e.preventDefault()
          if (task.trim()) {
            onAssignTask(robotId, task.trim())
            setTask('')
          }
        }}
      >
        <label className="cc-input-label">
          Custom Task
          <input
            type="text"
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="e.g. Zone B inspection"
            disabled={isViewer}
          />
        </label>
        <button type="submit" className="btn-send" disabled={isViewer}>Assign</button>
      </form>
    </div>
  )
}
