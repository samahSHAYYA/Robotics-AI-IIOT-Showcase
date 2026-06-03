import { useState, useRef, useEffect, useCallback } from 'react'
import type { ChatMessage, InlineChartData } from '../types/agent'
import { authFetch } from '../utils/auth-fetch'
import TelemetryChart from './TelemetryChart'

const CHART_RE = /\{("chart":\s*true\s*,.*?)\}/g

const SUGGESTED_PROMPTS = [
  'What is the current factory status?',
  'Show me temperature trends',
  'Which robots are active?',
  'Any critical alerts?',
  'Energy consumption summary',
  'Compare robot performance',
]

function tryParseChart(text: string): { clean: string; chart?: InlineChartData } {
  let clean = text
  let chart: InlineChartData | undefined
  const match = CHART_RE.exec(text)
  if (match) {
    try {
      const parsed = JSON.parse(`{${match[1]}}`)
      if (parsed.chart === true && (parsed.type === 'line' || parsed.type === 'bar') && Array.isArray(parsed.data)) {
        chart = parsed as InlineChartData
        clean = text.replace(match[0], '').trim()
      }
    } catch { }
  }
  return { clean, chart }
}

function InlineChartRenderer({ data }: { data: InlineChartData }) {
  const W = 300
  const H = 140
  const PAD = { top: 16, right: 10, bottom: 28, left: 36 }
  const values = data.data.map(d => d.value)
  const minVal = Math.min(...values) * 0.9
  const maxVal = Math.max(...values) * 1.1
  const vRange = maxVal - minVal || 1
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  const xScale = (i: number) => PAD.left + (i / Math.max(data.data.length - 1, 1)) * chartW
  const yScale = (v: number) => PAD.top + ((maxVal - v) / vRange) * chartH
  const barW = Math.min(24, chartW / data.data.length * 0.6)
  const labelStep = Math.max(1, Math.floor(data.data.length / 5))

  if (data.type === 'line') {
    const pts = data.data.map((d, i) => `${xScale(i)},${yScale(d.value)}`).join(' ')
    const areaPts = `${PAD.left},${H - PAD.bottom} ${pts} ${xScale(data.data.length - 1)},${H - PAD.bottom}`
    return (
      <div className="chat-chart">
        <div className="chat-chart-title">{data.title}</div>
        <svg viewBox={`0 0 ${W} ${H}`} className="chat-chart-svg">
          <defs>
            <linearGradient id="chat-chart-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.3" />
              <stop offset="100%" stop-color="#3b82f6" stop-opacity="0.02" />
            </linearGradient>
          </defs>
          <polygon points={areaPts} fill="url(#chat-chart-grad)" />
          <polyline points={pts} fill="none" stroke="#3b82f6" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
          {data.data.map((d, i) => (
            <circle key={i} cx={xScale(i)} cy={yScale(d.value)} r="3" fill="#3b82f6" stroke="#0b1121" stroke-width="1" />
          ))}
          {data.data.map((d, i) => (
            i % labelStep === 0 ? (
              <text key={i} x={xScale(i)} y={H - 8} text-anchor="middle" fill="#7e93b4" font-size="8">
                {d.label}
              </text>
            ) : null
          ))}
          <text x={8} y={H / 2} text-anchor="middle" fill="#7e93b4" font-size="8" transform={`rotate(-90, 8, ${H / 2})`}>
            Value
          </text>
        </svg>
      </div>
    )
  }

  return (
    <div className="chat-chart">
      <div className="chat-chart-title">{data.title}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="chat-chart-svg">
        {data.data.map((d, i) => {
          const barH = ((d.value - minVal) / vRange) * chartH
          const x = PAD.left + (i / data.data.length) * chartW + (chartW / data.data.length - barW) / 2
          const y = PAD.top + chartH - barH
          return (
            <g key={i}>
              <rect x={x} y={y} width={barW} height={barH} rx="2" fill="#3b82f6" opacity="0.8" />
              <text x={x + barW / 2} y={y - 4} text-anchor="middle" fill="#94a3b8" font-size="8">
                {d.value}
              </text>
              <text x={x + barW / 2} y={H - 8} text-anchor="middle" fill="#7e93b4" font-size="7">
                {d.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

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

  const send = async (msgOverride?: string) => {
    const msg = (msgOverride ?? input).trim()
    if (!msg || loading) return
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', text: msg, ts: Date.now() }])
    setLoading(true)

    try {
      const resp = await authFetch('/api/v1/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      const replyText: string = data.reply ?? ''
      const { clean, chart } = tryParseChart(replyText)
      setMessages((prev) => [...prev, {
        role: 'agent',
        text: clean || replyText,
        ts: Date.now(),
        chart: data.chart ?? undefined,
        inlineChart: chart,
      }])
    } catch {
      setMessages((prev) => [...prev, { role: 'agent', text: 'Error contacting AI Agent service.', ts: Date.now() }])
    }
    setLoading(false)
  }

  const clearChat = () => {
    setMessages([{ role: 'agent', text: 'Conversation cleared. Ask me anything about the factory.', ts: Date.now() }])
  }

  const exportChat = () => {
    const text = messages.map(m => {
      const role = m.role === 'user' ? 'You' : 'AI'
      const ts = m.ts ? new Date(m.ts).toLocaleTimeString() : ''
      return `[${ts}] ${role}: ${m.text}`
    }).join('\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `chat-${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <h3>AI Agent</h3>
        <div className="chat-header-actions">
          <button className="chat-action-btn" onClick={exportChat} title="Export chat">📥</button>
          <button className="chat-action-btn" onClick={clearChat} title="Clear conversation">🗑</button>
        </div>
      </div>
      <div className="chat-messages" ref={listRef}>
        {messages.length <= 1 && (
          <div className="chat-suggested">
            {SUGGESTED_PROMPTS.map(p => (
              <button key={p} className="chat-chip" onClick={() => send(p)} disabled={loading}>
                {p}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg chat-msg--${m.role}`}>
            <div className="chat-bubble">{m.text}</div>
            {m.ts && <div className="chat-ts">{new Date(m.ts).toLocaleTimeString()}</div>}
            {m.chart && <TelemetryChart config={m.chart} />}
            {m.inlineChart && <InlineChartRenderer data={m.inlineChart} />}
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
        <button className="btn-send" onClick={() => send()} disabled={loading}>Send</button>
      </div>
    </div>
  )
}