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
  return `dashboard-${yyyy}-${mm}-${dd}-${hh}${min}${ss}.jpg`
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
      link.href = canvas.toDataURL('image/jpeg', 0.92)
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
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
      </button>
      {toast && <div className="screenshot-toast">Captured!</div>}
    </>
  )
}
