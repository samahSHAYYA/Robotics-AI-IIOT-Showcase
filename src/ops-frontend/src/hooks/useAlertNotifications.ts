import { useState, useEffect, useRef, useCallback } from 'react'
import type { Alert } from '../types/telemetry'

interface UseAlertNotificationsOptions {
  enabled?: boolean
}

interface UseAlertNotificationsReturn {
  notifEnabled: boolean
  setNotifEnabled: (v: boolean) => void
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
  const prevCriticalCount = useRef(0)

  useEffect(() => {
    savePref(notifEnabled)
  }, [notifEnabled])

  useEffect(() => {
    if (!notifEnabled) return
    if (options?.enabled === false) return
    const criticalAlerts = alerts.filter(a => a.severity === 'critical')
    if (criticalAlerts.length > prevCriticalCount.current) {
      requestNotifPermission()
      playAlertBeep()
      const latest = criticalAlerts[criticalAlerts.length - 1]
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification('Critical Alert', {
            body: latest.message,
            tag: 'factory-alert',
          })
        } catch { }
      }
    }
    prevCriticalCount.current = criticalAlerts.length
  }, [alerts, notifEnabled, options?.enabled])

  const setEnabled = useCallback((v: boolean) => {
    setNotifEnabled(v)
    if (v) requestNotifPermission()
  }, [])

  return { notifEnabled, setNotifEnabled: setEnabled }
}
