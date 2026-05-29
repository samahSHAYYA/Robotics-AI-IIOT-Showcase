import { useState, useCallback, useEffect, useRef } from 'react'
import { useWebSocket } from './hooks/useWebSocket'
import KpiBoard from './components/KpiBoard'
import AlertBoard from './components/AlertBoard'
import RobotFleet from './components/RobotFleet'
import CommandConsole from './components/CommandConsole'
import DigitalTwinMap from './components/DigitalTwinMap'
import ChatPanel from './components/ChatPanel'
import LoginPage from './components/LoginPage'
import type { TelemetrySnapshot, RobotStatus, Alert, Event } from './types/telemetry'
import './App.css'

const WS_URL = import.meta.env.VITE_WS_URL ?? `${window.location.hostname}:8003/ws`

export default function App() {
  const [authed, setAuthed] = useState(() => !!localStorage.getItem('sf_session'))
  const [telemetry, setTelemetry] = useState<TelemetrySnapshot | undefined>()
  const [robots, setRobots] = useState<RobotStatus[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [clock, setClock] = useState(new Date())
  const [error, setError] = useState<string | null>(null)
  const maxRetriesReached = useRef(false)

  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const handleMessage = useCallback((data: unknown) => {
    const msg = data as { type: string; data: unknown }
    if (!msg?.type) return
    setError(null)
    switch (msg.type) {
      case 'snapshot': {
        const snapshot = msg.data as TelemetrySnapshot
        setTelemetry(snapshot)
        setRobots(snapshot.robots ?? [])
        setAlerts(snapshot.alerts ?? [])
        break
      }
      case 'event': {
        const ev = msg.data as Event
        setEvents((prev) =>
          prev.some((e) => e.id === ev.id) ? prev : [...prev, ev],
        )
        break
      }
      case 'prediction':
        break
    }
  }, [])

  const handleWsError = useCallback((err: string) => {
    setError(err)
  }, [])

  const { status } = useWebSocket(WS_URL, handleMessage, handleWsError)

  useEffect(() => {
    if (status === 'failed') {
      maxRetriesReached.current = true
    }
    if (status === 'connected' && maxRetriesReached.current) {
      maxRetriesReached.current = false
      window.location.reload()
    }
  }, [status])

  const handleRobotStart = useCallback(async (id: string) => {
    try {
      await fetch(`/api/v1/robot/${id}/start`, { method: 'POST' })
    } catch (err) { console.error(err) }
  }, [])

  const handleRobotStop = useCallback(async (id: string) => {
    try {
      await fetch(`/api/v1/robot/${id}/stop`, { method: 'POST' })
    } catch (err) { console.error(err) }
  }, [])

  const handleAssignTask = useCallback(async (id: string, task: string) => {
    try {
      await fetch(`/api/v1/robot/${id}/task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task }),
      })
    } catch (err) { console.error(err) }
  }, [])

  const handleLogout = () => {
    localStorage.removeItem('sf_session')
    setAuthed(false)
  }

  const handleRetry = useCallback(() => {
    setError(null)
  }, [])

  const bannerClass =
    status === 'failed'
      ? 'reconnect-banner--error'
      : status === 'disconnected' || status === 'connecting'
        ? 'reconnect-banner--warning'
        : null

  const bannerText =
    status === 'failed'
      ? 'Connection lost — page will reload on reconnection'
      : status === 'disconnected' || status === 'connecting'
        ? 'Reconnecting...'
        : null

  if (!authed) return <LoginPage onLogin={() => setAuthed(true)} />

  return (
    <div className="app">
      {bannerClass && (
        <div className={`reconnect-banner ${bannerClass}`}>
          {bannerText}
        </div>
      )}
      <header className="app-header">
        <div className="header-left">
          <h1>Smart Factory Supervisor</h1>
          <span className="app-subtitle">Industrial Humanoid Robotics IIoT Showcase</span>
        </div>
        <div className="header-right">
          <span className="header-clock">{clock.toLocaleTimeString()}</span>
          <button className="logout-btn" onClick={handleLogout}>Logout</button>
        </div>
      </header>
      <main className="app-main">
        <section className="grid-kpi">
          <KpiBoard telemetry={telemetry} error={error} onRetry={handleRetry} />
        </section>
        <section className="grid-main">
          <div className="panel panel-fleet">
            <RobotFleet robots={robots} error={error} />
          </div>
          <div className="panel panel-map">
            <DigitalTwinMap
              robots={robots}
              error={error}
              onRobotStart={handleRobotStart}
              onRobotStop={handleRobotStop}
            />
          </div>
          <div className="panel panel-alerts">
            <AlertBoard alerts={alerts} events={events} error={error} />
          </div>
          <div className="panel panel-console">
            <CommandConsole
              onStartRobot={handleRobotStart}
              onStopRobot={handleRobotStop}
              onAssignTask={handleAssignTask}
            />
          </div>
          <div className="panel panel-agent">
            <ChatPanel />
          </div>
        </section>
      </main>
    </div>
  )
}
