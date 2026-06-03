import { useState, useCallback, useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useTelemetry } from '../contexts/TelemetryContext'
import { useI18n } from '../contexts/I18nContext'
import { useTheme } from '../contexts/ThemeContext'
import KpiBoard from '../components/KpiBoard'
import AlertBoard from '../components/AlertBoard'
import RobotFleet from '../components/RobotFleet'
import CommandConsole from '../components/CommandConsole'
import DigitalTwinMap from '../components/DigitalTwinMap'
import { MapSettingsProvider } from '../contexts/MapSettingsContext'
import RobotCamera from '../components/RobotCamera'
import ChatPanel from '../components/ChatPanel'
import EnergyWidget from '../components/EnergyWidget'
import PredictiveMaintenance from '../components/PredictiveMaintenance'
import OEEWidget from '../components/OEEWidget'
import ProductionLine from '../components/ProductionLine'
import ScreenshotExport from '../components/ScreenshotExport'
import VoiceCommand from '../components/VoiceCommand'
import AmbientAudio from '../components/AmbientAudio'
import TelemetryExport from '../components/TelemetryExport'
import ShiftScheduler from '../components/ShiftScheduler'
import WorkerSafetyZone from '../components/WorkerSafetyZone'
import AnnotationPanel from '../components/AnnotationPanel'
import ServiceHealth from '../components/ServiceHealth'
import AuditLog from '../components/AuditLog'
import WebhookManager from '../components/WebhookManager'
import EnergyOptimizer from '../components/EnergyOptimizer'
import PredictiveQuality from '../components/PredictiveQuality'
import FederatedLearning from '../components/FederatedLearning'
import SupplyChain from '../components/SupplyChain'
import AnalyticsWidget from '../components/AnalyticsWidget'
import SensorGrid from '../components/SensorGrid'
import RobotFleetPanel from '../components/RobotFleetPanel'
import ReconcilePanel from '../components/ReconcilePanel'
import SiteManagerPanel from '../components/SiteManagerPanel'
import LoginPage from '../components/LoginPage'
import LayoutSettingsPanel, { loadLayout, saveLayout } from '../components/LayoutSettingsPanel'
import useAlertNotifications from '../hooks/useAlertNotifications'

export default function DashboardLayout() {
  const { t, lang, setLang } = useI18n()
  const { authed, role, login, logout, kioskMode } = useAuth()
  const {
    telemetry, robots, workers, alerts, events, error, wsStatus, kpiDiffs,
    handleRobotStart, handleRobotStop, handleAssignTask, handleWorkerToggle,
    handleEmergencyStop, handleDownloadPdf, handleRetry,
  } = useTelemetry()
  const { theme, toggleTheme } = useTheme()

  const [clock, setClock] = useState(new Date())
  const [panelVisibility, setPanelVisibility] = useState<Record<string, boolean>>(() => loadLayout())
  const [showLayoutSettings, setShowLayoutSettings] = useState(false)
  const [selectedRobotId, setSelectedRobotId] = useState<string | null>(null)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [activeTab, setActiveTab] = useState('factory')
  const [factorySubTab, setFactorySubTab] = useState('alerts')
  const [voiceResult, setVoiceResult] = useState<{ text: string; ok: boolean } | null>(null)
  const voiceTimeoutRef = useRef<number>(0)
  const { notifEnabled, setNotifEnabled, minSeverity, cycleSeverity } = useAlertNotifications(alerts)

  const [kioskView, setKioskView] = useState<'map' | 'kpi'>('map')

  const TABS = [
    { key: 'factory', label: `🏭 ${t('tab.factory')}`, panels: ['map', 'fleet', 'alerts', 'console', 'annotations'] },
    { key: 'analytics', label: `📊 ${t('tab.analytics')}`, panels: ['analytics', 'oee', 'production', 'energy', 'supply', 'quality', 'energyopt'] },
    { key: 'maintenance', label: `🔧 ${t('tab.maintenance')}`, panels: ['predictive', 'sensors', 'health', 'shift', 'federated'] },
    { key: 'admin', label: `⚙️ ${t('tab.admin')}`, panels: ['audit', 'webhooks', 'robots', 'reconcile', 'sites'] },
    { key: 'camera', label: `📷 ${t('tab.camera')}`, panels: ['camera'] },
    { key: 'ai', label: `💬 ${t('tab.ai')}`, panels: ['chat'] },
  ] as const

  const activePanels: readonly string[] = TABS.find(t => t.key === activeTab)?.panels ?? []
  const showPanelForTab = (key: string) => activePanels.includes(key) && (panelVisibility[key] ?? true)

  // Persist panel layout
  useEffect(() => {
    saveLayout(panelVisibility)
  }, [panelVisibility])

  // Kiosk view rotation
  useEffect(() => {
    if (!kioskMode) return
    const id = setInterval(() => {
      setKioskView((prev) => (prev === 'map' ? 'kpi' : 'map'))
    }, 15000)
    return () => clearInterval(id)
  }, [kioskMode])

  // Kiosk body class
  useEffect(() => {
    if (kioskMode) {
      document.body.classList.add('kiosk-mode')
    } else {
      document.body.classList.remove('kiosk-mode')
    }
    return () => document.body.classList.remove('kiosk-mode')
  }, [kioskMode])

  // Keyboard shortcuts
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

  // Clock tick
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // Voice command listener
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
            setPanelVisibility((prev) => ({ ...prev, alerts: !(prev.alerts ?? true) }))
            break
          case 'show-fleet':
          case 'hide-fleet':
            setPanelVisibility((prev) => ({ ...prev, fleet: !(prev.fleet ?? true) }))
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
  }, [handleRobotStart, handleRobotStop])

  const togglePanel = useCallback((key: string) => {
    setPanelVisibility((prev) => ({ ...prev, [key]: !(prev[key] ?? true) }))
  }, [])

  const bannerClass =
    wsStatus === 'failed'
      ? 'reconnect-banner--error'
      : wsStatus === 'disconnected' || wsStatus === 'connecting'
        ? 'reconnect-banner--warning'
        : null

  const bannerText =
    wsStatus === 'failed'
      ? t('reconnect.failed')
      : wsStatus === 'disconnected' || wsStatus === 'connecting'
        ? t('reconnect.connecting')
        : null

  if (!authed) return <LoginPage onLogin={login} />

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
            <button className="layout-settings-btn" onClick={handleDownloadPdf} title="Download PDF report">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </button>
            <button
              className="layout-settings-btn"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Light' : 'Dark'}
            >
              {theme === 'dark' ? '\u2600\uFE0F' : '\uD83C\uDF19'}
            </button>
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
            <button className="logout-btn" onClick={logout}>{t('app.logout')}</button>
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
                          workers={workers}
                          error={error}
                          role={role}
                          selectedRobotId={selectedRobotId}
                          onRobotStart={handleRobotStart}
                          onRobotStop={handleRobotStop}
                          onToggleWorker={handleWorkerToggle}
                        />
                      </MapSettingsProvider>
                    </div>
                  )}
                  <div className="factory-sidebar">
                    <nav className="factory-sub-tabs">
                      {['alerts', 'console', 'fleet', 'safety', 'annotations'].map(key => (
                        <button
                          key={key}
                          className={`factory-sub-tab${factorySubTab === key ? ' factory-sub-tab--active' : ''}`}
                          onClick={() => setFactorySubTab(key)}
                        >
                          {t(`factory.${key}`)}
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
                          robots={robots}
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
                    {showPanelForTab(factorySubTab) && factorySubTab === 'safety' && (
                      <div className="panel panel-safety">
                        <WorkerSafetyZone workers={workers} robots={robots} onToggleWorker={handleWorkerToggle} />
                      </div>
                    )}
                    {showPanelForTab(factorySubTab) && factorySubTab === 'annotations' && (
                      <div className="panel panel-annotations">
                        <AnnotationPanel />
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
                      <h3>{t('energy.title')}</h3>
                      <EnergyWidget robots={robots} />
                    </div>
                  )}
                  {showPanelForTab('supply') && (
                    <div className="panel panel-supply">
                      <SupplyChain />
                    </div>
                  )}
                  {showPanelForTab('quality') && (
                    <div className="panel panel-quality">
                      <PredictiveQuality />
                    </div>
                  )}
                  {showPanelForTab('energyopt') && (
                    <div className="panel panel-energyopt">
                      <EnergyOptimizer robots={robots} />
                    </div>
                  )}
                </>
              )}
              {/* Maintenance tab */}
              {activeTab === 'maintenance' && (
                <>
                  {showPanelForTab('predictive') && (
                    <div className="panel panel-predictive">
                      <h3>{t('predictive.title')}</h3>
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
                  {showPanelForTab('federated') && (
                    <div className="panel panel-federated"><FederatedLearning /></div>
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
              {/* Camera tab */}
              {activeTab === 'camera' && (
                <>
                  {showPanelForTab('camera') && (
                    <div className="panel panel-camera-tab">
                      <RobotCamera robots={robots} />
                    </div>
                  )}
                </>
              )}
              {/* AI tab */}
              {activeTab === 'ai' && (
                <>
                  {showPanelForTab('chat') && (
                    <div className="ai-tab-layout">
                      <div className="panel ai-tab-chat">
                        <ChatPanel />
                      </div>
                      <div className="panel ai-tab-render">
                        <h3>AI Insights</h3>
                        <div className="ai-render-content" id="ai-render-content">
                          <div className="ai-render-empty">Ask the AI agent a question — responses with charts and analysis appear here.</div>
                        </div>
                      </div>
                    </div>
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
