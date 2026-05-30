import { useState } from 'react'
import type { Alert, Event } from '../types/telemetry'
import useAlertNotifications from '../hooks/useAlertNotifications'

interface AlertBoardProps {
  alerts: Alert[]
  events: Event[]
  error?: string | null
}

const SEVERITIES = [
  { key: 'critical', label: 'Critical', color: '#ef4444' },
  { key: 'warning', label: 'Warning', color: '#eab308' },
  { key: 'info', label: 'Info', color: '#3b82f6' },
  { key: 'healthy', label: 'Healthy', color: '#22c55e' },
]

function severityClass(s: string) {
  return s === 'critical' ? 'alert--critical' : s === 'warning' ? 'alert--warning' : 'alert--info'
}

export default function AlertBoard({ alerts, events, error }: AlertBoardProps) {
  const [filters, setFilters] = useState<Set<string>>(new Set(SEVERITIES.map(s => s.key)))
  const { notifEnabled, setNotifEnabled } = useAlertNotifications(alerts)

  const toggleFilter = (key: string) => {
    const next = new Set(filters)
    if (next.has(key)) {
      if (next.size > 1) next.delete(key)
    } else {
      next.add(key)
    }
    setFilters(next)
  }

  const filteredAlerts = alerts.filter(a => filters.has(a.severity))
  const filteredEvents = events.filter(e => filters.has(e.severity))

  if (error) {
    return (
      <div className="alert-board">
        <h3>Alerts & Events</h3>
        <div className="error-banner">
          <span className="error-text">{error}</span>
        </div>
      </div>
    )
  }

  if (alerts.length === 0 && events.length === 0) {
    return (
      <div className="alert-board">
        <h3>Alerts & Events</h3>
        <div className="empty-state empty-state--success">
          <div className="empty-state-icon">&#10003;</div>
          <div className="empty-state-text">No active alerts</div>
        </div>
      </div>
    )
  }

  return (
    <div className="alert-board">
      <h3>
        Alerts & Events
        <button
          className={`notif-toggle-btn${notifEnabled ? ' notif-toggle-btn--on' : ''}`}
          onClick={() => setNotifEnabled(!notifEnabled)}
          title={notifEnabled ? 'Disable notifications' : 'Enable notifications'}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </button>
      </h3>
      <div className="alert-legend">
        {SEVERITIES.map(s => (
          <button
            key={s.key}
            className={`legend-btn${filters.has(s.key) ? ' legend-btn--active' : ''}`}
            style={{
              borderColor: s.color,
              backgroundColor: filters.has(s.key) ? s.color + '22' : 'transparent',
              color: filters.has(s.key) ? s.color : '#475569',
            }}
            onClick={() => toggleFilter(s.key)}
          >
            <span className="legend-dot" style={{ backgroundColor: s.color }} />
            {s.label}
          </button>
        ))}
      </div>
      <div className="alert-list" role="log" aria-live="polite">
        {filteredAlerts.slice(0, 15).map((a, i) => (
          <div key={`alert-${i}`} className={`alert-item ${severityClass(a.severity)}`}>
            <span className="alert-time">{new Date(a.timestamp).toLocaleTimeString()}</span>
            <span className="alert-badge">{a.severity}</span>
            <span className="alert-detail">{a.message}</span>
          </div>
        ))}
        {filteredEvents.slice(0, 10).map((ev) => (
          <div key={ev.id} className={`alert-item ${severityClass(ev.severity)}`}>
            <span className="alert-time">{new Date(ev.timestamp).toLocaleTimeString()}</span>
            <span className="alert-badge">{ev.severity}</span>
            <span className="alert-type">{ev.subtype}</span>
            <span className="alert-detail">{ev.detail ?? `${ev.value ?? ''} ${ev.unit ?? ''}`}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
