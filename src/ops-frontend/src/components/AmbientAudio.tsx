import { useState, useEffect, useRef, useCallback } from 'react'
import type { RobotStatus } from '../types/telemetry'

interface AmbientAudioProps {
  robots: RobotStatus[]
}

function createAudioCtx(): AudioContext | null {
  try {
    return new AudioContext()
  } catch {
    return null
  }
}

export default function AmbientAudio({ robots }: AmbientAudioProps) {
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(30)
  const [showPopup, setShowPopup] = useState(false)
  const ctxRef = useRef<AudioContext | null>(null)
  const gainRef = useRef<GainNode | null>(null)
  const oscRef = useRef<OscillatorNode | null>(null)
  const noiseRef = useRef<AudioBufferSourceNode | null>(null)
  const alertTimeoutRef = useRef<number | null>(null)

  const initAudio = useCallback(() => {
    if (!ctxRef.current) ctxRef.current = createAudioCtx()
    const ctx = ctxRef.current
    if (!ctx) return
    if (!gainRef.current) {
      const g = ctx.createGain()
      g.gain.value = volume / 100 * 0.15
      g.connect(ctx.destination)
      gainRef.current = g
    }
  }, [volume])

  const stopAll = useCallback(() => {
    if (oscRef.current) {
      try { oscRef.current.stop() } catch { }
      oscRef.current.disconnect()
      oscRef.current = null
    }
    if (noiseRef.current) {
      try { noiseRef.current.stop() } catch { }
      noiseRef.current.disconnect()
      noiseRef.current = null
    }
    if (alertTimeoutRef.current) {
      clearTimeout(alertTimeoutRef.current)
      alertTimeoutRef.current = null
    }
  }, [])

  const playAlertTone = useCallback(() => {
    const ctx = ctxRef.current
    if (!ctx || muted) return
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const alertGain = ctx.createGain()
    osc.type = 'square'
    osc.frequency.setValueAtTime(440, now)
    osc.frequency.setValueAtTime(880, now + 0.15)
    osc.frequency.setValueAtTime(440, now + 0.3)
    alertGain.gain.setValueAtTime(volume / 100 * 0.3, now)
    alertGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5)
    osc.connect(alertGain)
    alertGain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.5)
  }, [muted, volume])

  const startAmbient = useCallback(() => {
    const ctx = ctxRef.current
    if (!ctx || muted || !gainRef.current) return
    stopAll()
    const hasActive = robots.some(r => r.status === 'active' || r.status === 'moving')
    const hasIdle = robots.some(r => r.status === 'idle')
    const hasError = robots.some(r => r.status === 'error')
    if (hasActive) {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = 80
      const g = ctx.createGain()
      g.gain.value = volume / 100 * 0.06
      osc.connect(g)
      g.connect(gainRef.current!)
      osc.start()
      oscRef.current = osc
    } else if (hasIdle && !hasError) {
      const bufferSize = ctx.sampleRate * 2
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.08
      }
      const src = ctx.createBufferSource()
      src.buffer = buffer
      src.loop = true
      const g = ctx.createGain()
      g.gain.value = volume / 100 * 0.03
      src.connect(g)
      g.connect(gainRef.current!)
      src.start()
      noiseRef.current = src
    }
    if (hasError && !hasActive) {
      playAlertTone()
    }
  }, [robots, muted, volume, stopAll, playAlertTone])

  useEffect(() => {
    initAudio()
    return () => {
      stopAll()
      if (ctxRef.current) ctxRef.current.close()
    }
  }, [initAudio, stopAll])

  useEffect(() => {
    startAmbient()
  }, [startAmbient])

  useEffect(() => {
    if (gainRef.current) {
      gainRef.current.gain.value = volume / 100 * 0.15
    }
  }, [volume])

  const toggleMute = () => {
    setMuted(prev => !prev)
    if (!muted) {
      stopAll()
    }
  }

  return (
    <div className="ambient-audio">
      <button
        className={`ambient-audio-btn${showPopup ? ' ambient-audio-btn--active' : ''}`}
        onClick={() => setShowPopup(p => !p)}
        title={muted ? 'Unmute ambient audio' : 'Mute ambient audio'}
      >
        {muted ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          </svg>
        )}
      </button>
      {showPopup && (
        <div className="ambient-audio-popup">
          <div className="ambient-audio-label">Master Volume</div>
          <input
            type="range"
            className="ambient-audio-slider"
            min={0}
            max={100}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
          />
          <div className="ambient-audio-label">{volume}%</div>
          <button className="ambient-audio-mute-btn" onClick={toggleMute}>
            {muted ? 'Unmute' : 'Mute'}
          </button>
        </div>
      )}
    </div>
  )
}
