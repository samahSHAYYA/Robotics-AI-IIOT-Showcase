import { useRef, useEffect, useState, useMemo } from 'react'
import type { RobotStatus } from '../types/telemetry'

interface RobotCameraProps {
  robots: RobotStatus[]
}

/** Simple seeded pseudo-random number generator for deterministic visuals */
function seededRandom(seed: number) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

export default function RobotCamera({ robots }: RobotCameraProps) {
  const [selectedId, setSelectedId] = useState<string>(
    robots.length > 0 ? robots[0].robot_id : '',
  )
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const scrollRef = useRef(0)

  const selectedRobot = useMemo(
    () => robots.find((r) => r.robot_id === selectedId) ?? null,
    [robots, selectedId],
  )

  // Update selected ID when robots list changes and current selection is gone
  useEffect(() => {
    if (!robots.find((r) => r.robot_id === selectedId) && robots.length > 0) {
      setSelectedId(robots[0].robot_id)
    }
  }, [robots, selectedId])

  // Canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const W = 320
    const H = 240
    canvas.width = W
    canvas.height = H

    const render = () => {
      const now = Date.now()
      scrollRef.current = (scrollRef.current + 0.5) % H

      ctx.clearRect(0, 0, W, H)

      // Dark industrial background with gradient
      const bgGrad = ctx.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, 180)
      bgGrad.addColorStop(0, '#1a2332')
      bgGrad.addColorStop(1, '#0d1520')
      ctx.fillStyle = bgGrad
      ctx.fillRect(0, 0, W, H)

      // Perspective floor lines
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.08)'
      ctx.lineWidth = 1
      for (let i = 0; i < 6; i++) {
        const y = 120 + i * 20 + (scrollRef.current % 20) * 0.5
        if (y > H || y < 0) continue
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(W, y)
        ctx.stroke()
      }

      // Draw environment based on robot position
      if (selectedRobot) {
        const rand = seededRandom(
          Math.round(selectedRobot.pose.x * 100) +
          Math.round(selectedRobot.pose.y * 100),
        )

        // Objects in the scene
        const numBoxes = 4 + Math.floor(rand() * 4)
        for (let i = 0; i < numBoxes; i++) {
          const bx = rand() * W
          const by = 100 + rand() * (H - 120)
          const bw = 15 + rand() * 30
          const bh = 20 + rand() * 25

          ctx.fillStyle = `rgba(30, 45, 74, ${0.4 + rand() * 0.4})`
          ctx.fillRect(bx, by, bw, bh)
          ctx.strokeStyle = 'rgba(59, 130, 246, 0.15)'
          ctx.lineWidth = 1
          ctx.strokeRect(bx, by, bw, bh)
        }

        // Task-specific objects
        const task = selectedRobot.current_task ?? ''
        if (task.toLowerCase().includes('assembly') || task.toLowerCase().includes('packaging')) {
          // Conveyor belt with moving parts
          const cx = 40 + (scrollRef.current * 2) % (W - 80)
          ctx.fillStyle = '#475569'
          ctx.fillRect(0, 180, W, 8)
          ctx.fillStyle = '#22c55e'
          ctx.fillRect(cx, 179, 12, 10)
          ctx.fillStyle = '#3b82f6'
          ctx.fillRect((cx + 40) % W, 179, 12, 10)
        }

        if (task.toLowerCase().includes('weld')) {
          // Welding sparks
          for (let i = 0; i < 8; i++) {
            const sx = 100 + Math.sin(now / 200 + i * 2) * 50
            const sy = 130 + Math.cos(now / 150 + i * 1.5) * 30
            ctx.beginPath()
            ctx.arc(sx, sy, 2 + Math.sin(now / 100 + i) * 1, 0, Math.PI * 2)
            ctx.fillStyle = `rgba(234, 179, 8, ${0.3 + Math.sin(now / 80 + i) * 0.3})`
            ctx.fill()
          }
        }

        if (task.toLowerCase().includes('inspection') || task.toLowerCase().includes('quality')) {
          // Scanning laser line
          const lx = ((now / 2000) * W) % W
          ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(lx, 0)
          ctx.lineTo(lx, H)
          ctx.stroke()
          ctx.fillStyle = 'rgba(59, 130, 246, 0.1)'
          ctx.fillRect(lx - 1, 0, 3, H)
        }
      }

      // Scan-line overlay (subtle horizontal lines for camera feel)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.03)'
      for (let i = 0; i < H; i += 3) {
        ctx.fillRect(0, i, W, 1)
      }

      // Rolling scan bar effect
      const scanY = scrollRef.current
      const scanGrad = ctx.createLinearGradient(0, scanY - 15, 0, scanY + 15)
      scanGrad.addColorStop(0, 'rgba(59, 130, 246, 0)')
      scanGrad.addColorStop(0.5, 'rgba(59, 130, 246, 0.06)')
      scanGrad.addColorStop(1, 'rgba(59, 130, 246, 0)')
      ctx.fillStyle = scanGrad
      ctx.fillRect(0, scanY - 15, W, 30)

      // Vignette
      const vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.7)
      vignette.addColorStop(0, 'rgba(0,0,0,0)')
      vignette.addColorStop(1, 'rgba(0,0,0,0.4)')
      ctx.fillStyle = vignette
      ctx.fillRect(0, 0, W, H)

      // HUD overlay — corner brackets
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.6)'
      ctx.lineWidth = 2
      const bracketSize = 15
      const margin = 8
      // Top-left
      ctx.beginPath()
      ctx.moveTo(margin, margin + bracketSize)
      ctx.lineTo(margin, margin)
      ctx.lineTo(margin + bracketSize, margin)
      ctx.stroke()
      // Top-right
      ctx.beginPath()
      ctx.moveTo(W - margin - bracketSize, margin)
      ctx.lineTo(W - margin, margin)
      ctx.lineTo(W - margin, margin + bracketSize)
      ctx.stroke()
      // Bottom-left
      ctx.beginPath()
      ctx.moveTo(margin, H - margin - bracketSize)
      ctx.lineTo(margin, H - margin)
      ctx.lineTo(margin + bracketSize, H - margin)
      ctx.stroke()
      // Bottom-right
      ctx.beginPath()
      ctx.moveTo(W - margin - bracketSize, H - margin)
      ctx.lineTo(W - margin, H - margin)
      ctx.lineTo(W - margin, H - margin - bracketSize)
      ctx.stroke()

      // HUD text labels
      ctx.fillStyle = 'rgba(59, 130, 246, 0.8)'
      ctx.font = 'bold 10px monospace'
      ctx.textAlign = 'left'
      ctx.fillText(`CAM: ${selectedId || '---'}`, margin + 4, margin + 26)

      ctx.fillStyle = 'rgba(239, 68, 68, 0.9)'
      if (Math.floor(now / 1000) % 2 === 0) {
        ctx.fillText('● REC', W - margin - 50, margin + 14)
      }

      rafRef.current = requestAnimationFrame(render)
    }

    rafRef.current = requestAnimationFrame(render)

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [selectedRobot, selectedId])

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
      <div className="camera-select-row">
        <label htmlFor="camera-select">Robot:</label>
        <select
          id="camera-select"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="camera-select"
        >
          {robots.map((r) => (
            <option key={r.robot_id} value={r.robot_id}>
              {r.name} ({r.robot_id})
            </option>
          ))}
        </select>
      </div>
      <div className="camera-view-container">
        <canvas
          ref={canvasRef}
          className="camera-canvas"
          style={{
            borderRadius: '0.5rem',
            imageRendering: 'pixelated',
          }}
        />
      </div>
    </div>
  )
}
