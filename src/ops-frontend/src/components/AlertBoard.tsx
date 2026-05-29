import type { Event } from '../types/telemetry'

interface AlertBoardProps {
  events: Event[]
}

const severityClass = (s: string) =>
  s === 'critical' ? 'alert--critical' : s === 'warning' ? 'alert--warning' : 'alert--info'

export default function AlertBoard({ events }: AlertBoardProps) {
  return (
    <div class="alert-board">
      <h3>Live Events</h3>
      <div class="alert-list">
        {events.length === 0 && <div class="alert-empty">No events yet</div>}
        {[...events].reverse().slice(0, 20).map((ev) => (
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
