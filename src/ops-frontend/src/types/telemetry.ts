export interface RobotStatus {
  robot_id: string
  status: 'idle' | 'active' | 'maintenance' | 'error' | 'offline'
  pose: { x: number; y: number; theta: number }
  joint_angles: number[]
  current_task: string | null
  uptime_seconds: number
}

export interface TelemetrySnapshot {
  robot_id: string
  timestamp: string
  cpu_temp_c: number
  battery_pct: number
  motor_load_pct: number
  network_latency_ms: number
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
