import { useState, useCallback, useEffect, useRef } from 'react'
import { useWebSocket } from './hooks/useWebSocket'
import KpiBoard from './components/KpiBoard'
import AlertBoard from './components/AlertBoard'
import RobotFleet from './components/RobotFleet'
import CommandConsole from './components/CommandConsole'
import DigitalTwinMap from './components/DigitalTwinMap'
import { MapSettingsProvider } from './contexts/MapSettingsContext'
import RobotCamera from './components/RobotCamera'
import ChatPanel from './components/ChatPanel'
import EnergyWidget from './components/EnergyWidget'
import ScreenshotExport from './components/ScreenshotExport'
import LoginPage from './components/LoginPage'
import LayoutSettingsPanel, { loadLayout, saveLayout } from './components/LayoutSettingsPanel'
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

  const [panelVisibility, setPanelVisibility] = useState<Record<string, boolean>>(() => loadLayout())
  const [showLayoutSettings, setShowLayoutSettings] = useState(false)
  const [selectedRobotId, setSelectedRobotId] = useState<string | null>(null)
  const [showShortcuts, setShowShortcuts] = useState(false)

  useEffect(() => {
    saveLayout(panelVisibility)
  }, [panelVisibility])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return
      switch (e.key) {
        case '?':
          e.preventDefault()
          setShowShortcuts((p) => !p)
          break
        case 'Escape':
          setShowLayoutSettings(false)
          setShowShortcuts(false)
          setSelectedRobotId(null)
          window.dispatchEvent(new CustomEvent('fullscreen-toggle'))
          break
        case 'f':
        case 'F':
          e.preventDefault()
          window.dispatchEvent(new CustomEvent('fullscreen-toggle'))
          break
        case 'r':
        case 'R':
          e.preventDefault()
          window.dispatchEvent(new CustomEvent('map-reset'))
          break
        case '1':
        case '2':
        case '3': {
          const idx = parseInt(e.key) - 1
          if (idx < robots.length) {
            setSelectedRobotId(robots[idx].robot_id)
          }
          break
        }
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [robots])

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

  const handleEmergencyStop = useCallback(async (id: string) => {
    try {
      await fetch(`/api/v1/robot/${id}/emergency-stop`, { method: 'POST' })
    } catch (err) { console.error(err) }
  }, [])

  const handleLogout = () => {
    localStorage.removeItem('sf_session')
    setAuthed(false)
  }

  const handleRetry = useCallback(() => {
    setError(null)
  }, [])

  const togglePanel = useCallback((key: string) => {
    setPanelVisibility((prev) => ({ ...prev, [key]: !(prev[key] ?? true) }))
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
          <ScreenshotExport />
          <button className="layout-settings-btn" onClick={() => setShowLayoutSettings(true)}>Layout</button>
          <button className="layout-settings-btn" onClick={() => setShowShortcuts((p) => !p)}>?</button>
          <span className="header-clock">{clock.toLocaleTimeString()}</span>
          <button className="logout-btn" onClick={handleLogout}>Logout</button>
        </div>
      </header>
      <main className="app-main">
        {panelVisibility.kpi !== false && (
          <section className="grid-kpi">
            <KpiBoard telemetry={telemetry} error={error} onRetry={handleRetry} />
          </section>
        )}
        <section className="grid-main">
          {panelVisibility.fleet !== false && (
            <div className="panel panel-fleet">
              <RobotFleet robots={robots} error={error} highlightedRobotId={selectedRobotId} />
              <EnergyWidget robots={robots} />
            </div>
          )}
          {panelVisibility.map !== false && (
            <div className="panel panel-map">
              <MapSettingsProvider>
                <DigitalTwinMap
                  robots={robots}
                  error={error}
                  onRobotStart={handleRobotStart}
                  onRobotStop={handleRobotStop}
                />
              </MapSettingsProvider>
            </div>
          )}
          {panelVisibility.alerts !== false && (
            <div className="panel panel-alerts">
              <AlertBoard alerts={alerts} events={events} error={error} />
            </div>
          )}
          {panelVisibility.console !== false && (
            <div className="panel panel-console">
              <CommandConsole
                onStartRobot={handleRobotStart}
                onStopRobot={handleRobotStop}
                onAssignTask={handleAssignTask}
                onEmergencyStop={handleEmergencyStop}
              />
            </div>
          )}
          {panelVisibility.camera !== false && (
            <div className="panel panel-camera">
              <RobotCamera robots={robots} />
            </div>
          )}
          {panelVisibility.chat !== false && (
            <div className="panel panel-agent">
              <ChatPanel />
            </div>
          )}
        </section>
      </main>
      {showLayoutSettings && (
        <LayoutSettingsPanel
          visible={panelVisibility}
          onToggle={togglePanel}
          onClose={() => setShowLayoutSettings(false)}
        />
      )}
      {showShortcuts && (
        <div className="shortcuts-toast">
          <h4>Keyboard Shortcuts</h4>
          <div className="shortcuts-grid">
            <span className="shortcuts-key">F</span>
            <span className="shortcuts-desc">Toggle full-screen map</span>
            <span className="shortcuts-key">1-3</span>
            <span className="shortcuts-desc">Select robot</span>
            <span className="shortcuts-key">R</span>
            <span className="shortcuts-desc">Reset map view</span>
            <span className="shortcuts-key">Esc</span>
            <span className="shortcuts-desc">Close popups / exit full-screen</span>
            <span className="shortcuts-key">?</span>
            <span className="shortcuts-desc">Toggle this help</span>
          </div>
        </div>
      )}
    </div>
  )
}
