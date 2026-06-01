import { useEffect } from 'react'

const STORAGE_KEY = 'dashboardLayout'

const PANELS = [
  { key: 'kpi', label: 'KPI Gauges' },
  { key: 'fleet', label: 'Robot Fleet' },
  { key: 'map', label: 'Factory Floor' },
  { key: 'alerts', label: 'Alert Board' },
  { key: 'console', label: 'Command Console' },
  { key: 'oee', label: 'OEE Widget' },
  { key: 'shift', label: 'Shift Scheduler' },
  { key: 'production', label: 'Production Line' },
  { key: 'camera', label: 'Robot Camera' },
  { key: 'chat', label: 'AI Chat' },
  { key: 'analytics', label: 'Analytics Widget' },
  { key: 'health', label: 'Service Health' },
  { key: 'audit', label: 'Audit Log' },
  { key: 'webhooks', label: 'Webhook Manager' },
  { key: 'sensors', label: 'IoT Sensor Grid' },
  { key: 'robots', label: 'Robot Fleet Panel' },
  { key: 'reconcile', label: 'State Reconciliation' },
  { key: 'sites', label: 'Multi-Factory Sites' },
  { key: 'annotations', label: 'Annotations' },
] as const

export type LayoutKey = (typeof PANELS)[number]['key']

const DEFAULTS: Record<string, boolean> = {
  kpi: true,
  fleet: true,
  map: true,
  alerts: true,
  console: true,
  oee: true,
  shift: true,
  production: true,
  camera: true,
  chat: true,
  analytics: true,
  health: true,
  audit: true,
  webhooks: true,
  sensors: true,
  robots: true,
  reconcile: true,
  sites: true,
  annotations: true,
}

export function loadLayout(): Record<string, boolean> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return { ...DEFAULTS, ...parsed }
    }
  } catch { /* ignore */ }
  return { ...DEFAULTS }
}

export function saveLayout(layout: Record<string, boolean>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(layout))
}

interface LayoutSettingsPanelProps {
  visible: Record<string, boolean>
  onToggle: (key: string) => void
  onClose: () => void
}

export default function LayoutSettingsPanel({ visible, onToggle, onClose }: LayoutSettingsPanelProps) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <>
      <div className="map-settings-overlay" onClick={onClose} />
      <div className="layout-settings-panel">
        <div className="map-settings-header">
          <h4>Dashboard Layout</h4>
          <button className="map-settings-close" onClick={onClose}>✕</button>
        </div>
        <div className="map-settings-body">
          {PANELS.map((p) => (
            <div key={p.key} className="layout-panel-row">
              <input
                type="checkbox"
                id={`layout-${p.key}`}
                checked={visible[p.key] ?? true}
                onChange={() => onToggle(p.key)}
              />
              <label htmlFor={`layout-${p.key}`}>{p.label}</label>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
