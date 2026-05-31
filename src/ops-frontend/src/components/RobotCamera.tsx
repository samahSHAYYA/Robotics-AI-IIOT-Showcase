import { useRef, useEffect, useState, useMemo } from 'react'
import type { RobotStatus } from '../types/telemetry'

interface RobotCameraProps {
  robots: RobotStatus[]
}

interface CameraView {
  id: string
  label: string
}

const CAMERA_VIEWS: CameraView[] = [
  { id: 'depth', label: 'Depth' },
  { id: 'infrared', label: 'Infrared' },
  { id: 'left', label: 'Left RGB' },
  { id: 'right', label: 'Right RGB' },
]

function seededRandom(seed: number) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

function renderCameraFeed(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  viewId: string,
  scrollOffset: number,
  robot: RobotStatus | null,
) {
  const W = canvas.width
  const H = canvas.height

  const now = Date.now()

  ctx.clearRect(0, 0, W, H)

  // Background based on view type
  switch (viewId) {
    case 'depth':
      ctx.fillStyle = '#0a1a10'
      break
    case 'infrared':
      ctx.fillStyle = '#1a0a0a'
      break
    case 'left':
    case 'right':
    default:
      ctx.fillStyle = '#0d1520'
      break
  }
  ctx.fillRect(0, 0, W, H)

  // Grid lines
  if (viewId === 'left' || viewId === 'right') {
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.06)'
    ctx.lineWidth = 1
    for (let i = 0; i < 6; i++) {
      const y = 60 + i * 20 + (scrollOffset % 20) * 0.5
      if (y > H || y < 0) continue
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(W, y)
      ctx.stroke()
    }
  }

  if (viewId === 'infrared') {
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.06)'
    ctx.lineWidth = 1
    for (let i = 0; i < 6; i++) {
      const y = 60 + i * 20 + (scrollOffset % 20) * 0.5
      if (y > H || y < 0) continue
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(W, y)
      ctx.stroke()
    }
  }

  if (viewId === 'depth') {
    for (let i = 0; i < W; i += 20) {
      ctx.strokeStyle = `rgba(34, 197, 94, ${0.02 + Math.sin(now / 3000 + i / 50) * 0.02})`
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(i, 0)
      ctx.lineTo(i, H)
      ctx.stroke()
    }
  }

  if (robot) {
    const rand = seededRandom(
      Math.round(robot.pose.x * 100) +
      Math.round(robot.pose.y * 100) +
      (viewId === 'right' ? 999 : viewId === 'depth' ? 333 : viewId === 'infrared' ? 777 : 0),
    )

    const numBoxes = 3 + Math.floor(rand() * 4)
    for (let i = 0; i < numBoxes; i++) {
      const bx = rand() * W
      const by = 60 + rand() * (H - 80)
      const bw = 12 + rand() * 25
      const bh = 15 + rand() * 20

      switch (viewId) {
        case 'depth':
          ctx.fillStyle = `rgba(34, 197, 94, ${0.1 + rand() * 0.2})`
          ctx.strokeStyle = 'rgba(34, 197, 94, 0.2)'
          break
        case 'infrared':
          ctx.fillStyle = `rgba(239, 68, 68, ${0.15 + rand() * 0.25})`
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.2)'
          break
        default:
          ctx.fillStyle = `rgba(30, 45, 74, ${0.4 + rand() * 0.4})`
          ctx.strokeStyle = 'rgba(59, 130, 246, 0.15)'
          break
      }
      ctx.fillRect(bx, by, bw, bh)
      ctx.lineWidth = 1
      ctx.strokeRect(bx, by, bw, bh)
    }

    // Distance markers for depth view
    if (viewId === 'depth') {
      for (let i = 0; i < 4; i++) {
        const dy = 40 + i * (H / 5)
        ctx.strokeStyle = `rgba(34, 197, 94, ${0.15 - i * 0.03})`
        ctx.setLineDash([4, 6])
        ctx.beginPath()
        ctx.moveTo(0, dy)
        ctx.lineTo(W, dy)
        ctx.stroke()
        ctx.setLineDash([])
        const dist = ((4 - i) * 2).toFixed(1)
        ctx.fillStyle = 'rgba(34, 197, 94, 0.4)'
        ctx.font = 'bold 8px monospace'
        ctx.textAlign = 'right'
        ctx.fillText(`${dist}m`, W - 4, dy - 2)
      }
    }

    // Thermal scale for infrared view
    if (viewId === 'infrared') {
      const grad = ctx.createLinearGradient(0, 0, W, 0)
      grad.addColorStop(0, 'rgba(0, 0, 255, 0.3)')
      grad.addColorStop(0.25, 'rgba(0, 255, 255, 0.3)')
      grad.addColorStop(0.5, 'rgba(0, 255, 0, 0.3)')
      grad.addColorStop(0.75, 'rgba(255, 255, 0, 0.3)')
      grad.addColorStop(1, 'rgba(255, 0, 0, 0.3)')
      ctx.fillStyle = grad
      ctx.fillRect(4, H - 12, W - 8, 6)
      ctx.fillStyle = 'rgba(255,255,255,0.4)'
      ctx.font = '6px monospace'
      ctx.textAlign = 'left'
      ctx.fillText('Cold', 4, H - 14)
      ctx.textAlign = 'right'
      ctx.fillText('Hot', W - 4, H - 14)
    }

    // Task-specific visuals
    const task = robot.current_task ?? ''
    if (viewId === 'left' || viewId === 'right') {
      if (task.toLowerCase().includes('assembly') || task.toLowerCase().includes('packaging')) {
        const cx = 30 + (scrollOffset * 2) % (W - 60)
        ctx.fillStyle = '#475569'
        ctx.fillRect(0, H - 40, W, 6)
        ctx.fillStyle = '#22c55e'
        ctx.fillRect(cx, H - 41, 10, 8)
        ctx.fillStyle = '#3b82f6'
        ctx.fillRect((cx + 35) % W, H - 41, 10, 8)
      }

      if (task.toLowerCase().includes('weld')) {
        for (let i = 0; i < 6; i++) {
          const sx = 80 + Math.sin(now / 200 + i * 2) * 40
          const sy = 70 + Math.cos(now / 150 + i * 1.5) * 25
          ctx.beginPath()
          ctx.arc(sx, sy, 1.5 + Math.sin(now / 100 + i) * 1, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(234, 179, 8, ${0.3 + Math.sin(now / 80 + i) * 0.3})`
          ctx.fill()
        }
      }
    }

    // Scanning line for infrared (heat scan)
    if (viewId === 'infrared') {
      const lx = ((now / 1500) * W) % W
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(lx, 0)
      ctx.lineTo(lx, H)
      ctx.stroke()
      ctx.fillStyle = 'rgba(239, 68, 68, 0.08)'
      ctx.fillRect(lx - 1, 0, 3, H)
    }

    // Depth scanning
    if (viewId === 'depth') {
      const lx = ((now / 2500) * W) % W
      ctx.strokeStyle = 'rgba(34, 197, 94, 0.3)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(lx, 0)
      ctx.lineTo(lx, H)
      ctx.stroke()
    }
  }

  // Scan-line overlay
  if (viewId === 'left' || viewId === 'right') {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.03)'
    for (let i = 0; i < H; i += 3) {
      ctx.fillRect(0, i, W, 1)
    }

    const scanY = scrollOffset
    const scanGrad = ctx.createLinearGradient(0, scanY - 15, 0, scanY + 15)
    scanGrad.addColorStop(0, 'rgba(59, 130, 246, 0)')
    scanGrad.addColorStop(0.5, 'rgba(59, 130, 246, 0.06)')
    scanGrad.addColorStop(1, 'rgba(59, 130, 246, 0)')
    ctx.fillStyle = scanGrad
    ctx.fillRect(0, scanY - 15, W, 30)
  }

  // Vignette
  const vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.7)
  vignette.addColorStop(0, 'rgba(0,0,0,0)')
  vignette.addColorStop(1, 'rgba(0,0,0,0.4)')
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, W, H)

  // Corner brackets
  ctx.strokeStyle = viewId === 'depth' ? 'rgba(34, 197, 94, 0.5)' :
    viewId === 'infrared' ? 'rgba(239, 68, 68, 0.5)' :
    'rgba(59, 130, 246, 0.5)'
  ctx.lineWidth = 2
  const bs = 12
  const m = 6
  ctx.beginPath()
  ctx.moveTo(m, m + bs); ctx.lineTo(m, m); ctx.lineTo(m + bs, m)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(W - m - bs, m); ctx.lineTo(W - m, m); ctx.lineTo(W - m, m + bs)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(m, H - m - bs); ctx.lineTo(m, H - m); ctx.lineTo(m + bs, H - m)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(W - m - bs, H - m); ctx.lineTo(W - m, H - m); ctx.lineTo(W - m, H - m - bs)
  ctx.stroke()
}

export default function RobotCamera({ robots }: RobotCameraProps) {
  const [selectedId, setSelectedId] = useState<string>(
    robots.length > 0 ? robots[0].robot_id : '',
  )

  const canvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({})
  const rafRef = useRef<number>(0)
  const scrollRef = useRef(0)

  const selectedRobot = useMemo(
    () => robots.find((r) => r.robot_id === selectedId) ?? null,
    [robots, selectedId],
  )

  useEffect(() => {
    if (!robots.find((r) => r.robot_id === selectedId) && robots.length > 0) {
      setSelectedId(robots[0].robot_id)
    }
  }, [robots, selectedId])

  useEffect(() => {
    const W = 240
    const H = 180

    CAMERA_VIEWS.forEach((view) => {
      const canvas = canvasRefs.current[view.id]
      if (!canvas) return
      canvas.width = W
      canvas.height = H
    })

    const render = () => {
      scrollRef.current = (scrollRef.current + 0.5) % H
      CAMERA_VIEWS.forEach((view) => {
        const canvas = canvasRefs.current[view.id]
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        renderCameraFeed(ctx, canvas, view.id, scrollRef.current, selectedRobot)
      })
      rafRef.current = requestAnimationFrame(render)
    }

    rafRef.current = requestAnimationFrame(render)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [selectedRobot])

  if (robots.length === 0) {
    return (
      <div className="robot-camera">
        <h3>Robot Camera Feed</h3>
        <div className="empty-state">
          <div className="empty-state-text">No robots available</div>
        </div>
      </div>
    )
  }

  return (
    <div className="robot-camera">
      <div className="camera-tab-select-row">
        <label htmlFor="camera-select">Robot:</label>
        <select
          id="camera-select"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          {robots.map((r) => (
            <option key={r.robot_id} value={r.robot_id}>
              {r.name} ({r.robot_id})
            </option>
          ))}
        </select>
      </div>
      <div className="camera-grid-4">
        {CAMERA_VIEWS.map((view) => (
          <div key={view.id} className="camera-feed">
            <div className="camera-feed-label">{view.label}</div>
            <div className="camera-feed-canvas-wrap">
              <canvas
                ref={(el) => { canvasRefs.current[view.id] = el }}
                style={{ imageRendering: 'pixelated' }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
