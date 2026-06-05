export interface RobotJoints {
  shoulder_pitch?: number    // -90 to 90
  shoulder_roll?: number    // -45 to 45
  elbow?: number            // 0 to 180
  wrist?: number            // -90 to 90
  head_pan?: number         // -60 to 60
  head_tilt?: number        // -30 to 30
  gripper?: number          // 0 (open) to 100 (closed)
}

export interface RobotPose {
  x: number
  y: number
  theta: number
  joints?: RobotJoints
}

export interface RobotStatus {
  robot_id: string
  name: string
  status: 'idle' | 'active' | 'moving' | 'maintenance' | 'error' | 'offline'
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
  workers?: WorkerStatus[]
  alerts: Alert[]
  events_consumed: number
  predictions_consumed: number
  data_source?: 'ros2' | 'mock'
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

export interface WorkerStatus {
  worker_id: string
  name: string
  x: number
  y: number
  zone: string
  active: boolean
}

export interface CommandPayload {
  command: string
  robot_id: string
  parameters: Record<string, number | string | boolean>
}
