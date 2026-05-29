import { useState } from 'react'

interface CommandConsoleProps {
  onStartRobot: (id: string) => void
  onStopRobot: (id: string) => void
  onAssignTask: (id: string, task: string) => void
}

const ROBOTS = [
  { value: 'C3', label: 'C3 Humanoid' },
  { value: 'W2', label: 'W2 Welder Arm' },
  { value: 'Q1', label: 'Q1 Inspector' },
]

export default function CommandConsole({
  onStartRobot,
  onStopRobot,
  onAssignTask,
}: CommandConsoleProps) {
  const [robotId, setRobotId] = useState('C3')
  const [task, setTask] = useState('')

  const handleStart = (e: React.MouseEvent) => {
    e.preventDefault()
    onStartRobot(robotId)
  }

  const handleStop = (e: React.MouseEvent) => {
    e.preventDefault()
    onStopRobot(robotId)
  }

  const handleTask = (e: React.FormEvent) => {
    e.preventDefault()
    if (task.trim()) {
      onAssignTask(robotId, task.trim())
      setTask('')
    }
  }

  return (
    <div className="command-console">
      <h3>Command Console</h3>
      <div className="command-row">
        <label>
          Robot
          <select value={robotId} onChange={(e) => setRobotId(e.target.value)}>
            {ROBOTS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </label>
        <button className="btn-start" onClick={handleStart}>Start</button>
        <button className="btn-stop" onClick={handleStop}>Stop</button>
      </div>
      <form className="task-row" onSubmit={handleTask}>
        <label>
          Assign Task
          <input
            type="text"
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="e.g. Assembly Line B"
          />
        </label>
        <button type="submit" className="btn-send">Assign</button>
      </form>
    </div>
  )
}
