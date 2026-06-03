import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import { authFetch, getToken } from '../utils/auth-fetch'
import type { TelemetrySnapshot, RobotStatus, Alert, Event, WorkerStatus } from '../types/telemetry'

const WS_URL = import.meta.env.VITE_WS_URL ?? `${window.location.host}/ws`

interface TelemetryContextType {
  telemetry: TelemetrySnapshot | undefined
  robots: RobotStatus[]
  workers: WorkerStatus[]
  alerts: Alert[]
  events: Event[]
  error: string | null
  wsStatus: string
  kpiDiffs: Record<string, { value: number; direction: 'up' | 'down' }> | undefined
  handleRobotStart: (id: string) => Promise<void>
  handleRobotStop: (id: string) => Promise<void>
  handleAssignTask: (id: string, task: string) => Promise<void>
  handleWorkerToggle: (id: string) => Promise<void>
  handleEmergencyStop: (id: string) => Promise<void>
  handleDownloadPdf: () => Promise<void>
  handleRetry: () => void
}

const TelemetryContext = createContext<TelemetryContextType | null>(null)

export function TelemetryProvider({ children }: { children: ReactNode }) {
  const [telemetry, setTelemetry] = useState<TelemetrySnapshot | undefined>()
  const [robots, setRobots] = useState<RobotStatus[]>([])
  const [workers, setWorkers] = useState<WorkerStatus[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [error, setError] = useState<string | null>(null)
  const [kpiDiffs, setKpiDiffs] = useState<Record<string, { value: number; direction: 'up' | 'down' }> | undefined>(undefined)
  const maxRetriesReached = useRef(false)

  const handleMessage = useCallback((data: unknown) => {
    const msg = data as { type: string; data: unknown }
    if (!msg?.type) return
    setError(null)
    switch (msg.type) {
      case 'snapshot': {
        const snapshot = msg.data as TelemetrySnapshot
        setTelemetry(snapshot)
        setRobots(snapshot.robots ?? [])
        setWorkers(snapshot.workers ?? [])
        setAlerts(snapshot.alerts ?? [])
        break
      }
      case 'event': {
        const ev = msg.data as Event
        setEvents((prev) =>
          prev.some((e) => e.id === ev.id) ? prev : [...prev, ev],
        )
        break
      }
      case 'prediction':
        break
    }
  }, [])

  const handleWsError = useCallback((err: string) => {
    setError(err)
  }, [])

  const wsToken = getToken()
  const wsUrl = wsToken ? `${WS_URL}?token=${encodeURIComponent(wsToken)}` : WS_URL
  const { status: wsStatus } = useWebSocket(wsUrl, handleMessage, handleWsError)

  useEffect(() => {
    if (wsStatus === 'failed') {
      maxRetriesReached.current = true
    }
    if (wsStatus === 'connected' && maxRetriesReached.current) {
      maxRetriesReached.current = false
      window.location.reload()
    }
  }, [wsStatus])

  const handleRobotStart = useCallback(async (id: string) => {
    setRobots(prev => prev.map(r =>
      r.robot_id === id ? { ...r, status: 'active' as const } : r
    ))
    try {
      await authFetch(`/api/v1/robot/${id}/start`, { method: 'POST' })
    } catch { /* ignore */ }
  }, [])

  const handleRobotStop = useCallback(async (id: string) => {
    setRobots(prev => prev.map(r =>
      r.robot_id === id ? { ...r, status: 'idle' as const } : r
    ))
    try {
      await authFetch(`/api/v1/robot/${id}/stop`, { method: 'POST' })
    } catch { /* ignore */ }
  }, [])

  const handleAssignTask = useCallback(async (id: string, task: string) => {
    try {
      await authFetch(`/api/v1/robot/${id}/task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task }),
      })
    } catch { /* ignore */ }
  }, [])

  const handleWorkerToggle = useCallback(async (id: string) => {
    try {
      await authFetch(`/api/v1/worker/${id}/toggle`, { method: 'POST' })
    } catch { /* ignore */ }
  }, [])

  const handleEmergencyStop = useCallback(async (id: string) => {
    try {
      await authFetch(`/api/v1/robot/${id}/emergency-stop`, { method: 'POST' })
    } catch { /* ignore */ }
  }, [])

  const handleDownloadPdf = useCallback(async () => {
    try {
      const res = await authFetch('/api/v1/reports/pdf')
      if (!res.ok) throw new Error('PDF download failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `report-${new Date().toISOString().slice(0, 10)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch { /* ignore */ }
  }, [])

  const handleRetry = useCallback(() => {
    setError(null)
  }, [])

  useEffect(() => {
    const handler = ((e: globalThis.Event) => {
      const detail = (e as CustomEvent).detail as Record<string, { value: number; direction: 'up' | 'down' }>
      setKpiDiffs(detail)
    }) as unknown as EventListener
    window.addEventListener('time-machine-diff', handler)
    return () => window.removeEventListener('time-machine-diff', handler)
  }, [])

  return (
    <TelemetryContext.Provider value={{
      telemetry, robots, workers, alerts, events, error, wsStatus, kpiDiffs,
      handleRobotStart, handleRobotStop, handleAssignTask, handleWorkerToggle,
      handleEmergencyStop, handleDownloadPdf, handleRetry,
    }}>
      {children}
    </TelemetryContext.Provider>
  )
}

export function useTelemetry(): TelemetryContextType {
  const ctx = useContext(TelemetryContext)
  if (!ctx) throw new Error('useTelemetry must be used within TelemetryProvider')
  return ctx
}
