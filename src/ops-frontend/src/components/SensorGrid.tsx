import { useState, useEffect, useCallback, useRef } from 'react'

/* ── Types ────────────────────────────────────────── */

interface SensorData {
  id: string
  name: string
  category: string
  unit: string
  value: number
  status: 'normal' | 'warning' | 'critical'
  timestamp: string
  history: number[]
}

interface SensorsByCategory {
  [category: string]: SensorData[]
}

const CATEGORY_LABELS: Record<string, string> = {
  temperature: 'Temperature',
  vibration: 'Vibration',
  humidity: 'Humidity',
  power: 'Power',
}

/* ── Helper: Sparkline SVG ───────────────────────── */

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null

  const width = 80
  const height = 24
  const padding = 2
  const w = width - padding * 2
  const h = height - padding * 2

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const points = data.map((v, i) => {
    const x = padding + (i / (data.length - 1)) * w
    const y = padding + h - ((v - min) / range) * h
    return `${x},${y}`
  })

  const pathD = points.length > 1
    ? `M ${points[0]} L ${points.slice(1).join(' L ')}`
    : ''

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="sensor-sparkline"
      aria-label="Sparkline chart"
    >
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/* ── Sensor Card ─────────────────────────────────── */

const STATUS_COLORS: Record<string, string> = {
  normal: '#22c55e',
  warning: '#eab308',
  critical: '#ef4444',
}

interface SensorCardProps {
  sensor: SensorData
  onFail: (id: string) => void
  onReset: (id: string) => void
}

function SensorCard({ sensor, onFail, onReset }: SensorCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const color = STATUS_COLORS[sensor.status] ?? '#6b7280'

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className={`sensor-card sensor-card--${sensor.status}`}>
      <div className="sensor-card-header">
        <span className="sensor-name">{sensor.name}</span>
        <span
          className="sensor-status-dot"
          style={{ background: color }}
          title={sensor.status}
        />
      </div>
      <div className="sensor-value-row">
        <span className="sensor-value" style={{ color }}>
          {sensor.value.toFixed(1)}
        </span>
        <span className="sensor-unit">{sensor.unit}</span>
      </div>
      <Sparkline data={sensor.history} color={color} />
      <div className="sensor-card-actions" ref={menuRef}>
        <button
          className="sensor-action-btn"
          onClick={() => setMenuOpen((p) => !p)}
          title="Sensor actions"
        >
          ⋮
        </button>
        {menuOpen && (
          <div className="sensor-dropdown">
            <button
              className="sensor-dropdown-item sensor-dropdown-item--fail"
              onClick={() => {
                onFail(sensor.id)
                setMenuOpen(false)
              }}
            >
              Trigger Failure
            </button>
            <button
              className="sensor-dropdown-item sensor-dropdown-item--reset"
              onClick={() => {
                onReset(sensor.id)
                setMenuOpen(false)
              }}
            >
              Reset to Normal
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Sensor Grid ─────────────────────────────────── */

const SENSOR_API_BASE = '/api/v1/sensors'

export default function SensorGrid() {
  const [sensors, setSensors] = useState<SensorData[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchSensors = useCallback(async () => {
    try {
      const res = await fetch(SENSOR_API_BASE)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: SensorData[] = await res.json()
      setSensors(data)
      setError(null)
      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch sensors')
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSensors()
    const id = setInterval(fetchSensors, 2000)
    return () => clearInterval(id)
  }, [fetchSensors])

  const handleFail = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`${SENSOR_API_BASE}/${id}/fail?mode=drift`, {
          method: 'POST',
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        fetchSensors()
      } catch (err) {
        console.error('Failed to trigger failure:', err)
      }
    },
    [fetchSensors],
  )

  const handleReset = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`${SENSOR_API_BASE}/${id}/reset`, {
          method: 'POST',
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        fetchSensors()
      } catch (err) {
        console.error('Failed to reset sensor:', err)
      }
    },
    [fetchSensors],
  )

  const grouped: SensorsByCategory = {}
  for (const s of sensors) {
    const cat = s.category
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(s)
  }

  return (
    <div className="sensor-grid-widget">
      <h3>IoT Sensor Grid</h3>
      {loading && sensors.length === 0 && (
        <div className="sensor-grid-loading">Loading sensors...</div>
      )}
      {error && (
        <div className="sensor-grid-error">
          <span>{error}</span>
          <button className="btn-retry" onClick={fetchSensors}>
            Retry
          </button>
        </div>
      )}
      {!loading && !error && sensors.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-text">No sensors available</div>
        </div>
      )}
      <div className="sensor-grid-categories">
        {Object.entries(grouped).map(([category, catSensors]) => (
          <div key={category} className="sensor-category">
            <h4 className="sensor-category-title">
              {CATEGORY_LABELS[category] ?? category}
            </h4>
            <div className="sensor-category-grid">
              {catSensors.map((s) => (
                <SensorCard
                  key={s.id}
                  sensor={s}
                  onFail={handleFail}
                  onReset={handleReset}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
