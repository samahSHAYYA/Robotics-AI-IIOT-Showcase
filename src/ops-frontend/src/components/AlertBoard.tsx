import type { Alert, Event } from '../types/telemetry'

interface AlertBoardProps {
  alerts: Alert[]
  events: Event[]
  error?: string | null
}

const severityClass = (s: string) =>
  s === 'critical' ? 'alert--critical' : s === 'warning' ? 'alert--warning' : 'alert--info'

export default function AlertBoard({ alerts, events, error }: AlertBoardProps) {
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
          <div className="empty-state-icon">✓</div>
          <div className="empty-state-text">No active alerts</div>
        </div>
      </div>
    )
  }

  return (
    <div className="alert-board">
      <h3>Alerts & Events</h3>
      <div className="alert-list">
        {[...alerts].reverse().slice(0, 10).map((a, i) => (
          <div key={`alert-${i}`} class={`alert-item ${severityClass(a.severity)}`}>
            <span className="alert-time">{new Date(a.timestamp).toLocaleTimeString()}</span>
            <span className="alert-badge">{a.severity}</span>
            <span className="alert-detail">{a.message}</span>
          </div>
        ))}
        {[...events].reverse().slice(0, 10).map((ev) => (
          <div key={ev.id} class={`alert-item ${severityClass(ev.severity)}`}>
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
