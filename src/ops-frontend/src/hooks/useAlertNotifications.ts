import { useState, useEffect, useRef, useCallback } from 'react'
import type { Alert } from '../types/telemetry'

const SEVERITY_LEVELS = ['critical', 'warning', 'info'] as const
export type AlertSeverity = (typeof SEVERITY_LEVELS)[number]

interface UseAlertNotificationsOptions {
  enabled?: boolean
}

interface UseAlertNotificationsReturn {
  notifEnabled: boolean
  setNotifEnabled: (v: boolean) => void
  minSeverity: AlertSeverity
  cycleSeverity: () => void
}

function loadPref(): boolean {
  try {
    return localStorage.getItem('notifEnabled') !== 'false'
  } catch {
    return true
  }
}

function savePref(v: boolean) {
  try { localStorage.setItem('notifEnabled', v ? 'true' : 'false') } catch { }
}

function loadMinSeverity(): AlertSeverity {
  try {
    const v = localStorage.getItem('notifMinSeverity')
    if (v === 'critical' || v === 'warning' || v === 'info') return v
  } catch { }
  return 'critical'
}

function saveMinSeverity(v: AlertSeverity) {
  try { localStorage.setItem('notifMinSeverity', v) } catch { }
}

function playAlertBeep() {
  try {
    const ctx = new AudioContext()
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'square'
    osc.frequency.setValueAtTime(880, now)
    osc.frequency.setValueAtTime(1320, now + 0.12)
    osc.frequency.setValueAtTime(880, now + 0.24)
    gain.gain.setValueAtTime(0.3, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.5)
    setTimeout(() => ctx.close(), 1000)
  } catch { }
}

let permRequested = false

function requestNotifPermission() {
  if (!('Notification' in window)) return
  if (Notification.permission === 'default' && !permRequested) {
    permRequested = true
    Notification.requestPermission()
  }
}

export default function useAlertNotifications(
  alerts: Alert[],
  options?: UseAlertNotificationsOptions,
): UseAlertNotificationsReturn {
  const [notifEnabled, setNotifEnabled] = useState(loadPref)
  const [minSeverity, setMinSeverity] = useState<AlertSeverity>(loadMinSeverity)
  const prevTriggeredCount = useRef(0)

  useEffect(() => {
    savePref(notifEnabled)
  }, [notifEnabled])

  useEffect(() => {
    saveMinSeverity(minSeverity)
  }, [minSeverity])

  useEffect(() => {
    if (!notifEnabled) return
    if (options?.enabled === false) return
    const idx = SEVERITY_LEVELS.indexOf(minSeverity)
    const matched = alerts.filter(a => {
      const ai = SEVERITY_LEVELS.indexOf(a.severity as AlertSeverity)
      return ai >= 0 && ai <= idx
    })
    const newCount = matched.length
    if (newCount > prevTriggeredCount.current) {
      requestNotifPermission()
      playAlertBeep()
      const latest = matched[matched.length - 1]
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification(`Alert [${latest.severity}]`, {
            body: latest.message,
            tag: 'factory-alert',
          })
        } catch { }
      }
    }
    prevTriggeredCount.current = newCount
  }, [alerts, notifEnabled, minSeverity, options?.enabled])

  const setEnabled = useCallback((v: boolean) => {
    setNotifEnabled(v)
    if (v) requestNotifPermission()
  }, [])

  const cycleSeverity = useCallback(() => {
    setMinSeverity(prev => {
      const idx = SEVERITY_LEVELS.indexOf(prev)
      return SEVERITY_LEVELS[(idx + 1) % SEVERITY_LEVELS.length]
    })
  }, [])

  return { notifEnabled, setNotifEnabled: setEnabled, minSeverity, cycleSeverity }
}
