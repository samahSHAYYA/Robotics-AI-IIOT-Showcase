import { useEffect, useRef, useCallback, useState } from 'react'

type MessageHandler = (data: unknown) => void

export type WsStatus = 'connecting' | 'connected' | 'disconnected' | 'failed'

const MAX_RETRIES = 5
const RECONNECT_DELAY = 3000

export function useWebSocket(url: string, onMessage: MessageHandler, onError?: (err: string) => void) {
  const [status, setStatus] = useState<WsStatus>('connecting')
  const wsRef = useRef<WebSocket | null>(null)
  const onMessageRef = useRef(onMessage)
  const onErrorRef = useRef(onError)
  const retryRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)
  onMessageRef.current = onMessage
  onErrorRef.current = onError

  const cleanup = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    wsRef.current?.close()
    wsRef.current = null
  }, [])

  const connect = useCallback(() => {
    if (!mountedRef.current) return

    cleanup()
    setStatus('connecting')

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = url.startsWith('ws') ? url : `${protocol}//${url}`
    const ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      if (!mountedRef.current) { ws.close(); return }
      retryRef.current = 0
      setStatus('connected')
    }

    ws.onclose = () => {
      if (!mountedRef.current) return
      setStatus('disconnected')
      retryRef.current += 1
      if (retryRef.current <= MAX_RETRIES) {
        setStatus('connecting')
        timerRef.current = setTimeout(connect, RECONNECT_DELAY)
      } else {
        setStatus('failed')
      }
    }

    ws.onerror = () => {
      onErrorRef.current?.('WebSocket connection error')
      ws.close()
    }

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data)
        onMessageRef.current(parsed)
      } catch { /* ignore malformed messages */ }
    }

    wsRef.current = ws
  }, [url, cleanup])

  useEffect(() => {
    mountedRef.current = true
    retryRef.current = 0
    connect()

    return () => {
      mountedRef.current = false
      cleanup()
    }
  }, [connect, cleanup])

  return { status, wsRef }
}
