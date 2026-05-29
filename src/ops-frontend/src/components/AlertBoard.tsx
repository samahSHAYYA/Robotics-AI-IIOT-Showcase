import type { Alert, Event } from '../types/telemetry'

interface AlertBoardProps {
  alerts: Alert[]
  events: Event[]
}

const severityClass = (s: string) =>
  s === 'critical' ? 'alert--critical' : s === 'warning' ? 'alert--warning' : 'alert--info'

export default function AlertBoard({ alerts, events }: AlertBoardProps) {
  return (
    <div class="alert-board">
      <h3>Alerts & Events</h3>
      <div class="alert-list">
        {alerts.length === 0 && events.length === 0 && <div class="alert-empty">No alerts or events</div>}
        {[...alerts].reverse().slice(0, 10).map((a, i) => (
          <div key={`alert-${i}`} class={`alert-item ${severityClass(a.severity)}`}>
            <span class="alert-time">{new Date(a.timestamp).toLocaleTimeString()}</span>
            <span class="alert-badge">{a.severity}</span>
            <span class="alert-detail">{a.message}</span>
          </div>
        ))}
        {[...events].reverse().slice(0, 10).map((ev) => (
          <div key={ev.id} class={`alert-item ${severityClass(ev.severity)}`}>
            <span class="alert-time">{new Date(ev.timestamp).toLocaleTimeString()}</span>
            <span class="alert-badge">{ev.severity}</span>
            <span class="alert-type">{ev.subtype}</span>
            <span class="alert-detail">{ev.detail ?? `${ev.value ?? ''} ${ev.unit ?? ''}`}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
