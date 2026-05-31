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
import PredictiveMaintenance from './components/PredictiveMaintenance'
import OEEWidget from './components/OEEWidget'
import ProductionLine from './components/ProductionLine'
import ScreenshotExport from './components/ScreenshotExport'
import VoiceCommand from './components/VoiceCommand'
import AmbientAudio from './components/AmbientAudio'
import TelemetryExport from './components/TelemetryExport'
import ShiftScheduler from './components/ShiftScheduler'
import ServiceHealth from './components/ServiceHealth'
import AuditLog from './components/AuditLog'
import WebhookManager from './components/WebhookManager'
import AnalyticsWidget from './components/AnalyticsWidget'
import SensorGrid from './components/SensorGrid'
import RobotFleetPanel from './components/RobotFleetPanel'
import ReconcilePanel from './components/ReconcilePanel'
import SiteManagerPanel from './components/SiteManagerPanel'
import LoginPage from './components/LoginPage'
import LayoutSettingsPanel, { loadLayout, saveLayout } from './components/LayoutSettingsPanel'
import useAlertNotifications from './hooks/useAlertNotifications'
import { ThemeProvider, useTheme } from './contexts/ThemeContext'
import { I18nProvider, useI18n } from './contexts/I18nContext'
import type { TelemetrySnapshot, RobotStatus, Alert, Event } from './types/telemetry'
import './App.css'
import './themes/light.css'

const WS_URL = import.meta.env.VITE_WS_URL ?? `${window.location.hostname}:8003/ws`

export default function App() {
  const kioskMode = new URLSearchParams(window.location.search).get('kiosk') === 'true'

  return (
    <ThemeProvider>
      <I18nProvider>
        <AppContent kioskMode={kioskMode} />
      </I18nProvider>
    </ThemeProvider>
  )
}

function AppContent({ kioskMode }: { kioskMode: boolean }) {
  const { t, lang, setLang } = useI18n()

  const [authed, setAuthed] = useState(() => kioskMode || !!localStorage.getItem('sf_session'))
  const [role, setRole] = useState<'admin' | 'operator' | 'viewer'>(() => {
    if (kioskMode) return 'viewer'
    return (localStorage.getItem('sf_role') as 'admin' | 'operator' | 'viewer') || 'admin'
  })
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
  const [activeTab, setActiveTab] = useState('factory')
  const [factorySubTab, setFactorySubTab] = useState('alerts')

  const TABS = [
    { key: 'factory', label: '🏭 Factory', panels: ['map', 'fleet', 'alerts', 'console'] },
    { key: 'analytics', label: '📊 Analytics', panels: ['analytics', 'oee', 'production', 'energy'] },
    { key: 'maintenance', label: '🔧 Maintenance', panels: ['predictive', 'sensors', 'health', 'shift'] },
    { key: 'admin', label: '⚙️ Admin', panels: ['audit', 'webhooks', 'robots', 'reconcile', 'sites'] },
    { key: 'ai', label: '💬 AI', panels: ['chat', 'camera'] },
  ] as const

  const activePanels: readonly string[] = TABS.find(t => t.key === activeTab)?.panels ?? []
  const showPanelForTab = (key: string) => activePanels.includes(key) && (panelVisibility[key] ?? true)
  const [kpiDiffs, setKpiDiffs] = useState<Record<string, { value: number; direction: 'up' | 'down' }> | undefined>(undefined)
  const [voiceResult, setVoiceResult] = useState<{ text: string; ok: boolean } | null>(null)
  const voiceTimeoutRef = useRef<number>(0)
  const { notifEnabled, setNotifEnabled, minSeverity, cycleSeverity } = useAlertNotifications(alerts)

  const [kioskView, setKioskView] = useState<'map' | 'kpi'>('map')

  useEffect(() => {
    saveLayout(panelVisibility)
  }, [panelVisibility])

  useEffect(() => {
    if (!kioskMode) return
    const id = setInterval(() => {
      setKioskView((prev) => (prev === 'map' ? 'kpi' : 'map'))
    }, 15000)
    return () => clearInterval(id)
  }, [kioskMode])

  useEffect(() => {
    if (kioskMode) {
      document.body.classList.add('kiosk-mode')
    } else {
      document.body.classList.remove('kiosk-mode')
    }
    return () => document.body.classList.remove('kiosk-mode')
  }, [kioskMode])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement
      if (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable) return
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
            const robotId = robots[idx].robot_id
            setSelectedRobotId(robotId)
            window.dispatchEvent(new CustomEvent('select-robot', { detail: { robotId } }))
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

  const handleDownloadPdf = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/reports/pdf')
      if (!res.ok) throw new Error('PDF download failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `report-${new Date().toISOString().slice(0, 10)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) { console.error(err) }
  }, [])

  const handleLogout = () => {
    localStorage.removeItem('sf_session')
    localStorage.removeItem('sf_role')
    setAuthed(false)
  }

  const handleRetry = useCallback(() => {
    setError(null)
  }, [])

  const togglePanel = useCallback((key: string) => {
    setPanelVisibility((prev) => ({ ...prev, [key]: !(prev[key] ?? true) }))
  }, [])

  useEffect(() => {
    const handler = ((e: globalThis.Event) => {
      const detail = (e as unknown as CustomEvent).detail as {
        command: string
        params?: string
        transcript: string
        recognized: boolean
      }
      if (voiceTimeoutRef.current) clearTimeout(voiceTimeoutRef.current)
      if (detail.recognized) {
        switch (detail.command) {
          case 'start-robot':
            if (detail.params) handleRobotStart(detail.params)
            break
          case 'stop-robot':
            if (detail.params) handleRobotStop(detail.params)
            break
          case 'fullscreen':
          case 'exit-fullscreen':
            window.dispatchEvent(new CustomEvent('fullscreen-toggle'))
            break
          case 'reset-map':
            window.dispatchEvent(new CustomEvent('map-reset'))
            break
          case 'show-alerts':
          case 'hide-alerts':
            togglePanel('alerts')
            break
          case 'show-fleet':
          case 'hide-fleet':
            togglePanel('fleet')
            break
          case 'help':
            setShowShortcuts(true)
            break
        }
        setVoiceResult({ text: `Command: ${detail.transcript}`, ok: true })
      } else {
        setVoiceResult({ text: `Unrecognized: ${detail.transcript}`, ok: false })
      }
      voiceTimeoutRef.current = window.setTimeout(() => setVoiceResult(null), 2000)
    }) as unknown as EventListener
    window.addEventListener('voice-command', handler)
    return () => {
      window.removeEventListener('voice-command', handler)
      if (voiceTimeoutRef.current) clearTimeout(voiceTimeoutRef.current)
    }
    }, [handleRobotStart, handleRobotStop, togglePanel])

  useEffect(() => {
    const handler = ((e: globalThis.Event) => {
      const detail = (e as CustomEvent).detail as Record<string, { value: number; direction: 'up' | 'down' }>
      setKpiDiffs(detail)
    }) as unknown as EventListener
    window.addEventListener('time-machine-diff', handler)
    return () => window.removeEventListener('time-machine-diff', handler)
  }, [])

  const bannerClass =
    status === 'failed'
      ? 'reconnect-banner--error'
      : status === 'disconnected' || status === 'connecting'
        ? 'reconnect-banner--warning'
        : null

  const bannerText =
    status === 'failed'
      ? t('reconnect.failed')
      : status === 'disconnected' || status === 'connecting'
        ? t('reconnect.connecting')
        : null

  if (!authed) return <LoginPage onLogin={(r) => { setRole(r as 'admin' | 'operator' | 'viewer'); setAuthed(true) }} />

  return (
    <div className="app">
      {kioskMode && <div className="kiosk-badge">Kiosk Mode</div>}
      {bannerClass && (
        <div className={`reconnect-banner ${bannerClass}`}>
          {bannerText}
        </div>
      )}
      {!kioskMode && (
        <header className="app-header">
          <div className="header-left">
            <h1>{t('app.title')}</h1>
            <span className="app-subtitle">{t('app.subtitle')}</span>
          </div>
          <div className="header-right">
            <VoiceCommand />
            <AmbientAudio robots={robots} />
            <div className="notif-group">
              <button
                className={`notif-header-btn${notifEnabled ? ' notif-header-btn--on' : ''}`}
                onClick={() => setNotifEnabled(!notifEnabled)}
                title={notifEnabled ? 'Mute alerts' : 'Unmute alerts'}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              </button>
              {notifEnabled && (
                <button className="notif-severity-btn" onClick={cycleSeverity} title={`Sound on: ${minSeverity}+`}>
                  {minSeverity}
                </button>
              )}
            </div>
            <ScreenshotExport />
            <button className="layout-settings-btn" onClick={handleDownloadPdf} title="Download PDF report">📄</button>
            <ThemeToggleButton />
            <button
              className="layout-settings-btn"
              onClick={() => setLang(lang === 'en' ? 'fr' : 'en')}
            >
              {lang === 'en' ? 'FR' : 'EN'}
            </button>
            <span className={`role-badge role-badge--${role}`}>{role}</span>
            {role === 'admin' && <button className="layout-settings-btn" onClick={() => setShowLayoutSettings(true)}>{t('app.layout')}</button>}
            <button className="layout-settings-btn" onClick={() => setShowShortcuts((p) => !p)}>?</button>
            <span className="header-clock">{clock.toLocaleTimeString()}</span>
            <button className="logout-btn" onClick={handleLogout}>{t('app.logout')}</button>
          </div>
        </header>
      )}
      <main className="app-main">
        {kioskMode ? (
          kioskView === 'map' ? (
            <div className="panel panel-map" style={{ flex: 1, borderRadius: 0, border: 'none' }}>
              <MapSettingsProvider>
                <DigitalTwinMap
                  robots={robots}
                  error={error}
                  role={role}
                  selectedRobotId={selectedRobotId}
                  onRobotStart={handleRobotStart}
                  onRobotStop={handleRobotStop}
                />
              </MapSettingsProvider>
            </div>
          ) : (
            <section className="grid-kpi" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
              <div style={{ width: '100%', maxWidth: 800 }}>
                <KpiBoard telemetry={telemetry} error={error} onRetry={handleRetry} diffs={kpiDiffs} />
              </div>
            </section>
          )
        ) : (
          <>
            {panelVisibility.kpi !== false && (
              <section className="grid-kpi">
                <KpiBoard telemetry={telemetry} error={error} onRetry={handleRetry} diffs={kpiDiffs} />
              </section>
            )}
            {panelVisibility.analytics !== false && (
              <section className="grid-analytics">
                <AnalyticsWidget />
              </section>
            )}
            <nav className="tab-bar">
              {TABS.map(tab => (
                <button
                  key={tab.key}
                  className={`tab-btn${activeTab === tab.key ? ' tab-btn--active' : ''}`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
              <button
                className="tab-btn layout-btn"
                onClick={() => setShowLayoutSettings(true)}
                title="Panel visibility"
              >
                ⚙️
              </button>
            </nav>
            <section className="grid-main">
              {/* Factory tab */}
              {activeTab === 'factory' && (
                <>
                  {showPanelForTab('map') && (
                    <div className="panel panel-map">
                      <MapSettingsProvider>
                        <DigitalTwinMap
                          robots={robots}
                          error={error}
                          role={role}
                          selectedRobotId={selectedRobotId}
                          onRobotStart={handleRobotStart}
                          onRobotStop={handleRobotStop}
                        />
                      </MapSettingsProvider>
                    </div>
                  )}
                  <div className="factory-sidebar">
                    <nav className="factory-sub-tabs">
                      {['alerts', 'console', 'fleet'].map(key => (
                        <button
                          key={key}
                          className={`factory-sub-tab${factorySubTab === key ? ' factory-sub-tab--active' : ''}`}
                          onClick={() => setFactorySubTab(key)}
                        >
                          {key === 'alerts' ? 'Alerts' : key === 'console' ? 'Console' : 'Fleet'}
                        </button>
                      ))}
                    </nav>
                    {showPanelForTab(factorySubTab) && factorySubTab === 'alerts' && (
                      <div className="panel panel-alerts">
                        <AlertBoard alerts={alerts} events={events} error={error} />
                      </div>
                    )}
                    {showPanelForTab(factorySubTab) && factorySubTab === 'console' && (
                      <div className="panel panel-console">
                        <CommandConsole
                          role={role}
                          onStartRobot={handleRobotStart}
                          onStopRobot={handleRobotStop}
                          onAssignTask={handleAssignTask}
                          onEmergencyStop={handleEmergencyStop}
                        />
                      </div>
                    )}
                    {showPanelForTab(factorySubTab) && factorySubTab === 'fleet' && (
                      <div className="panel panel-fleet">
                        <div className="panel-head-row">
                          <h3>{t('fleet.title')}</h3>
                          <TelemetryExport robots={robots} />
                        </div>
                        <RobotFleet robots={robots} error={error} highlightedRobotId={selectedRobotId} />
                      </div>
                    )}
                  </div>
                </>
              )}
              {/* Analytics tab */}
              {activeTab === 'analytics' && (
                <>
                  {showPanelForTab('oee') && (
                    <div className="panel panel-oee"><OEEWidget robots={robots} /></div>
                  )}
                  {showPanelForTab('production') && (
                    <div className="panel panel-production"><ProductionLine robots={robots} /></div>
                  )}
                  {showPanelForTab('energy') && (
                    <div className="panel panel-energy">
                      <h3>Energy & Efficiency</h3>
                      <EnergyWidget robots={robots} />
                    </div>
                  )}
                </>
              )}
              {/* Maintenance tab */}
              {activeTab === 'maintenance' && (
                <>
                  {showPanelForTab('predictive') && (
                    <div className="panel panel-predictive">
                      <h3>Predictive Maintenance</h3>
                      <PredictiveMaintenance robots={robots} />
                    </div>
                  )}
                  {showPanelForTab('sensors') && (
                    <div className="panel panel-sensors"><SensorGrid /></div>
                  )}
                  {showPanelForTab('health') && (
                    <div className="panel panel-health"><ServiceHealth /></div>
                  )}
                  {showPanelForTab('shift') && (
                    <div className="panel panel-shift"><ShiftScheduler robots={robots} onAssignTask={handleAssignTask} /></div>
                  )}
                </>
              )}
              {/* Admin tab */}
              {activeTab === 'admin' && (
                <>
                  {showPanelForTab('audit') && (
                    <div className="panel panel-audit"><AuditLog /></div>
                  )}
                  {showPanelForTab('webhooks') && (
                    <div className="panel panel-webhooks"><WebhookManager /></div>
                  )}
                  {showPanelForTab('robots') && (
                    <div className="panel panel-robots"><RobotFleetPanel /></div>
                  )}
                  {showPanelForTab('reconcile') && (
                    <div className="panel panel-reconcile"><ReconcilePanel /></div>
                  )}
                  {showPanelForTab('sites') && (
                    <div className="panel panel-sites"><SiteManagerPanel /></div>
                  )}
                </>
              )}
              {/* AI tab */}
              {activeTab === 'ai' && (
                <>
                  {showPanelForTab('chat') && (
                    <div className="panel panel-agent"><ChatPanel /></div>
                  )}
                  {showPanelForTab('camera') && (
                    <div className="panel panel-camera"><RobotCamera robots={robots} /></div>
                  )}
                </>
              )}
            </section>
          </>
        )}
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
          <h4>{t('shortcuts.title')}</h4>
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
      {voiceResult && (
        <div className={'voice-toast' + (voiceResult.ok ? ' voice-toast--ok' : ' voice-toast--fail')}>
          {voiceResult.text}
        </div>
      )}
    </div>
  )
}

function ThemeToggleButton() {
  const { theme, toggleTheme } = useTheme()
  return (
    <button
      className="layout-settings-btn"
      onClick={toggleTheme}
      title={theme === 'dark' ? 'Light' : 'Dark'}
    >
      {theme === 'dark' ? '\u2600\uFE0F' : '\uD83C\uDF19'}
    </button>
  )
}
