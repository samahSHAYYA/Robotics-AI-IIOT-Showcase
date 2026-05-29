import { useState, useRef, useEffect } from 'react'
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
    <div class="chat-panel">
      <h3>AI Agent</h3>
      <div class="chat-messages" ref={listRef}>
        {messages.map((m, i) => (
          <div key={i} class={`chat-msg chat-msg--${m.role}`}>
            <div class="chat-bubble">{m.text}</div>
            {m.chart && <TelemetryChart config={m.chart} />}
          </div>
        ))}
        {loading && <div class="chat-msg chat-msg--agent"><div class="chat-bubble chat-thinking">Thinking...</div></div>}
      </div>
      <div class="chat-input-row">
        <input
          class="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Ask about telemetry..."
          disabled={loading}
        />
        <button class="btn-send" onClick={send} disabled={loading}>Send</button>
      </div>
    </div>
  )
}
