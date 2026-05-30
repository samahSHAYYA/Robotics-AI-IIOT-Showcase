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
  const [kpiDiffs, setKpiDiffs] = useState<Record<string, { value: number; direction: 'up' | 'down' }> | undefined>(undefined)
  const [voiceResult, setVoiceResult] = useState<{ text: string; ok: boolean } | null>(null)
  const voiceTimeoutRef = useRef<number>(0)
  const { notifEnabled, setNotifEnabled } = useAlertNotifications(alerts)

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  const [mobileTab, setMobileTab] = useState('map')
  const [kioskView, setKioskView] = useState<'map' | 'kpi'>('map')

  useEffect(() => {
    saveLayout(panelVisibility)
  }, [panelVisibility])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    setIsMobile(mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

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

  const showPanel = (key: string) => !isMobile || kioskMode || mobileTab === key

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
            <button
              className={`notif-header-btn${notifEnabled ? ' notif-header-btn--on' : ''}`}
              onClick={() => setNotifEnabled(!notifEnabled)}
              title={notifEnabled ? 'Disable notifications' : 'Enable notifications'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </button>
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
            <section className="grid-main">
              {showPanel('fleet') && panelVisibility.fleet !== false && (
                <div className="panel panel-fleet">
                  <div className="panel-head-row">
                    <h3>{t('fleet.title')}</h3>
                    <TelemetryExport robots={robots} />
                  </div>
                  <RobotFleet robots={robots} error={error} highlightedRobotId={selectedRobotId} />
                  <EnergyWidget robots={robots} />
                  <PredictiveMaintenance robots={robots} />
                </div>
              )}
              {showPanel('map') && panelVisibility.map !== false && (
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
              {showPanel('alerts') && panelVisibility.alerts !== false && (
                <div className="panel panel-alerts">
                  <AlertBoard alerts={alerts} events={events} error={error} />
                </div>
              )}
              {showPanel('console') && panelVisibility.console !== false && (
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
              {!isMobile && panelVisibility.oee !== false && (
                <div className="panel panel-oee">
                  <OEEWidget robots={robots} />
                </div>
              )}
              {!isMobile && panelVisibility.shift !== false && (
                <div className="panel panel-shift">
                  <ShiftScheduler robots={robots} onAssignTask={handleAssignTask} />
                </div>
              )}
              {!isMobile && panelVisibility.production !== false && (
                <div className="panel panel-production">
                  <ProductionLine robots={robots} />
                </div>
              )}
              {!isMobile && panelVisibility.camera !== false && (
                <div className="panel panel-camera">
                  <RobotCamera robots={robots} />
                </div>
              )}
              {showPanel('chat') && panelVisibility.chat !== false && (
                <div className="panel panel-agent">
                  <ChatPanel />
                </div>
              )}
              {!isMobile && panelVisibility.sensors !== false && (
                <div className="panel panel-sensors">
                  <SensorGrid />
                </div>
              )}
              {!isMobile && panelVisibility.health !== false && (
                <div className="panel panel-health">
                  <ServiceHealth />
                </div>
              )}
              {!isMobile && panelVisibility.audit !== false && (
                <div className="panel panel-audit">
                  <AuditLog />
                </div>
              )}
              {!isMobile && panelVisibility.webhooks !== false && (
                <div className="panel panel-webhooks">
                  <WebhookManager />
                </div>
              )}
              {!isMobile && panelVisibility.robots !== false && (
                <div className="panel panel-robots">
                  <RobotFleetPanel />
                </div>
              )}
              {!isMobile && panelVisibility.reconcile !== false && (
                <div className="panel panel-reconcile">
                  <ReconcilePanel />
                </div>
              )}
              {!isMobile && panelVisibility.sites !== false && (
                <div className="panel panel-sites">
                  <SiteManagerPanel />
                </div>
              )}
            </section>
          </>
        )}
      </main>
      {isMobile && !kioskMode && (
        <nav className="mobile-nav">
          <button
            className={`mobile-nav-btn${mobileTab === 'map' ? ' mobile-nav-btn--active' : ''}`}
            onClick={() => setMobileTab('map')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
            <span>Map</span>
          </button>
          <button
            className={`mobile-nav-btn${mobileTab === 'fleet' ? ' mobile-nav-btn--active' : ''}`}
            onClick={() => setMobileTab('fleet')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="2" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></svg>
            <span>Fleet</span>
          </button>
          <button
            className={`mobile-nav-btn${mobileTab === 'alerts' ? ' mobile-nav-btn--active' : ''}`}
            onClick={() => setMobileTab('alerts')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
            <span>Alerts</span>
          </button>
          <button
            className={`mobile-nav-btn${mobileTab === 'console' ? ' mobile-nav-btn--active' : ''}`}
            onClick={() => setMobileTab('console')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" /></svg>
            <span>Console</span>
          </button>
          <button
            className={`mobile-nav-btn${mobileTab === 'chat' ? ' mobile-nav-btn--active' : ''}`}
            onClick={() => setMobileTab('chat')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
            <span>Chat</span>
          </button>
        </nav>
      )}
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
