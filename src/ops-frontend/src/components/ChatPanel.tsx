import { useState, useRef, useEffect, useCallback } from 'react'
import type { ChatMessage } from '../types/agent'
import TelemetryChart from './TelemetryChart'

export default function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'agent', text: 'Ask me about factory telemetry — temperature, battery, alerts, or overall status.' },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages])

  const handlePreFill = useCallback((e: Event) => {
    const ce = e as CustomEvent
    if (typeof ce.detail === 'string') setInput(ce.detail)
  }, [])

  useEffect(() => {
    window.addEventListener('chat-pre-fill', handlePreFill)
    return () => window.removeEventListener('chat-pre-fill', handlePreFill)
  }, [handlePreFill])

  const send = async () => {
    const msg = input.trim()
    if (!msg || loading) return
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', text: msg }])
    setLoading(true)

    try {
      const resp = await fetch('/api/v1/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      setMessages((prev) => [...prev, { role: 'agent', text: data.reply, chart: data.chart ?? undefined }])
    } catch {
      setMessages((prev) => [...prev, { role: 'agent', text: 'Error contacting AI Agent service.' }])
    }
    setLoading(false)
  }

  return (
    <div className="chat-panel">
      <h3>AI Agent</h3>
      <div className="chat-messages" ref={listRef}>
        {messages.map((m, i) => (
          <div key={i} class={`chat-msg chat-msg--${m.role}`}>
            <div className="chat-bubble">{m.text}</div>
            {m.chart && <TelemetryChart config={m.chart} />}
          </div>
        ))}
        {loading && <div className="chat-msg chat-msg--agent"><div className="chat-bubble chat-thinking">Thinking...</div></div>}
      </div>
      <div className="chat-input-row">
        <input
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Ask about telemetry..."
          disabled={loading}
        />
        <button className="btn-send" onClick={send} disabled={loading}>Send</button>
      </div>
    </div>
  )
}
