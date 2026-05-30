import type { RobotStatus } from '../types/telemetry'

interface TelemetryExportProps {
  robots: RobotStatus[]
}

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

function timestamp(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

export default function TelemetryExport({ robots }: TelemetryExportProps) {
  const toCSV = (): string => {
    const header = 'robot_id,name,status,x,y,theta,uptime_pct,current_task,timestamp'
    const rows = robots.map(r =>
      [
        r.robot_id,
        r.name,
        r.status,
        r.pose.x.toFixed(2),
        r.pose.y.toFixed(2),
        r.pose.theta.toFixed(2),
        r.uptime_pct.toFixed(2),
        r.current_task ?? '',
        new Date().toISOString(),
      ].join(',')
    )
    return [header, ...rows].join('\n')
  }

  const toJSON = (): string => {
    const payload = {
      exported_at: new Date().toISOString(),
      robot_count: robots.length,
      robots: robots.map(r => ({
        robot_id: r.robot_id,
        name: r.name,
        status: r.status,
        x: r.pose.x,
        y: r.pose.y,
        theta: r.pose.theta,
        uptime_pct: r.uptime_pct,
        current_task: r.current_task,
      })),
    }
    return JSON.stringify(payload, null, 2)
  }

  const download = (content: string, mime: string, ext: string) => {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `telemetry-${timestamp()}.${ext}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleCSV = () => download(toCSV(), 'text/csv', 'csv')
  const handleJSON = () => download(toJSON(), 'application/json', 'json')

  return (
    <div className="export-btn-group">
      <button className="export-btn" onClick={handleCSV} disabled={robots.length === 0}>
        CSV
      </button>
      <button className="export-btn" onClick={handleJSON} disabled={robots.length === 0}>
        JSON
      </button>
    </div>
  )
}
