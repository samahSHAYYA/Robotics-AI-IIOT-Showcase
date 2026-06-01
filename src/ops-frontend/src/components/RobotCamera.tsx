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
  { id: 'cam1', label: 'Camera 1' },
  { id: 'cam2', label: 'Camera 2' },
  { id: 'cam3', label: 'Camera 3' },
  { id: 'cam4', label: 'Camera 4' },
  { id: 'cam5', label: 'Camera 5' },
  { id: 'cam6', label: 'Camera 6' },
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

  switch (viewId) {
    case 'cam1':
      ctx.fillStyle = '#0a1a10'
      break
    case 'cam2':
      ctx.fillStyle = '#1a0a0a'
      break
    case 'cam3':
    case 'cam4':
      ctx.fillStyle = '#0d1520'
      break
    case 'cam5':
      ctx.fillStyle = '#050f05'
      break
    case 'cam6':
      ctx.fillStyle = '#07070f'
      break
    default:
      ctx.fillStyle = '#0d1520'
      break
  }
  ctx.fillRect(0, 0, W, H)

  if (viewId === 'cam3' || viewId === 'cam4') {
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

  if (viewId === 'cam2') {
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

  if (viewId === 'cam1') {
    for (let i = 0; i < W; i += 20) {
      ctx.strokeStyle = `rgba(34, 197, 94, ${0.02 + Math.sin(now / 3000 + i / 50) * 0.02})`
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(i, 0)
      ctx.lineTo(i, H)
      ctx.stroke()
    }
  }

  if (viewId === 'cam5') {
    // night-vision horizontal scan lines
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.07)'
    ctx.lineWidth = 1
    for (let i = 0; i < H; i += 4) {
      const y = i + (scrollOffset % 4)
      if (y > H || y < 0) continue
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(W, y)
      ctx.stroke()
    }
  }

  if (viewId === 'cam6') {
    // sonar range rings
    const cx = W / 2
    const cy = H / 2
    for (let r = 1; r <= 4; r++) {
      const radius = (r / 4) * Math.min(W, H) * 0.45
      ctx.strokeStyle = `rgba(0, 200, 255, ${0.08 + (1 - r / 4) * 0.1})`
      ctx.lineWidth = 0.5
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      ctx.stroke()
    }
    // radial grid lines
    for (let a = 0; a < 360; a += 30) {
      const rad = (a * Math.PI) / 180
      ctx.strokeStyle = 'rgba(0, 200, 255, 0.04)'
      ctx.lineWidth = 0.5
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + Math.cos(rad) * Math.min(W, H) * 0.45, cy + Math.sin(rad) * Math.min(W, H) * 0.45)
      ctx.stroke()
    }
  }

  if (robot) {
    const rand = seededRandom(
      Math.round(robot.pose.x * 100) +
      Math.round(robot.pose.y * 100) +
      (viewId === 'cam2' ? 999 : viewId === 'cam3' ? 333 : viewId === 'cam4' ? 777 : viewId === 'cam5' ? 555 : viewId === 'cam6' ? 222 : 0),
    )

    const numBoxes = 3 + Math.floor(rand() * 4)
    for (let i = 0; i < numBoxes; i++) {
      const bx = rand() * W
      const by = 60 + rand() * (H - 80)
      const bw = 12 + rand() * 25
      const bh = 15 + rand() * 20

      switch (viewId) {
        case 'cam1':
          ctx.fillStyle = `rgba(34, 197, 94, ${0.1 + rand() * 0.2})`
          ctx.strokeStyle = 'rgba(34, 197, 94, 0.2)'
          break
        case 'cam2':
          ctx.fillStyle = `rgba(239, 68, 68, ${0.15 + rand() * 0.25})`
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.2)'
          break
        case 'cam5':
          ctx.fillStyle = `rgba(34, 197, 94, ${0.3 + rand() * 0.5})`
          ctx.strokeStyle = `rgba(74, 255, 120, ${0.6 + rand() * 0.3})`
          ctx.shadowColor = 'rgba(34, 197, 94, 0.4)'
          ctx.shadowBlur = 4
          break
        case 'cam6':
          ctx.fillStyle = `rgba(0, 200, 255, ${0.4 + rand() * 0.3})`
          ctx.strokeStyle = 'rgba(0, 200, 255, 0.5)'
          break
        default:
          ctx.fillStyle = `rgba(30, 45, 74, ${0.4 + rand() * 0.4})`
          ctx.strokeStyle = 'rgba(59, 130, 246, 0.15)'
          break
      }
      ctx.fillRect(bx, by, bw, bh)
      ctx.lineWidth = 1
      ctx.strokeRect(bx, by, bw, bh)
      if (viewId === 'cam5') {
        ctx.shadowBlur = 0
      }
    }

    if (viewId === 'cam1') {
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

    if (viewId === 'cam2') {
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

    const task = robot.current_task ?? ''
    if (viewId === 'cam3' || viewId === 'cam4') {
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

    if (viewId === 'cam5') {
      // night vision crosshair
      ctx.strokeStyle = 'rgba(34, 197, 94, 0.15)'
      ctx.lineWidth = 0.5
      const cxx = W / 2
      const cyy = H / 2
      ctx.beginPath()
      ctx.moveTo(cxx - 20, cyy); ctx.lineTo(cxx + 20, cyy)
      ctx.moveTo(cxx, cyy - 20); ctx.lineTo(cxx, cyy + 20)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(cxx, cyy, 10, 0, Math.PI * 2)
      ctx.stroke()

      // night vision noise overlay
      ctx.fillStyle = 'rgba(34, 197, 94, 0.015)'
      for (let i = 0; i < 40; i++) {
        const nx = ((now * 3.7 + i * 137) % 10000) / 10000 * W
        const ny = ((now * 2.3 + i * 271) % 10000) / 10000 * H
        ctx.fillRect(nx, ny, 2, 1)
      }
    }

    if (viewId === 'cam6') {
      // sonar sweeping arc
      const sweepAngle = ((now / 2000) * Math.PI * 2) % (Math.PI * 2)
      const cx = W / 2
      const cy = H / 2
      const radius = Math.min(W, H) * 0.45

      // sweep wedge with gradient fade
      const sweepGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius)
      sweepGrad.addColorStop(0, 'rgba(0, 200, 255, 0.06)')
      sweepGrad.addColorStop(0.7, 'rgba(0, 200, 255, 0.03)')
      sweepGrad.addColorStop(1, 'rgba(0, 200, 255, 0)')
      ctx.fillStyle = sweepGrad
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.arc(cx, cy, radius, sweepAngle - 0.3, sweepAngle + 0.3)
      ctx.closePath()
      ctx.fill()

      // sweep line
      ctx.strokeStyle = 'rgba(0, 200, 255, 0.3)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + Math.cos(sweepAngle) * radius, cy + Math.sin(sweepAngle) * radius)
      ctx.stroke()

      // blips (random dots that persist briefly)
      for (let i = 0; i < 6; i++) {
        const angleOff = (sweepAngle + (i - 3) * 0.15 + Math.PI * 2) % (Math.PI * 2)
        const dist = 0.2 + ((now * (3 + i) * 7.1) % 10000) / 10000 * 0.7
        const bx = cx + Math.cos(angleOff) * radius * dist
        const by = cy + Math.sin(angleOff) * radius * dist
        const alpha = Math.max(0, 0.6 - Math.abs(angleOff - sweepAngle) * 2)
        ctx.beginPath()
        ctx.arc(bx, by, 2 + 2 * (1 - dist), 0, Math.PI * 2)
        ctx.fillStyle = `rgba(0, 255, 200, ${alpha})`
        ctx.fill()
        ctx.strokeStyle = `rgba(0, 255, 200, ${alpha * 0.5})`
        ctx.lineWidth = 0.5
        ctx.stroke()
      }
    }

    if (viewId === 'cam2') {
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

    if (viewId === 'cam1') {
      const lx = ((now / 2500) * W) % W
      ctx.strokeStyle = 'rgba(34, 197, 94, 0.3)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(lx, 0)
      ctx.lineTo(lx, H)
      ctx.stroke()
    }
  }

  if (viewId === 'cam3' || viewId === 'cam4') {
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

  const vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.7)
  vignette.addColorStop(0, 'rgba(0,0,0,0)')
  vignette.addColorStop(1, 'rgba(0,0,0,0.4)')
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, W, H)

  ctx.strokeStyle = viewId === 'cam1' ? 'rgba(34, 197, 94, 0.5)' :
    viewId === 'cam2' ? 'rgba(239, 68, 68, 0.5)' :
    viewId === 'cam5' ? 'rgba(34, 197, 94, 0.6)' :
    viewId === 'cam6' ? 'rgba(0, 200, 255, 0.5)' :
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
  const [selectedRobots, setSelectedRobots] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    CAMERA_VIEWS.forEach(v => { init[v.id] = robots.length > 0 ? robots[0].robot_id : '' })
    return init
  })

  const canvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({})
  const rafRef = useRef<number>(0)
  const scrollRef = useRef(0)

  const selectedRobotsMap = useMemo(() => {
    const map: Record<string, RobotStatus | null> = {}
    for (const view of CAMERA_VIEWS) {
      map[view.id] = robots.find((r) => r.robot_id === selectedRobots[view.id]) ?? null
    }
    return map
  }, [robots, selectedRobots])

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
        renderCameraFeed(ctx, canvas, view.id, scrollRef.current, selectedRobotsMap[view.id])
      })
      rafRef.current = requestAnimationFrame(render)
    }

    rafRef.current = requestAnimationFrame(render)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [selectedRobotsMap])

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
      <h3>Robot Camera Feed</h3>
      <div className="camera-grid-6">
        {CAMERA_VIEWS.map((view) => (
          <div key={view.id} className="camera-feed">
            <div className="camera-feed-header">
              <span className="camera-feed-label">{view.label}</span>
              <select
                className="camera-feed-select"
                value={selectedRobots[view.id] ?? ''}
                onChange={(e) => setSelectedRobots(prev => ({ ...prev, [view.id]: e.target.value }))}
              >
                {robots.map((r) => (
                  <option key={r.robot_id} value={r.robot_id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
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