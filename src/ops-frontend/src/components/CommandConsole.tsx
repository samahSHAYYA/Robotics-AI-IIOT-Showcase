import { useState, useRef, useCallback } from 'react'
import { useI18n } from '../contexts/I18nContext'

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

type ActionId = 'resume' | 'pause' | 'estop' | 'return' | 'assign' | null
const FEEDBACK_MS = 1400

export default function CommandConsole({
  role,
  onStartRobot,
  onStopRobot,
  onAssignTask,
  onEmergencyStop,
}: CommandConsoleProps) {
  const { t } = useI18n()
  const [robotId, setRobotId] = useState('C3')
  const [task, setTask] = useState('')
  const [quickTask, setQuickTask] = useState('')
  const [feedback, setFeedback] = useState<ActionId>(null)
  const fbTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const act = useCallback((id: ActionId, fn: () => void) => {
    if (id === null) return
    if (fbTimer.current) clearTimeout(fbTimer.current)
    fn()
    setFeedback(id)
    fbTimer.current = setTimeout(() => setFeedback(null), FEEDBACK_MS)
  }, [])

  const isViewer = role === 'viewer'
  const busy = feedback !== null

  const btnClass = (id: ActionId, base: string) =>
    `${base}${feedback === id ? ` ${base}--done` : ''}${busy && feedback !== id ? ` ${base}--disabled` : ''}`

  return (
    <div className={`command-console ${isViewer ? 'command-console--readonly' : ''}`}>
      <h3>{t('console.title')}</h3>

      <label className="cc-select-label">
        {t('console.robot')}
        <select value={robotId} onChange={(e) => setRobotId(e.target.value)} disabled={isViewer}>
          {ROBOTS.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </label>

      <div className="cc-btn-row">
        <button className={btnClass('resume', 'btn-start')} onClick={() => act('resume', () => onStartRobot(robotId))} disabled={isViewer || busy}>
          {feedback === 'resume' ? '✓' : '▶'} {t('console.resume')}
        </button>
        <button className={btnClass('pause', 'btn-stop')} onClick={() => act('pause', () => onStopRobot(robotId))} disabled={isViewer || busy}>
          {feedback === 'pause' ? '✓' : '⏸'} {t('console.pause')}
        </button>
        <button className={btnClass('estop', 'btn-danger')} onClick={() => act('estop', () => onEmergencyStop(robotId))} disabled={isViewer || busy}>
          {feedback === 'estop' ? '✓' : '⚠'} {t('console.eStop')}
        </button>
      </div>

      <button
        className={btnClass('return', 'btn-base')}
        onClick={() => act('return', () => onAssignTask(robotId, 'Returning to Base'))}
        disabled={isViewer || busy}
      >
        {feedback === 'return' ? '✓' : '↲'} {t('console.returnToBase')}
      </button>

      <label className="cc-select-label">
        {t('console.quickTask')}
        <select
          value={quickTask}
          onChange={(e) => {
            setQuickTask(e.target.value)
            if (e.target.value) {
              act('assign', () => onAssignTask(robotId, e.target.value))
            }
          }}
          disabled={isViewer || busy}
        >
          <option value="">{t('console.select')}</option>
          {QUICK_TASKS.map((taskName) => (
            <option key={taskName} value={taskName}>{taskName}</option>
          ))}
        </select>
      </label>

      <form
        className="task-row"
        onSubmit={(e) => {
          e.preventDefault()
          if (task.trim()) {
            act('assign', () => {
              onAssignTask(robotId, task.trim())
              setTask('')
            })
          }
        }}
      >
        <label className="cc-input-label">
          {t('console.customTask')}
          <input
            type="text"
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder={t('console.placeholder')}
            disabled={isViewer || busy}
          />
        </label>
        <button type="submit" className={btnClass('assign', 'btn-send')} disabled={isViewer || busy}>
          {feedback === 'assign' ? '✓' : t('console.assign')}
        </button>
      </form>
    </div>
  )
}
