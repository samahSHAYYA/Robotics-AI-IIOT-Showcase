import { useState, useRef, useCallback, useEffect } from 'react'

type VoiceState = 'idle' | 'listening' | 'processing' | 'error'

const COMMANDS: { pattern: RegExp; command: string; paramIdx?: number }[] = [
  { pattern: /^(start|launch)\s+robot\s+(c3|w2|q1)$/i, command: 'start-robot', paramIdx: 2 },
  { pattern: /^(stop|halt)\s+robot\s+(c3|w2|q1)$/i, command: 'stop-robot', paramIdx: 2 },
  { pattern: /^(fullscreen|toggle\s+fullscreen)$/i, command: 'fullscreen' },
  { pattern: /^exit\s+fullscreen$/i, command: 'exit-fullscreen' },
  { pattern: /^(reset\s+map|reset\s+view)$/i, command: 'reset-map' },
  { pattern: /^show\s+alerts$/i, command: 'show-alerts' },
  { pattern: /^hide\s+alerts$/i, command: 'hide-alerts' },
  { pattern: /^show\s+fleet$/i, command: 'show-fleet' },
  { pattern: /^hide\s+fleet$/i, command: 'hide-fleet' },
  { pattern: /^help$/i, command: 'help' },
]

export default function VoiceCommand() {
  const [state, setState] = useState<VoiceState>('idle')
  const recognitionRef = useRef<any>(null)
  const timeoutRef = useRef<number>(0)
  const listeningRef = useRef(false)

  const SpeechRecognition =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  const supported = !!SpeechRecognition

  const cleanup = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = 0
    }
  }, [])

  const stop = useCallback(() => {
    cleanup()
    listeningRef.current = false
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch {
        // ignore errors from stopping already-finished recognition
      }
      recognitionRef.current = null
    }
    setState('idle')
  }, [cleanup])

  useEffect(() => {
    return () => stop()
  }, [stop])

  const parseAndDispatch = useCallback((transcript: string) => {
    const trimmed = transcript.trim()
    let matched = false
    for (const c of COMMANDS) {
      const m = trimmed.match(c.pattern)
      if (m) {
        matched = true
        const params = c.paramIdx != null ? m[c.paramIdx].toUpperCase() : undefined
        window.dispatchEvent(
          new CustomEvent('voice-command', {
            detail: {
              command: c.command,
              params,
              transcript: trimmed,
              recognized: true,
            },
          }),
        )
        break
      }
    }
    if (!matched) {
      window.dispatchEvent(
        new CustomEvent('voice-command', {
          detail: {
            command: '',
            transcript: trimmed,
            recognized: false,
          },
        }),
      )
    }
  }, [])

  const start = useCallback(() => {
    if (!supported) return

    const SR = SpeechRecognition
    const r = new SR()
    r.continuous = false
    r.interimResults = false
    r.lang = 'en-US'

    r.onstart = () => {
      listeningRef.current = true
      setState('listening')
      timeoutRef.current = window.setTimeout(() => stop(), 5000)
    }

    r.onresult = (e: any) => {
      cleanup()
      listeningRef.current = false
      setState('processing')
      const transcript = e.results[0][0].transcript
      parseAndDispatch(transcript)
      window.setTimeout(() => {
        setState((s) => (s === 'processing' ? 'idle' : s))
      }, 1000)
    }

    r.onerror = () => {
      cleanup()
      listeningRef.current = false
      setState('error')
      window.setTimeout(() => setState('idle'), 2000)
    }

    r.onend = () => {
      cleanup()
      if (listeningRef.current) {
        listeningRef.current = false
        setState('idle')
      }
    }

    recognitionRef.current = r
    r.start()
  }, [supported, stop, parseAndDispatch, cleanup, SpeechRecognition])

  const toggle = useCallback(() => {
    if (state === 'listening') stop()
    else start()
  }, [state, stop, start])

  if (!supported) {
    return (
      <button className="voice-btn voice-btn--disabled" title="Voice not supported" disabled>
        🎤
      </button>
    )
  }

  return (
    <button
      className={
        'voice-btn' +
        (state === 'listening' ? ' voice-btn--listening' : '') +
        (state === 'error' ? ' voice-btn--error' : '')
      }
      onClick={toggle}
      title={
        state === 'listening'
          ? 'Listening... (click to stop)'
          : state === 'processing'
            ? 'Processing...'
            : state === 'error'
              ? 'Voice error, try again'
              : 'Voice command'
      }
    >
      🎤
    </button>
  )
}
