import { useEffect, useRef, useCallback } from 'react'

type MessageHandler = (data: unknown) => void

export function useWebSocket(url: string, onMessage: MessageHandler) {
  const wsRef = useRef<WebSocket | null>(null)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = url.startsWith('ws') ? url : `${protocol}//${url}`
    const ws = new WebSocket(wsUrl)
    ws.onopen = () => console.log('WebSocket connected')
    ws.onclose = () => {
      console.log('WebSocket disconnected, reconnecting in 3s')
      setTimeout(connect, 3000)
    }
    ws.onerror = () => ws.close()
    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data)
        onMessageRef.current(parsed)
      } catch { /* ignore */ }
    }
    wsRef.current = ws
  }, [url])

  useEffect(() => {
    connect()
    return () => wsRef.current?.close()
  }, [connect])

  return wsRef
}
