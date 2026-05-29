import { useState, useCallback, useEffect } from 'react'
import { useWebSocket } from './hooks/useWebSocket'
import KpiBoard from './components/KpiBoard'
import AlertBoard from './components/AlertBoard'
import RobotFleet from './components/RobotFleet'
import CommandConsole from './components/CommandConsole'
import DigitalTwinMap from './components/DigitalTwinMap'
import ChatPanel from './components/ChatPanel'
import LoginPage from './components/LoginPage'
import type { TelemetrySnapshot, RobotStatus, Event, CommandPayload } from './types/telemetry'
import './App.css'

const WS_URL = import.meta.env.VITE_WS_URL ?? `${window.location.hostname}:8003/ws`

export default function App() {
  const [authed, setAuthed] = useState(() => !!localStorage.getItem('sf_session'))
  const [telemetry, setTelemetry] = useState<TelemetrySnapshot | undefined>()
  const [robots] = useState<RobotStatus[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [clock, setClock] = useState(new Date())

  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const handleMessage = useCallback((data: unknown) => {
    const msg = data as { type: string; data: unknown }
    if (!msg?.type) return
    switch (msg.type) {
      case 'snapshot':
        setTelemetry(msg.data as TelemetrySnapshot)
        break
      case 'telemetry':
        setTelemetry(msg.data as TelemetrySnapshot)
        break
      case 'event':
        setEvents((prev) => {
          const ev = msg.data as Event
          return prev.some((e) => e.id === ev.id) ? prev : [...prev, ev]
        })
        break
      case 'prediction':
        break
    }
  }, [])

  useWebSocket(WS_URL, handleMessage)

  const handleSendCommand = useCallback(async (cmd: CommandPayload) => {
    try {
      const token = localStorage.getItem('sf_session')
      const resp = await fetch('/api/v1/robot/command', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(cmd),
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    } catch (err) {
      console.error('Command failed:', err)
    }
  }, [])

  const handleLogout = () => {
    localStorage.removeItem('sf_session')
    setAuthed(false)
  }

  if (!authed) return <LoginPage onLogin={() => setAuthed(true)} />

  return (
    <div className="app">
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
          <KpiBoard telemetry={telemetry} />
        </section>
        <section className="grid-main">
          <div className="panel panel-fleet">
            <RobotFleet robots={robots} />
          </div>
          <div className="panel panel-map">
            <DigitalTwinMap robots={robots} />
          </div>
          <div className="panel panel-alerts">
            <AlertBoard events={events} />
          </div>
          <div className="panel panel-console">
            <CommandConsole onSendCommand={handleSendCommand} />
          </div>
          <div className="panel panel-agent">
            <ChatPanel />
          </div>
        </section>
      </main>
    </div>
  )
}
