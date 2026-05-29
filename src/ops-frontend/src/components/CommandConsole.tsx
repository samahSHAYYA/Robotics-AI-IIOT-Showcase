import { useState } from 'react'
import type { CommandPayload } from '../types/telemetry'

interface CommandConsoleProps {
  onSendCommand: (cmd: CommandPayload) => void
}

const COMMANDS = [
  { value: 'start_task', label: 'Start Task' },
  { value: 'stop_task', label: 'Stop Task' },
  { value: 'emergency_stop', label: 'Emergency Stop' },
  { value: 'return_to_base', label: 'Return to Base' },
  { value: 'pause', label: 'Pause' },
  { value: 'resume', label: 'Resume' },
]

export default function CommandConsole({ onSendCommand }: CommandConsoleProps) {
  const [robotId, setRobotId] = useState('robot-01')
  const [command, setCommand] = useState(COMMANDS[0].value)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSendCommand({ command, robot_id: robotId, parameters: {} })
  }

  return (
    <form class="command-console" onSubmit={handleSubmit}>
      <h3>Command Console</h3>
      <div class="command-row">
        <label>
          Robot
          <select value={robotId} onChange={(e) => setRobotId(e.target.value)}>
            <option value="robot-01">robot-01</option>
            <option value="robot-02">robot-02</option>
            <option value="robot-03">robot-03</option>
          </select>
        </label>
        <label>
          Command
          <select value={command} onChange={(e) => setCommand(e.target.value)}>
            {COMMANDS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </label>
        <button type="submit" class="btn-send">Send</button>
      </div>
    </form>
  )
}
