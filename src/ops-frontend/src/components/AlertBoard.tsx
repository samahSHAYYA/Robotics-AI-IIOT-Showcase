import { useState } from 'react'
import type { Alert, Event } from '../types/telemetry'

interface AlertBoardProps {
  alerts: Alert[]
  events: Event[]
  error?: string | null
}

const SEVERITIES = [
  { key: 'critical', label: 'Critical', color: '#ef4444' },
  { key: 'warning', label: 'Warning', color: '#eab308' },
  { key: 'info', label: 'Info', color: '#3b82f6' },
]

function severityClass(s: string) {
  return s === 'critical' ? 'alert--critical' : s === 'warning' ? 'alert--warning' : 'alert--info'
}

export default function AlertBoard({ alerts, events, error }: AlertBoardProps) {
  const [activeFilter, setActiveFilter] = useState<string | null>(null)

  const filteredAlerts = activeFilter
    ? alerts.filter(a => a.severity === activeFilter)
    : alerts
  const filteredEvents = activeFilter
    ? events.filter(e => e.severity === activeFilter)
    : events

  const hasVisible = filteredAlerts.length > 0 || filteredEvents.length > 0
  const hiddenCount = (alerts.length + events.length) - (filteredAlerts.length + filteredEvents.length)

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
      <h3>Alerts & Events</h3>
      <div className="alert-legend">
        {SEVERITIES.map(s => {
          const count = alerts.filter(a => a.severity === s.key).length +
                        events.filter(e => e.severity === s.key).length
          const isActive = activeFilter === s.key
          return (
            <button
              key={s.key}
              className={`legend-btn${isActive ? ' legend-btn--active' : ''}`}
              style={{
                borderColor: s.color,
                backgroundColor: isActive ? s.color + '22' : 'transparent',
                color: isActive ? s.color : '#475569',
              }}
              onClick={() => setActiveFilter(isActive ? null : s.key)}
            >
              <span className="legend-dot" style={{ backgroundColor: s.color }} />
              {s.label}
              <span className="legend-count">{count}</span>
            </button>
          )
        })}
        {activeFilter && (
          <button className="legend-btn legend-btn--clear" onClick={() => setActiveFilter(null)}>
            Clear filter
          </button>
        )}
      </div>
      {!hasVisible && hiddenCount > 0 && (
        <div className="empty-state">
          <div className="empty-state-text">{hiddenCount} items hidden by filter</div>
        </div>
      )}
      {!hasVisible && hiddenCount === 0 && (
        <div className="empty-state empty-state--success">
          <div className="empty-state-icon">&#10003;</div>
          <div className="empty-state-text">No active alerts</div>
        </div>
      )}
      <div className="alert-list" role="log" aria-live="polite" style={{ display: hasVisible ? undefined : 'none' }}>
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
