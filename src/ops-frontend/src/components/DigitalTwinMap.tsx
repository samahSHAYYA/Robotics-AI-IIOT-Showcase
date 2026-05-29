import { useRef, useEffect, useState, useCallback } from 'react'
import type { RobotStatus } from '../types/telemetry'

interface DigitalTwinMapProps {
  robots: RobotStatus[]
  error?: string | null
  onRobotStart?: (id: string) => void
  onRobotStop?: (id: string) => void
}

const FACTORY_W = 600
const FACTORY_H = 400

interface InterpRobot {
  robot_id: string
  name: string
  status: string
  x: number
  y: number
  theta: number
  uptime_pct: number
  current_task: string | null
}

/** Maximum trail positions to store per robot */
const MAX_TRAIL = 20

/** Robot waypoint paths (matching backend store.py) */
const ROBOT_PATHS: Record<string, Array<{ x: number; y: number }>> = {
  C3: [{ x: 1, y: 1 }, { x: 8, y: 1 }, { x: 8, y: 5 }, { x: 5, y: 8 }, { x: 1, y: 5 }],
  W2: [{ x: 7, y: 2 }, { x: 9, y: 7 }, { x: 4, y: 9 }, { x: 2, y: 4 }],
  Q1: [{ x: 3, y: 3 }, { x: 6, y: 3 }, { x: 6, y: 6 }, { x: 3, y: 6 }],
}

/** Map status → color */
const statusColor = (status: string): string => {
  switch (status) {
    case 'moving':
    case 'active':
      return '#22c55e'
    case 'idle':
      return '#6b7280'
    case 'error':
    case 'critical':
      return '#ef4444'
    case 'maintenance':
    case 'warning':
      return '#eab308'
    case 'offline':
      return '#6b7280'
    default:
      return '#6b7280'
  }
}

/**
 * Compute a blink alpha multiplier based on status and time.
 * - active/moving: slow pulse (green)
 * - idle: solid (no blink)
 * - error/critical: fast pulse (red)
 * - warning/maintenance: medium pulse (orange)
 * - offline: dimmed static
 */
function blinkAlpha(status: string, timeMs: number): number {
  switch (status) {
    case 'moving':
    case 'active':
      // Slow pulse ~1s period, prominent (0.4→1.0)
      return 0.4 + 0.6 * Math.sin(timeMs / 500)
    case 'error':
    case 'critical':
      // Fast pulse ~0.3s period, sharp (0.3→1.0)
      return 0.3 + 0.7 * Math.sin(timeMs / 150)
    case 'maintenance':
    case 'warning':
      // Medium pulse ~0.6s period (0.4→1.0)
      return 0.4 + 0.6 * Math.sin(timeMs / 300)
    case 'offline':
      return 0.4
    case 'idle':
    default:
      return 1.0
  }
}

/** Draw robot as circular base + direction arrow */
function renderRobotShape(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  theta: number,
  color: string,
  alpha: number,
  collisionGlow: boolean,
) {
  const radius = 8
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(x, y)

  // Collision glow ring
  if (collisionGlow) {
    ctx.beginPath()
    ctx.arc(0, 0, radius * 2.2, 0, Math.PI * 2)
    ctx.strokeStyle = '#ef4444'
    ctx.lineWidth = 2
    ctx.setLineDash([4, 4])
    ctx.stroke()
    ctx.setLineDash([])
  }

  // Circular base with subtle gradient
  const grad = ctx.createRadialGradient(-2, -2, 0, 0, 0, radius)
  grad.addColorStop(0, '#ffffff')
  grad.addColorStop(0.3, color)
  grad.addColorStop(1, '#000000')
  ctx.beginPath()
  ctx.arc(0, 0, radius, 0, Math.PI * 2)
  ctx.fillStyle = grad
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.4)'
  ctx.lineWidth = 1
  ctx.stroke()

  // Direction arrow (pointing toward theta, from center outward)
  ctx.save()
  ctx.rotate(theta)
  ctx.beginPath()
  ctx.moveTo(radius + 4, 0)
  ctx.lineTo(radius - 2, -4)
  ctx.lineTo(radius - 2, 4)
  ctx.closePath()
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.restore()

  // Center dot
  ctx.beginPath()
  ctx.arc(0, 0, 2, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()

  ctx.restore()
}

/** Draw a radar beacon pulse — expanding concentric rings */
function renderBeacon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  timeMs: number,
) {
  const numRings = 3
  const period = 1500 // ms for full cycle
  const maxRadius = 22

  for (let i = 0; i < numRings; i++) {
    const phase = (i / numRings) * period
    const t = ((timeMs + phase) % period) / period // 0 → 1
    const radius = t * maxRadius
    const opacity = 0.4 * (1 - t)

    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.globalAlpha = opacity
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

/** Draw a dotted trail of recent positions */
function renderTrail(
  ctx: CanvasRenderingContext2D,
  trail: Array<{ x: number; y: number }>,
  scaleFn: (v: number) => number,
  color: string,
  maxTrail: number,
) {
  if (trail.length < 2) return

  for (let i = 1; i < trail.length; i++) {
    const t = i / maxTrail // 0→1
    const alpha = 0.2 + 0.8 * t
    const cx = scaleFn(trail[i].x)
    const cy = scaleFn(trail[i].y)

    ctx.beginPath()
    ctx.arc(cx, cy, 2, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.globalAlpha = alpha
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

/** Draw a dotted trajectory showing the future path through waypoints */
function renderTrajectoryAhead(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  robotId: string,
  scaleFn: (v: number) => number,
  color: string,
) {
  const path = ROBOT_PATHS[robotId]
  if (!path || path.length < 2) return

  // Find nearest waypoint ahead
  let minDist = Infinity
  let nearestIdx = 0
  for (let i = 0; i < path.length; i++) {
    const d = Math.hypot(path[i].x - x, path[i].y - y)
    if (d < minDist) {
      minDist = d
      nearestIdx = i
    }
  }

  // Build ordered list from nearest waypoint forward (wrap around once for visual continuity)
  const ahead: Array<{ x: number; y: number }> = []
  ahead.push({ x, y })
  for (let offset = 0; offset <= path.length; offset++) {
    const idx = (nearestIdx + offset) % path.length
    ahead.push(path[idx])
  }

  ctx.save()
  ctx.setLineDash([4, 6])
  ctx.lineWidth = 1.5
  ctx.globalAlpha = 0.35
  ctx.strokeStyle = color
  ctx.beginPath()
  for (let i = 0; i < ahead.length; i++) {
    const sx = scaleFn(ahead[i].x)
    const sy = scaleFn(ahead[i].y)
    if (i === 0) ctx.moveTo(sx, sy)
    else ctx.lineTo(sx, sy)
  }
  ctx.stroke()
  ctx.setLineDash([])
  ctx.globalAlpha = 1
  ctx.restore()
}

/** Draw robot label with subtle background box */
function renderLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  robotId: string,
  status: string,
) {
  const text = robotId
  ctx.font = 'bold 11px sans-serif'
  const metrics = ctx.measureText(text)
  const tw = metrics.width
  const th = 14
  const bx = x - tw / 2 - 4
  const by = y - 24

  // Background box
  ctx.fillStyle = 'rgba(11, 17, 33, 0.75)'
  ctx.beginPath()
  ctx.roundRect(bx, by, tw + 8, th + 4, 3)
  ctx.fill()

  // Border color matches status
  const borderColor = statusColor(status)
  ctx.strokeStyle = borderColor
  ctx.lineWidth = 1
  ctx.globalAlpha = 0.4
  ctx.beginPath()
  ctx.roundRect(bx, by, tw + 8, th + 4, 3)
  ctx.stroke()
  ctx.globalAlpha = 1

  // Text
  ctx.fillStyle = '#e2e8f0'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x, by + (th + 4) / 2)
  ctx.textBaseline = 'alphabetic'
}

export default function DigitalTwinMap({
  robots,
  error,
  onRobotStart,
  onRobotStop,
}: DigitalTwinMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const interpRef = useRef<InterpRobot[]>([])
  const targetRef = useRef<InterpRobot[]>([])

  /** Trail storage: robot_id → array of {x, y} positions */
  const trailsRef = useRef<Record<string, Array<{ x: number; y: number }>>>({})

  const [selectedRobot, setSelectedRobot] = useState<InterpRobot | null>(null)
  const [popupPos, setPopupPos] = useState({ x: 0, y: 0 })

  const scale = useCallback((v: number) => (v / 10) * FACTORY_W, [])

  // Sync target robots from props
  useEffect(() => {
    targetRef.current = robots.map((r) => ({
      robot_id: r.robot_id,
      name: r.name,
      status: r.status,
      x: r.pose.x,
      y: r.pose.y,
      theta: r.pose.theta,
      uptime_pct: r.uptime_pct,
      current_task: r.current_task,
    }))
  }, [robots])

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const LERP_FACTOR = 0.08

    const render = () => {
      const w = canvas.width
      const h = canvas.height
      const now = Date.now()

      // Interpolate positions
      const interp = interpRef.current
      const target = targetRef.current

      for (const t of target) {
        let existing = interp.find((i) => i.robot_id === t.robot_id)
        if (existing) {
          existing.x += (t.x - existing.x) * LERP_FACTOR
          existing.y += (t.y - existing.y) * LERP_FACTOR
          existing.theta += (t.theta - existing.theta) * LERP_FACTOR
          existing.status = t.status
          existing.current_task = t.current_task
          existing.uptime_pct = t.uptime_pct
        } else {
          interp.push({ ...t })
        }
      }

      // Clamp positions to visible floor bounds
      const CLAMP_MIN = 0.5
      const CLAMP_MAX = 9.5
      for (const r of interp) {
        r.x = Math.max(CLAMP_MIN, Math.min(CLAMP_MAX, r.x))
        r.y = Math.max(CLAMP_MIN, Math.min(CLAMP_MAX, r.y))
      }

      // Remove robots no longer in target
      const targetIds = new Set(target.map((t) => t.robot_id))
      for (let i = interp.length - 1; i >= 0; i--) {
        if (!targetIds.has(interp[i].robot_id)) {
          interp.splice(i, 1)
        }
      }

      // Update trails — append interpolated position for each robot
      const trails = trailsRef.current
      for (const r of interp) {
        if (!trails[r.robot_id]) {
          trails[r.robot_id] = []
        }
        const trail = trails[r.robot_id]
        // Only add if position changed significantly to avoid dense clusters
        const last = trail[trail.length - 1]
        if (
          !last ||
          Math.abs(r.x - last.x) > 0.02 ||
          Math.abs(r.y - last.y) > 0.02
        ) {
          trail.push({ x: r.x, y: r.y })
          if (trail.length > MAX_TRAIL) {
            trail.splice(0, trail.length - MAX_TRAIL)
          }
        }
      }
      // Clean up trails for robots no longer present
      for (const rid of Object.keys(trails)) {
        if (!targetIds.has(rid)) {
          delete trails[rid]
        }
      }

      // Detect collisions
      const closePairs = new Set<string>()
      for (let i = 0; i < interp.length; i++) {
        for (let j = i + 1; j < interp.length; j++) {
          const dx = interp[i].x - interp[j].x
          const dy = interp[i].y - interp[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 1.0) {
            closePairs.add(interp[i].robot_id)
            closePairs.add(interp[j].robot_id)
          }
        }
      }

      // Draw everything
      ctx.clearRect(0, 0, w, h)

      // Background
      ctx.fillStyle = '#1e293b'
      ctx.beginPath()
      ctx.roundRect(0, 0, w, h, 8)
      ctx.fill()

      // Grid lines
      ctx.strokeStyle = '#334155'
      ctx.lineWidth = 1
      ctx.setLineDash([8, 4])
      ctx.beginPath()
      for (let i = 1; i < 3; i++) {
        const x = (w / 3) * i
        ctx.moveTo(x, 0)
        ctx.lineTo(x, h)
      }
      ctx.stroke()
      ctx.setLineDash([])

      // Zone labels
      ctx.fillStyle = '#475569'
      ctx.font = '11px sans-serif'
      ctx.textAlign = 'center'
      const zones = ['Assembly A', 'Welding Bay', 'Inspection']
      for (let i = 0; i < 3; i++) {
        ctx.fillText(zones[i], (w / 6) + (w / 3) * i, h - 8)
      }

      // Visible floor boundary (0.5-9.5 mapped)
      ctx.strokeStyle = 'rgba(59,130,246,0.12)'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 6])
      ctx.strokeRect(scale(0.5), scale(0.5), scale(9), scale(9))
      ctx.setLineDash([])
      // Note: the above computes the boundary rectangle correctly.
      // Simpler approach:
      ctx.strokeStyle = 'rgba(59,130,246,0.12)'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 6])
      ctx.strokeRect(scale(0.5), scale(0.5), scale(9), scale(9))
      ctx.setLineDash([])

      // Draw trails first (behind robots)
      for (const r of interp) {
        const trail = trails[r.robot_id]
        if (trail && trail.length >= 2) {
          const color = statusColor(r.status)
          renderTrail(ctx, trail, scale, color, MAX_TRAIL)
        }
      }

      // Draw future trajectory ahead for each robot
      for (const r of interp) {
        const color = statusColor(r.status)
        renderTrajectoryAhead(ctx, r.x, r.y, r.robot_id, scale, color)
      }

      // Draw beacons + robots
      for (const r of interp) {
        const cx = scale(r.x)
        const cy = scale(r.y)
        const color = statusColor(r.status)
        const glow = closePairs.has(r.robot_id)

        // Beacon pulse for active/moving robots
        if (r.status === 'moving' || r.status === 'active') {
          renderBeacon(ctx, cx, cy, color, now)
        }

        // Blink alpha
        const alpha = blinkAlpha(r.status, now)

        // Render robot shape
        renderRobotShape(ctx, cx, cy, r.theta, color, alpha, glow)

        // Robot ID label with background box
        renderLabel(ctx, cx, cy, r.robot_id, r.status)
      }

      rafRef.current = requestAnimationFrame(render)
    }

    rafRef.current = requestAnimationFrame(render)

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [scale])

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const mx = ((e.clientX - rect.left) / rect.width) * canvas.width
      const my = ((e.clientY - rect.top) / rect.height) * canvas.height

      let found: InterpRobot | null = null
      for (const r of interpRef.current) {
        const cx = scale(r.x)
        const cy = scale(r.y)
        const dx = mx - cx
        const dy = my - cy
        if (Math.sqrt(dx * dx + dy * dy) < 20) {
          found = r
          break
        }
      }

      if (found) {
        setSelectedRobot(found)
        setPopupPos({ x: e.clientX, y: e.clientY })
      } else {
        setSelectedRobot(null)
      }
    },
    [scale],
  )

  if (error) {
    return (
      <div className="digital-twin">
        <h3>Factory Floor</h3>
        <div className="error-banner">
          <span className="error-text">{error}</span>
        </div>
      </div>
    )
  }

  if (robots.length === 0) {
    return (
      <div className="digital-twin">
        <h3>Factory Floor</h3>
        <div className="empty-state">
          <div className="empty-state-text">Waiting for robot telemetry...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="digital-twin" style={{ position: 'relative' }}>
      <h3>Factory Floor</h3>
      <canvas
        ref={canvasRef}
        width={FACTORY_W}
        height={FACTORY_H}
        onClick={handleCanvasClick}
        style={{
          width: '100%',
          height: '100%',
          borderRadius: '0.5rem',
          cursor: 'pointer',
          display: 'block',
          objectFit: 'contain',
        }}
      />
      {selectedRobot && (
        <div
          className="robot-popup"
          style={{
            position: 'fixed',
            left: popupPos.x + 12,
            top: popupPos.y - 80,
            zIndex: 1000,
            background: '#131d31',
            border: '1px solid #1e2d4a',
            borderRadius: '0.5rem',
            padding: '0.75rem',
            minWidth: '160px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: '0.3rem', color: '#e2e8f0' }}>
            {selectedRobot.name}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#7e93b4', marginBottom: '0.2rem' }}>
            Status: {selectedRobot.status}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#7e93b4', marginBottom: '0.2rem' }}>
            Task: {selectedRobot.current_task ?? 'none'}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#7e93b4', marginBottom: '0.5rem' }}>
            Uptime: {selectedRobot.uptime_pct.toFixed(1)}%
          </div>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button
              className="robot-popup-btn"
              onClick={(e) => {
                e.stopPropagation()
                onRobotStart?.(selectedRobot.robot_id)
              }}
              style={{
                background: '#22c55e',
                border: 'none',
                color: '#fff',
                padding: '0.2rem 0.6rem',
                borderRadius: '0.25rem',
                fontSize: '0.7rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Start
            </button>
            <button
              className="robot-popup-btn"
              onClick={(e) => {
                e.stopPropagation()
                onRobotStop?.(selectedRobot.robot_id)
              }}
              style={{
                background: '#ef4444',
                border: 'none',
                color: '#fff',
                padding: '0.2rem 0.6rem',
                borderRadius: '0.25rem',
                fontSize: '0.7rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Stop
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
