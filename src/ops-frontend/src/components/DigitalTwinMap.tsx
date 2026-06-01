import { useRef, useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import type { RobotStatus, WorkerStatus } from '../types/telemetry'
import { useMapSettings } from '../contexts/MapSettingsContext'
import MapSettingsPanel, { ContextMenu } from './MapSettingsPanel'
import ThreeDView from './ThreeDView'

const FACTORY_W = 600
const FACTORY_H = 400

interface DigitalTwinMapProps {
  robots: RobotStatus[]
  workers?: WorkerStatus[]
  error?: string | null
  role?: string
  selectedRobotId?: string | null
  onRobotStart?: (id: string) => void
  onRobotStop?: (id: string) => void
  onToggleWorker?: (id: string) => void
}

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

const MAX_TRAIL = 20
const PROXIMITY_THRESHOLD = 2.0
const COLLISION_THRESHOLD = 0.8

const ROBOT_PATHS: Record<string, Array<{ x: number; y: number }>> = {
  C3: [{ x: 3, y: 1.5 }, { x: 7, y: 1.5 }, { x: 7.5, y: 3 }, { x: 6, y: 5.5 }, { x: 3.5, y: 5.5 }, { x: 2.5, y: 3.5 }],
  W2: [{ x: 6.5, y: 2 }, { x: 7.5, y: 4 }, { x: 5, y: 5.5 }, { x: 3.5, y: 4 }, { x: 5, y: 2 }],
  Q1: [{ x: 4, y: 3 }, { x: 5.5, y: 3 }, { x: 6, y: 4.5 }, { x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3.5, y: 4.5 }],
}

function robotColor(robotId: string, status: string, customColors?: Record<string, string>): string {
  const base = (customColors && customColors[robotId]) ?? '#6b7280'
  switch (status) {
    case 'moving':
    case 'active':
      return base
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
      return base
  }
}

function blinkAlpha(status: string, timeMs: number): number {
  switch (status) {
    case 'moving':
    case 'active':
      return 0.4 + 0.6 * Math.sin(timeMs / 500)
    case 'error':
    case 'critical':
      return 0.3 + 0.7 * Math.sin(timeMs / 150)
    case 'maintenance':
    case 'warning':
      return 0.4 + 0.6 * Math.sin(timeMs / 300)
    case 'offline':
      return 0.4
    case 'idle':
    default:
      return 1.0
  }
}

function renderRobotShape(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  theta: number,
  robotId: string,
  status: string,
  alpha: number,
  glowLevel: 'none' | 'warning' | 'critical',
) {
  const r = 6
  const color = robotColor(robotId, status)
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(x, y)

  if (glowLevel === 'critical') {
    ctx.beginPath()
    ctx.arc(0, 0, r * 3, 0, Math.PI * 2)
    ctx.strokeStyle = '#ef4444'
    ctx.lineWidth = 2
    ctx.setLineDash([4, 4])
    ctx.stroke()
    ctx.setLineDash([])
  } else if (glowLevel === 'warning') {
    ctx.beginPath()
    ctx.arc(0, 0, r * 3, 0, Math.PI * 2)
    ctx.strokeStyle = '#f59e0b'
    ctx.lineWidth = 2
    ctx.setLineDash([6, 6])
    ctx.stroke()
    ctx.setLineDash([])
  }

  // Body dot
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'
  ctx.lineWidth = 1
  ctx.stroke()

  // Direction line
  ctx.save()
  ctx.rotate(theta)
  ctx.beginPath()
  ctx.moveTo(r + 2, 0)
  ctx.lineTo(r + 8, 0)
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.restore()

  // Center dot
  ctx.beginPath()
  ctx.arc(0, 0, 1.5, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()

  ctx.restore()
}

function renderBeacon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  timeMs: number,
) {
  const numRings = 3
  const period = 1500
  const maxRadius = 22

  for (let i = 0; i < numRings; i++) {
    const phase = (i / numRings) * period
    const t = ((timeMs + phase) % period) / period
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

function renderTrail(
  ctx: CanvasRenderingContext2D,
  trail: Array<{ x: number; y: number }>,
  sxFn: (v: number) => number,
  syFn: (v: number) => number,
  color: string,
  maxTrail: number,
) {
  if (trail.length < 2) return

  for (let i = 1; i < trail.length; i++) {
    const t = i / maxTrail
    const alpha = 0.2 + 0.8 * t
    const cx = sxFn(trail[i].x)
    const cy = syFn(trail[i].y)

    ctx.beginPath()
    ctx.arc(cx, cy, 2, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.globalAlpha = alpha
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

function bsplineClosedPath(points: Array<{ x: number; y: number }>, samples = 12): Array<{ x: number; y: number }> {
  const n = points.length
  if (n < 3) return [...points]
  const result: Array<{ x: number; y: number }> = []
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n]
    const p1 = points[i]
    const p2 = points[(i + 1) % n]
    for (let s = 0; s < samples; s++) {
      const t = s / samples
      const t2 = t * t
      const w0 = 0.5 * (1 - t) * (1 - t)
      const w1 = 0.5 * (-2 * t2 + 2 * t + 1)
      const w2 = 0.5 * t2
      result.push({
        x: w0 * p0.x + w1 * p1.x + w2 * p2.x,
        y: w0 * p0.y + w1 * p1.y + w2 * p2.y,
      })
    }
  }
  return result
}

function renderTrajectoryAhead(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  robotId: string,
  sxFn: (v: number) => number,
  syFn: (v: number) => number,
  color: string,
) {
  const path = ROBOT_PATHS[robotId]
  if (!path || path.length < 2) return

  let minDist = Infinity
  let nearestIdx = 0
  for (let i = 0; i < path.length; i++) {
    const d = Math.hypot(path[i].x - x, path[i].y - y)
    if (d < minDist) {
      minDist = d
      nearestIdx = i
    }
  }

  const ahead: Array<{ x: number; y: number }> = [{ x, y }]
  for (let offset = 0; offset <= path.length; offset++) {
    const idx = (nearestIdx + offset) % path.length
    ahead.push(path[idx])
  }

  const smooth = bsplineClosedPath(ahead, 10)

  for (const p of smooth) {
    p.x = Math.max(0.5, Math.min(9.5, p.x))
    p.y = Math.max(0.5, Math.min(9.0, p.y))
  }

  ctx.save()
  ctx.setLineDash([4, 6])
  ctx.lineWidth = 3
  ctx.globalAlpha = 0.8
  ctx.strokeStyle = color
  ctx.beginPath()
  for (let i = 0; i < smooth.length; i++) {
    const sx = sxFn(smooth[i].x)
    const sy = syFn(smooth[i].y)
    if (i === 0) ctx.moveTo(sx, sy)
    else ctx.lineTo(sx, sy)
  }
  ctx.stroke()
  ctx.setLineDash([])
  ctx.globalAlpha = 1
  ctx.restore()
}

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

  ctx.fillStyle = 'rgba(11, 17, 33, 0.75)'
  ctx.beginPath()
  ctx.roundRect(bx, by, tw + 8, th + 4, 3)
  ctx.fill()

  const borderColor = robotColor(robotId, status)
  ctx.strokeStyle = borderColor
  ctx.lineWidth = 1
  ctx.globalAlpha = 0.4
  ctx.beginPath()
  ctx.roundRect(bx, by, tw + 8, th + 4, 3)
  ctx.stroke()
  ctx.globalAlpha = 1

  ctx.fillStyle = '#e2e8f0'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x, by + (th + 4) / 2)
  ctx.textBaseline = 'alphabetic'
}

function renderAssemblyArea(
  ctx: CanvasRenderingContext2D,
  sxFn: (v: number) => number,
  syFn: (v: number) => number,
  timeMs: number,
) {
  const ax = sxFn(0.8)
  const ay = syFn(0.8)
  const aw = sxFn(2.5)
  const ah = syFn(3.5)

  // Assembly station platform
  ctx.fillStyle = 'rgba(34, 197, 94, 0.06)'
  ctx.beginPath()
  ctx.roundRect(ax, ay, aw, ah, 4)
  ctx.fill()
  ctx.strokeStyle = 'rgba(34, 197, 94, 0.15)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(ax, ay, aw, ah, 4)
  ctx.stroke()

  // Conveyor belt
  const beltY = ay + ah * 0.65
  ctx.fillStyle = '#1e293b'
  ctx.fillRect(ax + 4, beltY, aw - 8, 6)

  // Moving segments on conveyor
  const segSpacing = 14
  const offset = (timeMs / 40) % segSpacing
  ctx.fillStyle = 'rgba(59, 130, 246, 0.4)'
  for (let px = offset; px < aw - 8; px += segSpacing) {
    ctx.fillRect(ax + 4 + px, beltY + 1, 6, 4)
  }

  // Workstations as rectangles with detail
  const ws1 = { x: ax + 6, y: ay + 6, w: aw * 0.4, h: ah * 0.3 }
  const ws2 = { x: ax + aw * 0.5, y: ay + 6, w: aw * 0.4, h: ah * 0.3 }

  for (const ws of [ws1, ws2]) {
    ctx.fillStyle = 'rgba(30, 45, 74, 0.7)'
    ctx.beginPath()
    ctx.roundRect(ws.x, ws.y, ws.w, ws.h, 3)
    ctx.fill()
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.2)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(ws.x, ws.y, ws.w, ws.h, 3)
    ctx.stroke()

    // Pulsing status light
    const pulse = 0.3 + 0.7 * Math.abs(Math.sin(timeMs / 600 + (ws === ws1 ? 0 : 2)))
    ctx.beginPath()
    ctx.arc(ws.x + ws.w - 5, ws.y + 5, 2.5, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(34, 197, 94, ${pulse})`
    ctx.fill()
  }

  // Label
  ctx.fillStyle = 'rgba(34, 197, 94, 0.5)'
  ctx.font = 'bold 9px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('ASSEMBLY LINE', ax + aw / 2, ay - 4)
}

function renderWorkerShape(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  _workerId: string, active: boolean, zone: string,
) {
  const zoneColors: Record<string, string> = {
    assembly: '#22c55e',
    welding: '#eab308',
    inspection: '#8b5cf6',
  }
  const color = zoneColors[zone] ?? '#6b7280'
  ctx.save()

  if (!active) {
    ctx.globalAlpha = 0.3
  }

  const r = 4
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1.5
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(x, y - 3, 2, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()

  if (active) {
    ctx.beginPath()
    ctx.arc(x, y, r + 3, 0, Math.PI * 2)
    ctx.strokeStyle = color
    ctx.lineWidth = 1
    ctx.globalAlpha = 0.3 + 0.2 * Math.sin(Date.now() / 800)
    ctx.stroke()
  }

  ctx.restore()
}

const WORKER_ZONES = [
  { id: 'assembly', label: 'Assembly Zone', color: '#22c55e', x: 0.8, y: 0.5, w: 3.5, h: 4.5 },
  { id: 'welding', label: 'Welding Bay', color: '#eab308', x: 3.3, y: 0.5, w: 3.5, h: 4.5 },
  { id: 'inspection', label: 'Inspection Zone', color: '#8b5cf6', x: 5.8, y: 0.5, w: 3.5, h: 4.5 },
]

function renderSafetyZones(ctx: CanvasRenderingContext2D, sxFn: (v: number) => number, syFn: (v: number) => number) {
  for (const z of WORKER_ZONES) {
    const ax = sxFn(z.x)
    const ay = syFn(z.y)
    const aw = sxFn(z.w) - ax
    const ah = syFn(z.h) - ay
    ctx.fillStyle = z.color + '15'
    ctx.beginPath()
    ctx.roundRect(ax, ay, aw, ah, 3)
    ctx.fill()
    ctx.strokeStyle = z.color + '30'
    ctx.lineWidth = 1
    ctx.setLineDash([6, 4])
    ctx.beginPath()
    ctx.roundRect(ax, ay, aw, ah, 3)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = z.color + '60'
    ctx.font = 'bold 8px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(z.id.toUpperCase(), ax + 3, ay + 11)
  }
}

function heatmapColor(t: number): string {
  const h = Math.round(240 - t * 240)
  const s = 70 + Math.round(t * 20)
  const l = 25 + Math.round(t * 25)
  const a = 0.12 + t * 0.38
  return `hsla(${h}, ${s}%, ${l}%, ${a})`
}

function renderSelectionRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  timeMs: number,
) {
  const pulse = 0.7 + 0.3 * Math.sin(timeMs / 180)
  const radius = 14 * pulse
  ctx.save()
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.strokeStyle = '#22d3ee'
  ctx.lineWidth = 3
  ctx.shadowColor = '#22d3ee'
  ctx.shadowBlur = 14
  ctx.stroke()
  // Second brighter ring
  ctx.beginPath()
  ctx.arc(x, y, radius + 4, 0, Math.PI * 2)
  ctx.strokeStyle = '#67e8f9'
  ctx.lineWidth = 1.5
  ctx.shadowBlur = 8
  ctx.stroke()
  ctx.restore()
}

export default function DigitalTwinMap({
  robots, workers, error, role, selectedRobotId, onRobotStart, onRobotStop,   onToggleWorker: _onToggleWorker,
}: DigitalTwinMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const interpRef = useRef<InterpRobot[]>([])
  const targetRef = useRef<InterpRobot[]>([])

  const trailsRef = useRef<Record<string, Array<{ x: number; y: number }>>>({})

  const heatmapRef = useRef<number[][]>(Array.from({ length: 40 }, () => new Array(60).fill(0)))
  const lastHeatmapAccRef = useRef<number>(0)

  const highlightedRef = useRef<string | null>(null)

  const [selectedRobot, setSelectedRobot] = useState<InterpRobot | null>(null)
  const [popupPos, setPopupPos] = useState({ x: 0, y: 0 })
  const dismissPopup = useCallback(() => setSelectedRobot(null), [])
  const [showSettings, setShowSettings] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; robot?: InterpRobot } | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [currentTime, setCurrentTime] = useState('')
  const [is3D, setIs3D] = useState(false)

  const [timeline, setTimeline] = useState<{
    history: InterpRobot[][]
    currentIndex: number
    playing: boolean
    speed: number
  }>({ history: [], currentIndex: -1, playing: false, speed: 1 })

  const { settings } = useMapSettings()

  /* ===== Time-Machine Mode (Feature 26) ===== */
  const historicalCanvasRef = useRef<HTMLCanvasElement>(null)
  const historicalRef = useRef<InterpRobot[]>([])
  const [historicalEnabled, setHistoricalEnabled] = useState(false)
  const [historicalTimestamp, setHistoricalTimestamp] = useState('')
  const historicalEnabledRef = useRef(false)
  const bookmarkRef = useRef<Array<{ timestamp: string; robots: InterpRobot[] }>>([])

  useEffect(() => {
    historicalEnabledRef.current = historicalEnabled
  }, [historicalEnabled])

  /* Seeded PRNG for deterministic dummy data from a timestamp string */
  function seededRandom(seed: string) {
    let hash = 0
    for (let i = 0; i < seed.length; i++) {
      hash = ((hash << 5) - hash) + seed.charCodeAt(i)
      hash = hash & hash
    }
    let state = Math.abs(hash) || 1
    return () => {
      state = (state * 16807) % 2147483647
      return state / 2147483647
    }
  }

  const generateHistoricalSnapshot = useCallback((timestamp: string) => {
    const liveData = interpRef.current
    if (liveData.length === 0) return
    const rng = seededRandom(timestamp)
    const hist: InterpRobot[] = liveData.map((r) => ({
      ...r,
      x: Math.max(0.5, Math.min(9.5, r.x + (rng() - 0.5) * 1.8)),
      y: Math.max(0.5, Math.min(9.0, r.y + (rng() - 0.5) * 1.8)),
      theta: r.theta + (rng() - 0.5) * 0.8,
      uptime_pct: Math.max(0, Math.min(100, r.uptime_pct + (rng() - 0.5) * 12)),
      status: rng() > 0.7 ? (rng() > 0.5 ? 'idle' : 'error') : r.status,
    }))
    historicalRef.current = hist
  }, [])

  /* Dispatch diff event for KPI board */
  const dispatchDiffEvent = useCallback(() => {
    const live = interpRef.current
    const hist = historicalRef.current
    if (hist.length === 0) return

    const liveActive = live.filter((r) => r.status === 'active' || r.status === 'moving').length
    const histActive = hist.filter((r) => r.status === 'active' || r.status === 'moving').length
    const robotDiff = liveActive - histActive

    const liveErrors = live.filter((r) => r.status === 'error' || r.status === 'critical').length
    const histErrors = hist.filter((r) => r.status === 'error' || r.status === 'critical').length

    const liveUptime = live.length > 0 ? live.reduce((s, r) => s + r.uptime_pct, 0) / live.length : 0
    const histUptime = hist.length > 0 ? hist.reduce((s, r) => s + r.uptime_pct, 0) / hist.length : 0
    const uptimeDiff = liveUptime - histUptime

    /* Dummy throughput/defect diffs based on robot count */
    const baseThroughput = live.length * 250
    const histThroughput = hist.length * 250
    const throughputDiff = baseThroughput - histThroughput

    const baseDefect = live.length > 0 ? (liveErrors / live.length) * 5 : 2
    const histDefect = hist.length > 0 ? (histErrors / hist.length) * 5 : 2
    const defectDiff = baseDefect - histDefect

    const detail: Record<string, { value: number; direction: 'up' | 'down' }> = {
      'Throughput': { value: Math.abs(throughputDiff), direction: throughputDiff >= 0 ? 'up' : 'down' },
      'Defect Rate': { value: Math.abs(Math.round(defectDiff * 10) / 10), direction: defectDiff <= 0 ? 'up' : 'down' },
      'Robot Uptime': { value: Math.abs(Math.round(uptimeDiff * 10) / 10), direction: uptimeDiff >= 0 ? 'up' : 'down' },
      'Active Robots': { value: Math.abs(robotDiff), direction: robotDiff >= 0 ? 'up' : 'down' },
    }
    window.dispatchEvent(new CustomEvent('time-machine-diff', { detail }))
  }, [])

  /* Generate historical data when timestamp or compare toggle changes */
  useEffect(() => {
    if (!historicalEnabled || !historicalTimestamp) {
      if (!historicalEnabled) {
        window.dispatchEvent(new CustomEvent('time-machine-diff', { detail: {} }))
      }
      return
    }
    generateHistoricalSnapshot(historicalTimestamp)
  }, [historicalEnabled, historicalTimestamp, generateHistoricalSnapshot])

  /* Dispatch diffs after historical data is ready */
  useEffect(() => {
    if (historicalEnabled && historicalRef.current.length > 0) {
      dispatchDiffEvent()
    }
  }, [historicalEnabled, historicalTimestamp, dispatchDiffEvent])

  const sx = useCallback((v: number) => (v / 10) * FACTORY_W, [])
  const sy = useCallback((v: number) => (v / 10) * FACTORY_H, [])

  const renderTimelineRef = useRef<{ history: InterpRobot[][]; currentIndex: number }>({ history: [], currentIndex: -1 })

  useEffect(() => {
    renderTimelineRef.current = { history: timeline.history, currentIndex: timeline.currentIndex }
  }, [timeline.history, timeline.currentIndex])

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

  useEffect(() => {
    const interval = setInterval(() => {
      const snapshot = interpRef.current.map((r) => ({ ...r }))
      setTimeline((prev) => {
        const history = [...prev.history, snapshot]
        if (history.length > 30) history.splice(0, history.length - 30)
        return { ...prev, history }
      })
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!timeline.playing || timeline.currentIndex < 0 || timeline.history.length === 0) return

    const interval = setInterval(() => {
      setTimeline((prev) => {
        if (!prev.playing) return prev
        if (prev.currentIndex >= prev.history.length - 1) {
          return { ...prev, playing: false, currentIndex: -1 }
        }
        return { ...prev, currentIndex: prev.currentIndex + 1 }
      })
    }, 2000 / timeline.speed)

    return () => clearInterval(interval)
  }, [timeline.playing, timeline.currentIndex, timeline.speed])

  useEffect(() => {
    if (!fullscreen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [fullscreen])

  useEffect(() => {
    if (!fullscreen) {
      setCurrentTime('')
      return
    }
    const update = () => setCurrentTime(new Date().toLocaleTimeString())
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [fullscreen])

  useEffect(() => {
    const handler = () => {
      const grid = heatmapRef.current
      for (let y = 0; y < 40; y++) {
        for (let x = 0; x < 60; x++) {
          grid[y][x] = 0
        }
      }
    }
    window.addEventListener('heatmap-reset', handler)
    return () => window.removeEventListener('heatmap-reset', handler)
  }, [])

  useEffect(() => {
    if (selectedRobotId !== undefined) {
      highlightedRef.current = selectedRobotId ?? null
    }
  }, [selectedRobotId])

  useEffect(() => {
    if (!selectedRobot) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedRobot(null)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedRobot])

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { robotId: string | null }
      highlightedRef.current = detail.robotId ?? null
    }
    window.addEventListener('select-robot', handler)
    return () => window.removeEventListener('select-robot', handler)
  }, [])

  useEffect(() => {
    const LERP_FACTOR = 0.08

    const render = () => {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (!canvas || !ctx) {
        rafRef.current = requestAnimationFrame(render)
        return
      }
      const w = canvas.width
      const h = canvas.height
      const now = Date.now()

      const tl = renderTimelineRef.current
      const isReplay = tl.currentIndex >= 0 && tl.history.length > 0

      let interp: InterpRobot[]

      if (isReplay) {
        interp = tl.history[tl.currentIndex] || []
      } else {
        interp = interpRef.current
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

        const CLAMP_MIN = 0.5
        const CLAMP_MAX_Y = 9.0
        const CLAMP_MAX_X = 9.5
        for (const r of interp) {
          r.x = Math.max(CLAMP_MIN, Math.min(CLAMP_MAX_X, r.x))
          r.y = Math.max(CLAMP_MIN, Math.min(CLAMP_MAX_Y, r.y))
        }

        const targetIds = new Set(target.map((t) => t.robot_id))
        for (let i = interp.length - 1; i >= 0; i--) {
          if (!targetIds.has(interp[i].robot_id)) {
            interp.splice(i, 1)
          }
        }

        const trails = trailsRef.current
        for (const r of interp) {
          if (!trails[r.robot_id]) {
            trails[r.robot_id] = []
          }
          const trail = trails[r.robot_id]
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
        for (const rid of Object.keys(trails)) {
          if (!targetIds.has(rid)) {
            delete trails[rid]
          }
        }

        if (settings.showHeatmap) {
          const n = Date.now()
          if (n - lastHeatmapAccRef.current > 100) {
            lastHeatmapAccRef.current = n
            const grid = heatmapRef.current
            for (const r of interp) {
              const gx = Math.floor((r.x / 10) * 60)
              const gy = Math.floor((r.y / 10) * 40)
              if (gx >= 0 && gx < 60 && gy >= 0 && gy < 40) {
                grid[gy][gx]++
                if (grid[gy][gx] > 1e9) grid[gy][gx] = 0
              }
            }
          }
        }
      }

      const warningPairs = new Set<string>()
      const closePairs = new Set<string>()
      for (let i = 0; i < interp.length; i++) {
        for (let j = i + 1; j < interp.length; j++) {
          const dx = interp[i].x - interp[j].x
          const dy = interp[i].y - interp[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < COLLISION_THRESHOLD) {
            closePairs.add(interp[i].robot_id)
            closePairs.add(interp[j].robot_id)
          }
          if (dist < PROXIMITY_THRESHOLD) {
            warningPairs.add(interp[i].robot_id)
            warningPairs.add(interp[j].robot_id)
          }
        }
      }

      ctx.clearRect(0, 0, w, h)

      ctx.fillStyle = '#0b1121'
      ctx.beginPath()
      ctx.roundRect(0, 0, w, h, 8)
      ctx.fill()

      ctx.fillStyle = '#1a2a40'
      ctx.beginPath()
      ctx.roundRect(sx(0.5), sy(0.5), sx(9), sy(8.5), 4)
      ctx.fill()

      ctx.strokeStyle = 'rgba(59,130,246,0.08)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.roundRect(sx(0.5), sy(0.5), sx(9), sy(8.5), 4)
      ctx.stroke()

      if (settings.showHeatmap) {
        const grid = heatmapRef.current
        let maxVal = 0
        for (let y = 0; y < 40; y++) {
          for (let x = 0; x < 60; x++) {
            if (grid[y][x] > maxVal) maxVal = grid[y][x]
          }
        }
        if (maxVal > 0) {
          const cellW = sx(9) / 60
          const cellH = sy(8.5) / 40
          const offX = sx(0.5)
          const offY = sy(0.5)
          ctx.save()
          for (let y = 0; y < 40; y++) {
            for (let x = 0; x < 60; x++) {
              const v = grid[y][x] / maxVal
              if (v > 0.01) {
                ctx.fillStyle = heatmapColor(v)
                ctx.fillRect(offX + x * cellW, offY + y * cellH, cellW + 0.5, cellH + 0.5)
              }
            }
          }
          ctx.restore()
        }
      }

      if (settings.showGridLines) {
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
      }

      if (settings.showZoneLabels) {
        ctx.fillStyle = '#475569'
        ctx.font = '11px sans-serif'
        ctx.textAlign = 'center'
        const zones = ['Assembly A', 'Welding Bay', 'Inspection']
        for (let i = 0; i < 3; i++) {
          ctx.fillText(zones[i], (w / 6) + (w / 3) * i, h - 8)
        }
      }

      ctx.strokeStyle = 'rgba(59,130,246,0.15)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 6])
      ctx.strokeRect(sx(0.5), sy(0.5), sx(9), sy(8.5))
      ctx.setLineDash([])

      renderAssemblyArea(ctx, sx, sy, now)

      if (settings.showZoneLabels) {
        renderSafetyZones(ctx, sx, sy)
        if (workers && workers.length > 0) {
          for (const w of workers) {
            const cx = sx(w.x)
            const cy = sy(w.y)
            renderWorkerShape(ctx, cx, cy, w.worker_id, w.active, w.zone)
          }
        }
      }

      if (settings.showTrails && !isReplay) {
        for (const r of interp) {
          if (settings.robotVisibility[r.robot_id] === false) continue
          const trail = trailsRef.current[r.robot_id]
          if (trail && trail.length >= 2) {
            const color = robotColor(r.robot_id, r.status)
            renderTrail(ctx, trail, sx, sy, color, settings.trailLength > MAX_TRAIL ? settings.trailLength : MAX_TRAIL)
          }
        }
      }

      if (settings.showTrajectories && !isReplay) {
        for (const r of interp) {
          if (settings.robotVisibility[r.robot_id] === false) continue
          const color = robotColor(r.robot_id, r.status, settings.robotColors)
          renderTrajectoryAhead(ctx, r.x, r.y, r.robot_id, sx, sy, color)
        }
      }

      for (const r of interp) {
        const cx = sx(r.x)
        const cy = sy(r.y)
        const robotVis = settings.robotVisibility[r.robot_id]
        if (robotVis === false) continue

        const color = robotColor(r.robot_id, r.status, settings.robotColors)
        const glowLevel = closePairs.has(r.robot_id) ? 'critical' : warningPairs.has(r.robot_id) ? 'warning' : 'none'

        if (settings.showBeacons && (r.status === 'moving' || r.status === 'active')) {
          renderBeacon(ctx, cx, cy, color, now)
        }

        const alpha = blinkAlpha(r.status, now)

        if (settings.showGlowRings) {
          renderRobotShape(ctx, cx, cy, r.theta, r.robot_id, r.status, alpha, glowLevel)
        } else {
          renderRobotShape(ctx, cx, cy, r.theta, r.robot_id, r.status, alpha, 'none')
        }

        if (settings.showLabels) {
          renderLabel(ctx, cx, cy, r.robot_id, r.status)
        }

        if (highlightedRef.current === r.robot_id) {
          renderSelectionRing(ctx, cx, cy, now)
        }
      }

      if (isReplay) {
        ctx.save()
        ctx.fillStyle = '#eab308'
        ctx.font = 'bold 14px sans-serif'
        ctx.textAlign = 'left'
        ctx.fillText('REPLAY', 8, 20)
        ctx.restore()
      }

      /* ---- Time-machine historical canvas ---- */
      const hCanvas = historicalCanvasRef.current
      const hCtx = hCanvas?.getContext('2d')
      if (hCanvas && hCtx && historicalEnabledRef.current) {
        const hw = hCanvas.width
        const hh = hCanvas.height
        const histData = historicalRef.current

        hCtx.clearRect(0, 0, hw, hh)

        /* Background */
        hCtx.fillStyle = '#0b1121'
        hCtx.beginPath()
        hCtx.roundRect(0, 0, hw, hh, 8)
        hCtx.fill()

        hCtx.fillStyle = '#1a2a40'
        hCtx.beginPath()
        hCtx.roundRect(sx(0.5), sy(0.5), sx(9), sy(8.5), 4)
        hCtx.fill()

        hCtx.strokeStyle = 'rgba(59,130,246,0.08)'
        hCtx.lineWidth = 1.5
        hCtx.beginPath()
        hCtx.roundRect(sx(0.5), sy(0.5), sx(9), sy(8.5), 4)
        hCtx.stroke()

        /* Grid lines */
        if (settings.showGridLines) {
          hCtx.strokeStyle = '#334155'
          hCtx.lineWidth = 1
          hCtx.setLineDash([8, 4])
          hCtx.beginPath()
          for (let i = 1; i < 3; i++) {
            const x = (hw / 3) * i
            hCtx.moveTo(x, 0)
            hCtx.lineTo(x, hh)
          }
          hCtx.stroke()
          hCtx.setLineDash([])
        }

        /* Zone labels */
        if (settings.showZoneLabels) {
          hCtx.fillStyle = '#475569'
          hCtx.font = '11px sans-serif'
          hCtx.textAlign = 'center'
          const zones = ['Assembly A', 'Welding Bay', 'Inspection']
          for (let i = 0; i < 3; i++) {
            hCtx.fillText(zones[i], (hw / 6) + (hw / 3) * i, hh - 8)
          }
        }

        /* Border */
        hCtx.strokeStyle = 'rgba(59,130,246,0.15)'
        hCtx.lineWidth = 1.5
        hCtx.setLineDash([4, 6])
        hCtx.strokeRect(sx(0.5), sy(0.5), sx(9), sy(8.5))
        hCtx.setLineDash([])

        /* Render historical robots */
        for (const r of histData) {
          const cx = sx(r.x)
          const cy = sy(r.y)
          const robotVis = settings.robotVisibility[r.robot_id]
          if (robotVis === false) continue

          const color = robotColor(r.robot_id, r.status, settings.robotColors)

          if (settings.showBeacons && (r.status === 'moving' || r.status === 'active')) {
            renderBeacon(hCtx, cx, cy, color, now)
          }

          const alpha = blinkAlpha(r.status, now)

          if (settings.showGlowRings) {
            renderRobotShape(hCtx, cx, cy, r.theta, r.robot_id, r.status, alpha, 'none')
          } else {
            renderRobotShape(hCtx, cx, cy, r.theta, r.robot_id, r.status, alpha, 'none')
          }

          if (settings.showLabels) {
            renderLabel(hCtx, cx, cy, r.robot_id, r.status)
          }

          if (highlightedRef.current === r.robot_id) {
            renderSelectionRing(hCtx, cx, cy, now)
          }
        }
      }

      rafRef.current = requestAnimationFrame(render)
    }

    rafRef.current = requestAnimationFrame(render)

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [sx, sy])

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const mx = ((e.clientX - rect.left) / rect.width) * canvas.width
      const my = ((e.clientY - rect.top) / rect.height) * canvas.height

      let found: InterpRobot | null = null
      const tl = renderTimelineRef.current
      const robotData = tl.currentIndex >= 0 && tl.history[tl.currentIndex] ? tl.history[tl.currentIndex] : interpRef.current
      for (const r of robotData) {
        const cx = sx(r.x)
        const cy = sy(r.y)
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
    [sx, sy],
  )

  const handleCanvasContextMenu = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      e.preventDefault()
      const canvas = canvasRef.current
      if (!canvas) { setContextMenu({ x: e.clientX, y: e.clientY }); return }
      const rect = canvas.getBoundingClientRect()
      const mx = ((e.clientX - rect.left) / rect.width) * canvas.width
      const my = ((e.clientY - rect.top) / rect.height) * canvas.height

      let found: InterpRobot | undefined
      const tl = renderTimelineRef.current
      const robotData = tl.currentIndex >= 0 && tl.history[tl.currentIndex] ? tl.history[tl.currentIndex] : interpRef.current
      for (const r of robotData) {
        const cx = sx(r.x)
        const cy = sy(r.y)
        const dx = mx - cx
        const dy = my - cy
        if (Math.sqrt(dx * dx + dy * dy) < 20) {
          found = r
          break
        }
      }
      setContextMenu({ x: e.clientX, y: e.clientY, robot: found })
    },
    [sx, sy],
  )

  const handleOpenSettings = useCallback(() => {
    setContextMenu(null)
    setShowSettings(true)
  }, [])

  const handleTimelinePlay = useCallback(() => {
    setTimeline((prev) => {
      if (prev.playing) return { ...prev, playing: false }
      if (prev.currentIndex === -1 && prev.history.length > 0) {
        return { ...prev, playing: true, currentIndex: 0 }
      }
      return { ...prev, playing: true }
    })
  }, [])

  const handleTimelineSpeed = useCallback((speed: number) => {
    setTimeline((prev) => ({ ...prev, speed }))
  }, [])

  const handleTimelineSlider = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const idx = Number(e.target.value)
    setTimeline((prev) => {
      const max = Math.max(0, prev.history.length - 1)
      if (idx >= max) return { ...prev, currentIndex: -1, playing: false }
      return { ...prev, currentIndex: idx, playing: false }
    })
  }, [])

  const handleHistoricalDateChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setHistoricalTimestamp(val)
    if (val) {
      generateHistoricalSnapshot(val)
      /* After generating, dispatch diffs on next tick so ref is settled */
      setTimeout(() => dispatchDiffEvent(), 0)
    }
  }, [generateHistoricalSnapshot, dispatchDiffEvent])

  const handleBookmark = useCallback(() => {
    const snapshot = interpRef.current.map((r) => ({ ...r }))
    const ts = new Date().toISOString().slice(0, 19)
    bookmarkRef.current.push({ timestamp: ts, robots: snapshot })
    if (bookmarkRef.current.length > 20) {
      bookmarkRef.current.splice(0, bookmarkRef.current.length - 20)
    }
    /* Pre-fill date picker with this timestamp and load it as historical */
    const localTs = new Date().toISOString().slice(0, 16)
    setHistoricalTimestamp(localTs)
    /* Generate historical data offset from the bookmark */
    const rng = seededRandom(ts)
    const hist: InterpRobot[] = snapshot.map((r) => ({
      ...r,
      x: Math.max(0.5, Math.min(9.5, r.x + (rng() - 0.5) * 1.8)),
      y: Math.max(0.5, Math.min(9.0, r.y + (rng() - 0.5) * 1.8)),
      theta: r.theta + (rng() - 0.5) * 0.8,
      uptime_pct: Math.max(0, Math.min(100, r.uptime_pct + (rng() - 0.5) * 12)),
      status: rng() > 0.7 ? (rng() > 0.5 ? 'idle' : 'error') : r.status,
    }))
    historicalRef.current = hist
    if (historicalEnabled) {
      setTimeout(() => dispatchDiffEvent(), 0)
    }
  }, [historicalEnabled, dispatchDiffEvent])

  const handle3DRobotSelect = useCallback((robotId: string, clientX: number, clientY: number) => {
    const target = targetRef.current.find((r) => r.robot_id === robotId)
    if (target) {
      setSelectedRobot(target)
      setPopupPos({ x: clientX, y: clientY })
    }
  }, [])

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

  const settingsButtonStyle: React.CSSProperties = {
    background: 'transparent',
    border: '1px solid var(--surface2, #1e2d4a)',
    color: 'var(--text2, #7e93b4)',
    padding: '0.15rem 0.4rem',
    borderRadius: '0.25rem',
    fontSize: '0.65rem',
    cursor: 'pointer',
    marginLeft: 'auto',
    lineHeight: 1,
  }

  const sliderMax = Math.max(0, timeline.history.length - 1)
  const sliderValue = timeline.currentIndex === -1 ? sliderMax : timeline.currentIndex

  const timelineBar = (
    <div className="timeline-bar">
      <button
        className={`timeline-btn ${timeline.playing ? 'active' : ''}`}
        onClick={handleTimelinePlay}
        title={timeline.playing ? 'Pause' : 'Play'}
      >
        {timeline.playing ? '||' : 'Play'}
      </button>
      {[1, 2, 5, 10].map((speed) => (
        <button
          key={speed}
          className={`timeline-btn ${timeline.speed === speed ? 'active' : ''}`}
          onClick={() => handleTimelineSpeed(speed)}
        >
          {speed}x
        </button>
      ))}
      <input
        type="range"
        className="timeline-slider"
        min={0}
        max={sliderMax}
        value={sliderValue}
        onChange={handleTimelineSlider}
      />
      <span className="timeline-label">
        {timeline.currentIndex === -1 ? 'LIVE' : `HIST ${timeline.currentIndex + 1}/${timeline.history.length}`}
      </span>
      <span className="timeline-label" style={{ minWidth: 'auto', color: '#475569' }}>|</span>
      <button
        className="tm-bookmark-btn"
        onClick={handleBookmark}
        title="Bookmark current state as comparison point"
      >
        📌
      </button>
      <input
        type="datetime-local"
        className="tm-date-picker"
        value={historicalTimestamp}
        onChange={handleHistoricalDateChange}
        step={1}
      />
      <button
        className={`tm-toggle-btn ${historicalEnabled ? 'active' : ''}`}
        onClick={() => {
          setHistoricalEnabled((p) => {
            if (!p && !historicalTimestamp) {
              const now = new Date().toISOString().slice(0, 16)
              setHistoricalTimestamp(now)
              const rng = seededRandom(now)
              const liveData = interpRef.current
              if (liveData.length > 0) {
                const hist: InterpRobot[] = liveData.map((r) => ({
                  ...r,
                  x: Math.max(0.5, Math.min(9.5, r.x + (rng() - 0.5) * 1.8)),
                  y: Math.max(0.5, Math.min(9.0, r.y + (rng() - 0.5) * 1.8)),
                  theta: r.theta + (rng() - 0.5) * 0.8,
                  uptime_pct: Math.max(0, Math.min(100, r.uptime_pct + (rng() - 0.5) * 12)),
                  status: rng() > 0.7 ? (rng() > 0.5 ? 'idle' : 'error') : r.status,
                }))
                historicalRef.current = hist
                setTimeout(() => dispatchDiffEvent(), 0)
              }
            }
            return !p
          })
        }}
        title="Compare live vs historical"
      >
        {historicalEnabled ? '⛶ Live' : '⛶ Compare'}
      </button>
    </div>
  )

  const formatTimestamp = (isoLocal: string) => {
    if (!isoLocal) return ''
    const d = new Date(isoLocal)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  /* Build the label for the historical panel */
  const histLabel = historicalTimestamp ? `HISTORICAL: ${formatTimestamp(historicalTimestamp)}` : 'HISTORICAL'

  const canvasElement = historicalEnabled ? (
    <div className="tm-comparison-container">
      <div className="tm-canvas-wrapper">
        <canvas
          ref={canvasRef}
          width={FACTORY_W}
          height={FACTORY_H}
          onClick={handleCanvasClick}
          onContextMenu={handleCanvasContextMenu}
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            display: 'block',
            objectFit: 'contain',
          }}
        />
        <div className="tm-label tm-label--live">LIVE</div>
      </div>
      <div className="tm-canvas-wrapper">
        <canvas
          ref={historicalCanvasRef}
          width={FACTORY_W}
          height={FACTORY_H}
          onClick={handleCanvasClick}
          onContextMenu={handleCanvasContextMenu}
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            display: 'block',
            objectFit: 'contain',
          }}
        />
        <div className="tm-label tm-label--hist">{histLabel}</div>
      </div>
    </div>
  ) : (
    <canvas
      ref={canvasRef}
      width={FACTORY_W}
      height={FACTORY_H}
      onClick={handleCanvasClick}
      onContextMenu={handleCanvasContextMenu}
      style={{
        width: '100%',
        height: '100%',
        borderRadius: '0.5rem',
        cursor: 'pointer',
        display: 'block',
        objectFit: 'contain',
      }}
    />
  )

  const overlays = (
    <>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          robot={contextMenu.robot}
          onOpenSettings={handleOpenSettings}
          onRobotStart={onRobotStart}
          onRobotStop={onRobotStop}
          onClose={() => setContextMenu(null)}
        />
      )}
      {showSettings && (
        <MapSettingsPanel onClose={() => setShowSettings(false)} />
      )}
      {selectedRobot && (
        <>
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 999,
            }}
            onClick={dismissPopup}
          />
          <div
            className="robot-popup"
            style={{
              position: 'fixed',
              left: popupPos.x + 12,
              top: Math.max(10, Math.min(window.innerHeight - 200, popupPos.y - 80)),
              zIndex: 1000,
              background: '#131d31',
              border: '1px solid #1e2d4a',
              borderRadius: '0.5rem',
              padding: '0.75rem',
              minWidth: '180px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
              <div style={{ fontWeight: 600, color: '#e2e8f0', fontSize: '0.8rem' }}>
                {selectedRobot.name}
              </div>
              <button
                onClick={dismissPopup}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#7e93b4',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  padding: '0 0.2rem',
                  lineHeight: 1,
                }}
                title="Close"
              >
                ✕
              </button>
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
            {role !== 'viewer' && selectedRobot.status !== 'moving' && selectedRobot.status !== 'active' && (
              <button
                className="robot-popup-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  onRobotStart?.(selectedRobot.robot_id)
                  dismissPopup()
                }}
                style={{
                  background: '#22c55e',
                  border: 'none',
                  color: '#fff',
                  padding: '0.25rem 0.8rem',
                  borderRadius: '0.25rem',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  marginRight: '0.3rem',
                }}
              >
                ▶ Start
              </button>
            )}
            {role !== 'viewer' && (selectedRobot.status === 'moving' || selectedRobot.status === 'active') && (
              <button
                className="robot-popup-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  onRobotStop?.(selectedRobot.robot_id)
                  dismissPopup()
                }}
                style={{
                  background: '#ef4444',
                  border: 'none',
                  color: '#fff',
                  padding: '0.25rem 0.8rem',
                  borderRadius: '0.25rem',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                ■ Stop
              </button>
            )}
            <button
              onClick={dismissPopup}
              style={{
                background: 'transparent',
                border: '1px solid #1e2d4a',
                color: '#7e93b4',
                padding: '0.2rem 0.6rem',
                borderRadius: '0.25rem',
                fontSize: '0.65rem',
                cursor: 'pointer',
                marginLeft: '0.3rem',
              }}
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </>
  )

  if (fullscreen) {
    return createPortal(
      <div className="fullscreen-map-overlay">
        <div className="fullscreen-map-header">
          <h3>Factory Floor</h3>
          <div className="fullscreen-map-hud">
            <span>{currentTime}</span>
            <span>{robots.length} active</span>
          </div>
          <button
            style={{ ...settingsButtonStyle, marginLeft: 0 }}
            onClick={() => setFullscreen(false)}
            title="Close Fullscreen"
          >
            ✕ Close
          </button>
        </div>
        <div className="fullscreen-map-canvas">
          {is3D ? (
            <ThreeDView
              active={true}
              robots={robots}
              customColors={settings.robotColors}
              onRobotSelect={handle3DRobotSelect}
            />
          ) : (
            canvasElement
          )}
        </div>
        {timelineBar}
        {overlays}
      </div>,
      document.body,
    )
  }

  return (
    <div className="digital-twin" style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
        <h3 style={{ marginBottom: 0 }}>Factory Floor</h3>
        <button
          className="map-view-toggle"
          style={settingsButtonStyle}
          onClick={() => setIs3D((p) => !p)}
          title={is3D ? 'Switch to 2D view' : 'Switch to 3D view'}
        >
          {is3D ? '2D' : '3D'}
        </button>
        <button style={settingsButtonStyle} onClick={() => setShowSettings(true)} title="Map Settings">
          ⚙ Settings
        </button>
        <button
          style={{ ...settingsButtonStyle, marginLeft: undefined }}
          onClick={() => setFullscreen(true)}
          title="Fullscreen Map"
        >
          ⛶ Fullscreen
        </button>
      </div>
      {is3D ? (
        <div style={{ flex: 1, minHeight: 0, borderRadius: '0.5rem', overflow: 'hidden' }}>
          <ThreeDView
            active={true}
            robots={robots}
            customColors={settings.robotColors}
            onRobotSelect={handle3DRobotSelect}
          />
        </div>
      ) : (
        canvasElement
      )}
      {timelineBar}
      {overlays}
    </div>
  )
}
