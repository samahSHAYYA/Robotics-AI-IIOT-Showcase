import { useRef, useEffect, useState, useCallback } from 'react'
import type { RobotStatus } from '../types/telemetry'

interface Product {
  id: number
  x: number
  y: number
  state: 'raw' | 'assembled' | 'welded' | 'inspected' | 'complete'
  progress: number
  waypointIndex: number
  processing: boolean
  processingTimeLeft: number
}

interface ProductionLineProps {
  robots: RobotStatus[]
}

const STATE_COLORS: Record<string, string> = {
  raw: '#9ca3af',
  assembled: '#3b82f6',
  welded: '#f59e0b',
  inspected: '#22c55e',
  complete: '#fbbf24',
}

const STATION_MAP: Record<string, string> = {
  C3: 'Assembly',
  W2: 'Welding',
  Q1: 'Inspection',
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function getFallbackPos(robotId: string): { x: number; y: number } {
  const map: Record<string, { x: number; y: number }> = {
    C3: { x: 3, y: 1.5 },
    W2: { x: 6.5, y: 2 },
    Q1: { x: 4, y: 3 },
  }
  return map[robotId] ?? { x: 5, y: 5 }
}

export default function ProductionLine({ robots }: ProductionLineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const productsRef = useRef<Product[]>([])
  const nextIdRef = useRef<number>(1)
  const spawnTimerRef = useRef<number>(0)
  const completedTimesRef = useRef<number[]>([])
  const lastTimeRef = useRef<number>(0)
  const throughputRef = useRef<number>(0)
  const robotsRef = useRef<RobotStatus[]>(robots)
  robotsRef.current = robots

  const [, setTick] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => t + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const getStationPos = useCallback((robotId: string): { x: number; y: number } => {
    const r = robotsRef.current.find((r) => r.robot_id === robotId)
    if (r) return { x: r.pose.x, y: r.pose.y }
    return getFallbackPos(robotId)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const render = (timeMs: number) => {
      const w = canvas.width
      const h = canvas.height
      const dt = lastTimeRef.current ? (timeMs - lastTimeRef.current) / 1000 : 0.016
      lastTimeRef.current = timeMs

      const c3Pos = getStationPos('C3')
      const w2Pos = getStationPos('W2')
      const q1Pos = getStationPos('Q1')

      const waypoints: Array<{ x: number; y: number }> = [
        { x: 0.5, y: c3Pos.y },
        { x: c3Pos.x, y: c3Pos.y },
        { x: w2Pos.x, y: w2Pos.y },
        { x: q1Pos.x, y: q1Pos.y },
        { x: 9.5, y: q1Pos.y },
      ]

      const products = productsRef.current
      const SPANW = 9
      const SPANH = 8.5
      const pad = 20
      const toX = (wx: number) => pad + ((wx - 0.5) / SPANW) * (w - 2 * pad)
      const toY = (wy: number) => pad + ((wy - 0.5) / SPANH) * (h - 2 * pad)
      const now = timeMs

      spawnTimerRef.current += dt * 1000
      if (spawnTimerRef.current >= 2000) {
        spawnTimerRef.current -= 2000
        products.push({
          id: nextIdRef.current++,
          x: waypoints[0].x,
          y: waypoints[0].y,
          state: 'raw',
          progress: 0,
          waypointIndex: 0,
          processing: false,
          processingTimeLeft: 0,
        })
      }

      const speed = 0.35

      for (let i = products.length - 1; i >= 0; i--) {
        const p = products[i]

        if (p.processing) {
          p.processingTimeLeft -= dt * 1000
          if (p.processingTimeLeft <= 0) {
            p.processing = false
            p.progress = 0
            p.waypointIndex++
            switch (p.state) {
              case 'raw': p.state = 'assembled'; break
              case 'assembled': p.state = 'welded'; break
              case 'welded': p.state = 'inspected'; break
              case 'inspected': p.state = 'complete'; break
            }
          }
          continue
        }

        if (p.waypointIndex >= waypoints.length - 1) {
          completedTimesRef.current.push(now)
          products.splice(i, 1)
          continue
        }

        const from = waypoints[p.waypointIndex]
        const to = waypoints[p.waypointIndex + 1]
        const segLen = Math.hypot(to.x - from.x, to.y - from.y)
        const step = segLen > 0.001 ? (speed * dt) / segLen : 1
        p.progress += step

        if (p.progress >= 1) {
          p.progress = 0
          p.waypointIndex++
          if (p.waypointIndex >= waypoints.length - 1) {
            completedTimesRef.current.push(now)
            products.splice(i, 1)
            continue
          }
          if (p.waypointIndex >= 1 && p.waypointIndex <= 3) {
            p.processing = true
            p.processingTimeLeft = 3000 + Math.random() * 2000
            p.x = waypoints[p.waypointIndex].x
            p.y = waypoints[p.waypointIndex].y
            continue
          }
        }

        if (!p.processing) {
          p.x = lerp(from.x, to.x, p.progress)
          p.y = lerp(from.y, to.y, p.progress)
        }
      }

      const cutoff = now - 60000
      const ct = completedTimesRef.current
      for (let i = ct.length - 1; i >= 0; i--) {
        if (ct[i] < cutoff) ct.splice(i, 1)
      }
      const displayThroughput = ct.length
      throughputRef.current = displayThroughput

      ctx.clearRect(0, 0, w, h)

      ctx.fillStyle = '#0b1121'
      ctx.beginPath()
      ctx.roundRect(0, 0, w, h, 6)
      ctx.fill()

      ctx.strokeStyle = '#1e2d4a'
      ctx.lineWidth = 2
      ctx.setLineDash([6, 4])
      ctx.beginPath()
      for (let i = 0; i < waypoints.length - 1; i++) {
        const fx = toX(waypoints[i].x)
        const fy = toY(waypoints[i].y)
        const tx = toX(waypoints[i + 1].x)
        const ty = toY(waypoints[i + 1].y)
        ctx.moveTo(fx, fy)
        ctx.lineTo(tx, ty)
      }
      ctx.stroke()
      ctx.setLineDash([])

      const stationIndices = [1, 2, 3]
      const stationRobotIds = ['C3', 'W2', 'Q1']
      for (let si = 0; si < stationIndices.length; si++) {
        const idx = stationIndices[si]
        const sx = toX(waypoints[idx].x)
        const sy = toY(waypoints[idx].y)
        ctx.fillStyle = 'rgba(30, 45, 74, 0.7)'
        ctx.beginPath()
        ctx.arc(sx, sy, 11, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#475569'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(sx, sy, 11, 0, Math.PI * 2)
        ctx.stroke()
        ctx.fillStyle = '#94a3b8'
        ctx.font = 'bold 8px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(stationRobotIds[si], sx, sy)
        ctx.fillStyle = '#475569'
        ctx.font = '7px sans-serif'
        ctx.textBaseline = 'top'
        ctx.fillText(STATION_MAP[stationRobotIds[si]] ?? '', sx, sy + 12)
      }

      for (const p of products) {
        const cx = toX(clamp(p.x, 0.3, 9.7))
        const cy = toY(clamp(p.y, 0.3, 9.2))
        const color = STATE_COLORS[p.state] ?? '#9ca3af'
        const radius = p.processing ? 8 : 6
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(cx, cy, radius, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(cx, cy, radius, 0, Math.PI * 2)
        ctx.stroke()
      }

      ctx.fillStyle = '#94a3b8'
      ctx.font = 'bold 10px sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(`${displayThroughput}/min`, 6, 5)

      rafRef.current = requestAnimationFrame(render)
    }

    rafRef.current = requestAnimationFrame(render)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [getStationPos])

  return (
    <div className="production-line">
      <h3>Production Line</h3>
      <canvas
        ref={canvasRef}
        width={400}
        height={200}
        style={{ width: '100%', height: '100%', display: 'block', borderRadius: '0.375rem' }}
      />
    </div>
  )
}
