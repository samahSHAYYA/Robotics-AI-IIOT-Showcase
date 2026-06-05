import { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeRaw from 'rehype-raw'
import type { ChatMessage, InlineChartData } from '../types/agent'
import { authFetch } from '../utils/auth-fetch'
import TelemetryChart from './TelemetryChart'

const CHART_RE = /\{("chart":\s*true\s*,.*?)\}/g
const STORAGE_KEY = 'chat-history'
const MAX_HISTORY = 20

const SUGGESTED_PROMPTS = [
  'What is the current factory status?',
  'Show me temperature trends',
  'Which robots are active?',
  'Any critical alerts?',
  'Energy consumption summary',
  'Compare robot performance',
]

let idCounter = 0
function uid(): string {
  return `msg_${Date.now()}_${++idCounter}`
}

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
    } catch { /* ignore parse errors */ }
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

interface MarkdownMessageProps {
  text: string
}

function MarkdownMessage({ text }: MarkdownMessageProps) {
  return (
    <ReactMarkdown
      rehypePlugins={[rehypeHighlight, rehypeRaw]}
      components={{
        code({ className, children, ...props }) {
          const isInline = !className
          if (isInline) {
            return <code className="chat-inline-code" {...props}>{children}</code>
          }
          return (
            <pre className="chat-code-block">
              <code className={className} {...props}>{children}</code>
            </pre>
          )
        },
      }}
    >
      {text}
    </ReactMarkdown>
  )
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

function needsDateSeparator(prevTs: number | null, currTs: number): boolean {
  if (prevTs === null) return true
  const prev = new Date(prevTs)
  const curr = new Date(currTs)
  return prev.toDateString() !== curr.toDateString()
}

export default function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) return JSON.parse(stored) as ChatMessage[]
    } catch { /* ignore corrupt data */ }
    return []
  })
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const activeStream = useRef<AbortController | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const streamingMsgId = useRef<string | null>(null)

  // Persist messages to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
  }, [messages])

  // Auto-scroll on new content
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages, streamingText])

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + 'px'
    }
  }, [input])

  const scrollToBottom = useCallback(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [])

  const buildHistory = useCallback((msgs: ChatMessage[]): Array<{ role: string; content: string }> => {
    const recent = msgs.slice(-MAX_HISTORY)
    return recent.map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.text,
    }))
  }, [])

  const dispatchAgentResponse = useCallback((text: string) => {
    window.dispatchEvent(new CustomEvent('chat-agent-response', { detail: text }))
  }, [])

  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages(prev => [...prev, msg])
    if (msg.role === 'agent' && msg.text) {
      dispatchAgentResponse(msg.text)
    }
  }, [dispatchAgentResponse])

  const replaceLastAgent = useCallback((text: string, chart?: any, inlineChart?: InlineChartData) => {
    setMessages(prev => {
      const idx = prev.length - 1
      if (idx < 0) return prev
      const updated = [...prev]
      updated[idx] = { ...updated[idx], text, ts: Date.now(), chart, inlineChart }
      return updated
    })
    if (text) dispatchAgentResponse(text)
  }, [dispatchAgentResponse])

  const sendViaStream = useCallback(async (msgText: string) => {
    setLoading(true)
    const userMsg: ChatMessage = { role: 'user', text: msgText, ts: Date.now(), id: uid() }
    addMessage(userMsg)

    const agentMsgId = uid()
    streamingMsgId.current = agentMsgId
    const placeholder: ChatMessage = { role: 'agent', text: '', ts: Date.now(), id: agentMsgId }
    addMessage(placeholder)
    setStreamingText('')
    scrollToBottom()

    const history = buildHistory([...messages, userMsg])

    const controller = new AbortController()
    activeStream.current = controller

    try {
      const resp = await authFetch('/api/v1/agent/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msgText, history }),
        signal: controller.signal,
      })

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)

      const reader = resp.body?.getReader()
      if (!reader) throw new Error('No reader available')

      const decoder = new TextDecoder()
      let buffer = ''
      let fullReply = ''
      let chart: any

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const dataStr = line.slice(6).trim()
          try {
            const data = JSON.parse(dataStr)
            if (data.token) {
              fullReply += data.token
              setStreamingText(fullReply)
              scrollToBottom()
            }
            if (data.done) {
              // Parse chart data from the reply
              const { clean, chart: inlineCh } = tryParseChart(data.reply || fullReply)
              replaceLastAgent(clean || data.reply || fullReply, chart, inlineCh)
              setStreamingText('')
              streamingMsgId.current = null
            }
          } catch { /* skip malformed JSON */ }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        replaceLastAgent('Error contacting AI Agent service. Please try again.')
      }
      setStreamingText('')
      streamingMsgId.current = null
    } finally {
      setLoading(false)
      activeStream.current = null
    }
  }, [messages, addMessage, buildHistory, replaceLastAgent, scrollToBottom])

  const sendViaHttp = useCallback(async (msgText: string) => {
    setLoading(true)
    const userMsg: ChatMessage = { role: 'user', text: msgText, ts: Date.now(), id: uid() }
    addMessage(userMsg)

    try {
      const history = buildHistory([...messages, userMsg])
      const resp = await authFetch('/api/v1/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msgText, history }),
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = await resp.json()
      const replyText: string = data.reply ?? ''
      const { clean, chart: inlineChart } = tryParseChart(replyText)
      const agentMsg: ChatMessage = {
        role: 'agent',
        text: clean || replyText,
        ts: Date.now(),
        chart: data.chart ?? undefined,
        inlineChart,
        id: uid(),
      }
      addMessage(agentMsg)
    } catch {
      const agentMsg: ChatMessage = {
        role: 'agent',
        text: 'Error contacting AI Agent service. Please try again.',
        ts: Date.now(),
        id: uid(),
      }
      addMessage(agentMsg)
    }
    setLoading(false)
  }, [messages, addMessage, buildHistory])

  const send = useCallback(async (msgOverride?: string) => {
    const msg = (msgOverride ?? input).trim()
    if (!msg || loading) return
    setInput('')

    // Try streaming endpoint first; fall back to HTTP POST
    try {
      await sendViaStream(msg)
    } catch {
      await sendViaHttp(msg)
    }
  }, [input, loading, sendViaStream, sendViaHttp])

  // Suggested prompts prefill
  const handlePreFill = useCallback((e: Event) => {
    const ce = e as CustomEvent
    if (typeof ce.detail === 'string') setInput(ce.detail)
  }, [])

  useEffect(() => {
    window.addEventListener('chat-pre-fill', handlePreFill)
    return () => window.removeEventListener('chat-pre-fill', handlePreFill)
  }, [handlePreFill])

  const clearChat = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setMessages([])
    setShowClearConfirm(false)
  }, [])

  const exportChat = useCallback(() => {
    const lines = messages.map(m => {
      const role = m.role === 'user' ? '**You**' : '**AI**'
      const ts = formatTime(m.ts)
      return `[${ts}] ${role}: ${m.text}`
    })
    const text = lines.join('\n\n')
    const blob = new Blob([text], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `chat-${new Date().toISOString().slice(0, 10)}.md`
    a.click()
    URL.revokeObjectURL(url)
  }, [messages])

  const copyText = useCallback((text: string) => {
    navigator.clipboard.writeText(text)
  }, [])

  const editMessage = useCallback((msgId: string) => {
    const msg = messages.find(m => m.id === msgId)
    if (msg) setInput(msg.text)
    // Remove this message and everything after it
    const idx = messages.findIndex(m => m.id === msgId)
    if (idx >= 0) {
      setMessages(prev => prev.slice(0, idx))
    }
    inputRef.current?.focus()
  }, [messages])

  const retryMessage = useCallback((msgId: string) => {
    const idx = messages.findIndex(m => m.id === msgId)
    if (idx < 0) return
    // Remove this message and everything after it
    const prevMessages = messages.slice(0, idx)
    setMessages(prevMessages)
    // Re-send
    const msg = messages[idx]
    if (msg.role === 'user') {
      send(msg.text)
    }
  }, [messages, send])

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }, [send])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
        e.preventDefault()
        setShowClearConfirm(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Cancel in-flight stream on unmount
  useEffect(() => {
    return () => {
      activeStream.current?.abort()
    }
  }, [])

  const hasMessages = messages.length > 0
  const showWelcome = !hasMessages

  return (
    <div className="chat-panel">
      {/* Header */}
      <div className="chat-header">
        <h3>AI Assistant</h3>
        <div className="chat-header-actions">
          {hasMessages && (
            <>
              <button className="chat-header-btn" onClick={exportChat} title="Export chat as Markdown">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </button>
              <button
                className="chat-header-btn"
                onClick={() => setShowClearConfirm(true)}
                title="Clear conversation (Ctrl+Shift+C)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Clear confirmation */}
      {showClearConfirm && (
        <div className="chat-confirm-overlay">
          <div className="chat-confirm-box">
            <p>Clear conversation history?</p>
            <div className="chat-confirm-actions">
              <button className="chat-confirm-btn chat-confirm-btn--yes" onClick={clearChat}>Clear</button>
              <button className="chat-confirm-btn chat-confirm-btn--no" onClick={() => setShowClearConfirm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="chat-messages" ref={listRef}>
        {showWelcome && (
          <div className="chat-welcome">
            <div className="chat-welcome-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <h2 className="chat-welcome-title">Factory AI Assistant</h2>
            <p className="chat-welcome-sub">
              Ask me about factory telemetry — temperature, battery, alerts, or overall status.
            </p>
          </div>
        )}

        {/* Date separators and messages */}
        {messages.map((m, i) => {
          const prevTs = i > 0 ? messages[i - 1].ts : null
          const showDate = needsDateSeparator(prevTs, m.ts)
          const isStreaming = streamingMsgId.current === m.id && streamingText.length > 0

          return (
            <div key={m.id}>
              {showDate && (
                <div className="chat-date-separator">
                  <span>{formatDate(m.ts)}</span>
                </div>
              )}
              <div className={`chat-message chat-message--${m.role}`}>
                <div className={`chat-bubble chat-bubble--${m.role}${isStreaming ? ' chat-bubble--streaming' : ''}`}>
                  {m.role === 'agent' ? (
                    isStreaming ? (
                      <MarkdownMessage text={streamingText} />
                    ) : m.text ? (
                      <>
                        <MarkdownMessage text={m.text} />
                        {m.chart && <TelemetryChart config={m.chart} />}
                        {m.inlineChart && <InlineChartRenderer data={m.inlineChart} />}
                      </>
                    ) : null
                  ) : (
                    <>
                      <p>{m.text}</p>
                      {m.chart && <TelemetryChart config={m.chart} />}
                      {m.inlineChart && <InlineChartRenderer data={m.inlineChart} />}
                    </>
                  )}

                  {/* Message actions */}
                  {!isStreaming && m.text && (
                    <div className="chat-actions">
                      {m.role === 'agent' && (
                        <button className="chat-action-btn" onClick={() => copyText(m.text)} title="Copy">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                          </svg>
                        </button>
                      )}
                      {m.role === 'user' && (
                        <>
                          <button className="chat-action-btn" onClick={() => editMessage(m.id)} title="Edit">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                          <button className="chat-action-btn" onClick={() => retryMessage(m.id)} title="Retry">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="23 4 23 10 17 10" />
                              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                            </svg>
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
                <div className="chat-timestamp">{formatTime(m.ts)}</div>
              </div>
            </div>
          )
        })}

        {/* Typing indicator */}
        {loading && !streamingText && (
          <div className="chat-message chat-message--agent">
            <div className="chat-bubble chat-bubble--agent">
              <div className="chat-typing">
                <span className="chat-typing-dot" />
                <span className="chat-typing-dot" />
                <span className="chat-typing-dot" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Suggested prompts */}
      {hasMessages && messages.length <= 2 && (
        <div className="chat-suggested">
          {SUGGESTED_PROMPTS.map(p => (
            <button key={p} className="chat-chip" onClick={() => send(p)} disabled={loading}>
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="chat-input-area">
        <textarea
          ref={inputRef}
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about telemetry..."
          disabled={loading}
          rows={1}
        />
        <button
          className="chat-send-btn"
          onClick={() => send()}
          disabled={loading || !input.trim()}
          title="Send (Enter)"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  )
}
