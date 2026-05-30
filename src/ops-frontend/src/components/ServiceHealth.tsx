import { useState, useEffect, useCallback } from 'react'

interface ServiceStatus {
  name: string
  status: 'up' | 'down' | 'degraded'
  latency: number | null
}

const SERVICES = [
  { name: 'ops-api', url: '/health' },
  { name: 'ai-service', url: 'http://localhost:8002/health' },
  { name: 'ai-agent', url: 'http://localhost:8004/health' },
  { name: 'redis', url: '/api/v1/health/redis' },
  { name: 'postgres', url: '/api/v1/health/postgres' },
  { name: 'core-platform', url: '/api/v1/health/core' },
]

async function checkService(url: string): Promise<Pick<ServiceStatus, 'status' | 'latency'>> {
  const start = performance.now()
  try {
    const res = await fetch(url)
    const latency = Math.round(performance.now() - start)
    if (!res.ok) return { status: 'degraded', latency }
    const data = await res.json()
    const healthy = data?.status === 'ok' || data?.healthy === true
    return { status: healthy ? 'up' : 'degraded', latency }
  } catch {
    return { status: 'down', latency: null }
  }
}

export default function ServiceHealth() {
  const [services, setServices] = useState<ServiceStatus[]>(
    SERVICES.map(s => ({ name: s.name, status: 'down' as const, latency: null }))
  )
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    const results = await Promise.all(
      SERVICES.map(async (svc) => {
        const { status, latency } = await checkService(svc.url)
        return { name: svc.name, status, latency }
      })
    )
    setServices(results)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
    const id = setInterval(fetchAll, 10000)
    return () => clearInterval(id)
  }, [fetchAll])

  const downCount = services.filter(s => s.status === 'down').length
  const degradedCount = services.filter(s => s.status === 'degraded').length
  const allOk = downCount === 0 && degradedCount === 0

  const colorFor = (s: ServiceStatus['status']) =>
    s === 'up' ? 'var(--ok)' : s === 'degraded' ? 'var(--warning)' : 'var(--critical)'

  return (
    <div className="service-health">
      <div className="panel-head-row">
        <h3>Service Health</h3>
        <button
          className="btn-base"
          onClick={fetchAll}
          disabled={loading}
          style={{ fontSize: '0.55rem', padding: '0.15rem 0.4rem' }}
        >
          {loading ? '…' : '↻'}
        </button>
      </div>
      <div
        className="service-status-bar"
        style={{
          background: loading ? 'rgba(255,255,255,0.03)' : allOk ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
          color: loading ? 'var(--text2)' : allOk ? 'var(--ok)' : 'var(--critical)',
          borderBottom: `1px solid ${
            loading ? 'var(--surface2)' : allOk ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'
          }`,
        }}
      >
        {loading ? 'Checking services...' : allOk ? 'All Systems Operational' : `${downCount} Down, ${degradedCount} Degraded`}
      </div>
      <div className="service-grid">
        {services.map(s => (
          <div key={s.name} className="service-card">
            <span className="service-name">{s.name}</span>
            <div className="service-status-row">
              <span
                className="service-status"
                style={{
                  background: colorFor(s.status),
                  boxShadow: s.status === 'up' ? `0 0 6px ${colorFor(s.status)}` : 'none',
                }}
              />
              <span style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: colorFor(s.status) }}>
                {s.status}
              </span>
            </div>
            <span className="service-latency">{s.latency !== null ? `${s.latency}ms` : '---'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
