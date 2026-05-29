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
const COLLISION_GLOW_DIST = 1.0

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

const statusColor = (status: string): string => {
  switch (status) {
    case 'moving':
    case 'active':
      return '#22c55e'
    case 'idle':
      return '#6b7280'
    case 'error':
      return '#ef4444'
    case 'maintenance':
      return '#eab308'
    default:
      return '#6b7280'
  }
}

function renderRobotTriangle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  theta: number,
  color: string,
  glow: boolean,
) {
  const size = 10
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(theta)

  if (glow) {
    ctx.shadowColor = '#ef4444'
    ctx.shadowBlur = 20
  }

  ctx.beginPath()
  ctx.moveTo(size, 0)
  ctx.lineTo(-size * 0.7, -size * 0.6)
  ctx.lineTo(-size * 0.7, size * 0.6)
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
  ctx.shadowBlur = 0

  ctx.restore()
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
  const [selectedRobot, setSelectedRobot] = useState<InterpRobot | null>(null)
  const [popupPos, setPopupPos] = useState({ x: 0, y: 0 })

  const scale = (v: number) => (v / 10) * FACTORY_W

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

      // Remove robots no longer in target
      const targetIds = new Set(target.map((t) => t.robot_id))
      for (let i = interp.length - 1; i >= 0; i--) {
        if (!targetIds.has(interp[i].robot_id)) {
          interp.splice(i, 1)
        }
      }

      // Detect collisions
      const closePairs = new Set<string>()
      for (let i = 0; i < interp.length; i++) {
        for (let j = i + 1; j < interp.length; j++) {
          const dx = interp[i].x - interp[j].x
          const dy = interp[i].y - interp[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < COLLISION_GLOW_DIST) {
            closePairs.add(interp[i].robot_id)
            closePairs.add(interp[j].robot_id)
          }
        }
      }

      // Draw background
      ctx.clearRect(0, 0, w, h)
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

      // Draw robots
      for (const r of interp) {
        const cx = scale(r.x)
        const cy = scale(r.y)
        const color = statusColor(r.status)
        const glow = closePairs.has(r.robot_id)

        renderRobotTriangle(ctx, cx, cy, r.theta, color, glow)

        // Robot ID label
        ctx.fillStyle = '#e2e8f0'
        ctx.font = '11px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(r.robot_id, cx, cy - 18)
      }

      rafRef.current = requestAnimationFrame(render)
    }

    rafRef.current = requestAnimationFrame(render)

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const mx = ((e.clientX - rect.left) / rect.width) * canvas.width
      const my = ((e.clientY - rect.top) / rect.height) * canvas.height

      // Check if click is near any robot
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
    [], // eslint-disable-line react-hooks/exhaustive-deps
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
          height: 'auto',
          borderRadius: '0.5rem',
          cursor: 'pointer',
          display: 'block',
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
