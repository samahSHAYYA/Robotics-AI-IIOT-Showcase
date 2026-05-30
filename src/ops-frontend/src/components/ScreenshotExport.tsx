import { useState, useCallback } from 'react'

const CAPTURE_W = 1200
const CAPTURE_H = 800

function timestampFilename(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `dashboard-${yyyy}-${mm}-${dd}-${hh}${min}${ss}.png`
}

export default function ScreenshotExport() {
  const [toast, setToast] = useState(false)

  const handleCapture = useCallback(() => {
    const composite = document.createElement('canvas')
    composite.width = CAPTURE_W
    composite.height = CAPTURE_H
    const ctx = composite.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#0b1121'
    ctx.fillRect(0, 0, CAPTURE_W, CAPTURE_H)

    ctx.fillStyle = '#1e2d4a'
    ctx.fillRect(0, 0, CAPTURE_W, 56)

    ctx.fillStyle = '#e2e8f0'
    ctx.font = 'bold 18px sans-serif'
    ctx.fillText('Smart Factory Supervisor', 16, 24)

    ctx.fillStyle = '#7e93b4'
    ctx.font = '11px sans-serif'
    ctx.fillText(new Date().toLocaleString(), 16, 44)

    const canvases = document.querySelectorAll<HTMLCanvasElement>('canvas')
    let x = 16
    let y = 72

    canvases.forEach((canvas) => {
      try {
        const cw = canvas.width
        const ch = canvas.height
        if (cw === 0 || ch === 0) return

        let dw: number, dh: number
        if (x > CAPTURE_W / 2) {
          x = 16
          y += 260
        }
        if (cw > ch) {
          dw = Math.min(cw, CAPTURE_W - 32)
          dh = (ch / cw) * dw
          if (dh > 320) {
            dh = 320
            dw = (cw / ch) * dh
          }
        } else {
          dh = Math.min(ch, 240)
          dw = (cw / ch) * dh
        }

        if (y + dh > CAPTURE_H - 16) {
          dw = Math.min(dw, CAPTURE_W - 32)
          dh = Math.min(dh, CAPTURE_H - y - 16)
        }

        ctx.drawImage(canvas, x, y, dw, dh)

        ctx.strokeStyle = 'rgba(59, 130, 246, 0.3)'
        ctx.lineWidth = 1
        ctx.strokeRect(x, y, dw, dh)

        x += dw + 12
      } catch {
        // skip canvases that cannot be captured
      }
    })

    const link = document.createElement('a')
    link.download = timestampFilename()
    link.href = composite.toDataURL('image/png')
    link.click()

    setToast(true)
    setTimeout(() => setToast(false), 2000)
  }, [])

  return (
    <>
      <button className="screenshot-btn" onClick={handleCapture} title="Capture dashboard screenshot">
        📷
      </button>
      {toast && <div className="screenshot-toast">Captured!</div>}
    </>
  )
}
