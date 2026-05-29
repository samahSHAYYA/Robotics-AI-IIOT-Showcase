export interface RobotPose {
  x: number
  y: number
  theta: number
}

export interface RobotStatus {
  robot_id: string
  name: string
  status: 'idle' | 'active' | 'maintenance' | 'error' | 'offline'
  uptime_pct: number
  current_task: string | null
  pose: RobotPose
}

export interface Alert {
  severity: 'healthy' | 'info' | 'warning' | 'critical'
  message: string
  timestamp: string
}

export interface TelemetrySnapshot {
  throughput: number
  defect_rate_pct: number
  robot_uptime_pct: number
  robots: RobotStatus[]
  alerts: Alert[]
  events_consumed: number
  predictions_consumed: number
  last_update: string
}

export interface Event {
  id: string
  type: string
  subtype: string
  severity: 'info' | 'warning' | 'critical'
  robot_id: string
  timestamp: string
  value?: number
  unit?: string
  detail?: string
}

export interface MLPrediction {
  event_id: string
  prediction_type: string
  confidence: number
  predicted_value: number | null
  recommendation: string
}

export interface CommandPayload {
  command: string
  robot_id: string
  parameters: Record<string, number | string | boolean>
}
