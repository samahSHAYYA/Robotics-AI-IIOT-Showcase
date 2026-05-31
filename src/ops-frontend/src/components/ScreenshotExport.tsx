import { useState, useCallback, useRef } from 'react'
import html2canvas from 'html2canvas'

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
  const busyRef = useRef(false)

  const handleCapture = useCallback(async () => {
    if (busyRef.current) return
    busyRef.current = true
    try {
      const canvas = await html2canvas(document.body, {
        backgroundColor: '#0b1121',
        scale: 2,
        allowTaint: false,
        useCORS: true,
        logging: false,
      })
      const link = document.createElement('a')
      link.download = timestampFilename()
      link.href = canvas.toDataURL('image/png')
      link.click()
      setToast(true)
      setTimeout(() => setToast(false), 2000)
    } catch {
      setToast(true)
      setTimeout(() => setToast(false), 2000)
    } finally {
      busyRef.current = false
    }
  }, [])

  return (
    <>
      <button className="screenshot-btn" onClick={handleCapture} title="Capture full-page screenshot">
        📷
      </button>
      {toast && <div className="screenshot-toast">Captured!</div>}
    </>
  )
}
