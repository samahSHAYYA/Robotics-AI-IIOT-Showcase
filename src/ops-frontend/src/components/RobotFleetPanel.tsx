import { useState, useEffect, useCallback } from 'react'

interface Robot {
  robot_id: string
  name: string
  type: string
  status: 'online' | 'offline'
  registered_at: string
  last_heartbeat: string
}

const ROBOT_TYPES = ['articulated', 'scara', 'delta', 'cartesian', 'collaborative', 'mobile']
const API_BASE = '/api/v1/robots'

export default function RobotFleetPanel() {
  const [robots, setRobots] = useState<Robot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState(ROBOT_TYPES[0])

  const fetchRobots = useCallback(async () => {
    try {
      const res = await fetch(API_BASE)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setRobots(Array.isArray(data) ? data : data.robots ?? [])
      setError(null)
      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch robots')
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRobots()
    const id = setInterval(fetchRobots, 5000)
    return () => clearInterval(id)
  }, [fetchRobots])

  const handleRemove = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      setRobots(prev => prev.filter(r => r.robot_id !== id))
    } catch {
      /* silently fail */
    }
  }, [])

  const handleRegister = useCallback(async () => {
    if (!newName.trim()) return
    try {
      const res = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), type: newType }),
      })
      if (!res.ok) throw new Error('Failed to register')
      const created = await res.json()
      setRobots(prev => [...prev, created])
      setNewName('')
      setNewType(ROBOT_TYPES[0])
      setShowForm(false)
    } catch {
      /* silently fail */
    }
  }, [newName, newType])

  return (
    <div className="robot-fleet-panel">
      <div className="panel-head-row">
        <h3>Robot Fleet (Registered)</h3>
        <button className="btn-base" onClick={() => setShowForm(p => !p)} style={{ fontSize: '0.55rem', padding: '0.15rem 0.4rem' }}>
          {showForm ? 'Cancel' : '+ Register'}
        </button>
      </div>
      {showForm && (
        <div className="robot-fleet-form">
          <input
            className="robot-fleet-input"
            placeholder="Robot name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
          />
          <select className="robot-fleet-select" value={newType} onChange={e => setNewType(e.target.value)}>
            {ROBOT_TYPES.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <button className="btn-base" onClick={handleRegister} disabled={!newName.trim()} style={{ fontSize: '0.55rem', padding: '0.15rem 0.4rem' }}>
            Add
          </button>
        </div>
      )}
      {loading && robots.length === 0 && (
        <div className="robot-fleet-loading">Loading robots...</div>
      )}
      {error && (
        <div className="robot-fleet-error">
          <span>{error}</span>
          <button className="btn-retry" onClick={fetchRobots}>Retry</button>
        </div>
      )}
      {!loading && !error && robots.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-text">No robots registered</div>
        </div>
      )}
      <div className="robot-fleet-list">
        {robots.map(r => (
          <div key={r.robot_id} className="robot-fleet-card">
            <div className="robot-fleet-card-header">
              <div className="robot-fleet-card-info">
                <span className="robot-fleet-name">{r.name}</span>
                <span className="robot-fleet-id">{r.robot_id}</span>
              </div>
              <div className="robot-fleet-status-group">
                <span className={`robot-fleet-dot ${r.status === 'online' ? 'robot-fleet-dot--online' : 'robot-fleet-dot--offline'}`} />
                <span className="robot-fleet-status">{r.status}</span>
              </div>
            </div>
            <div className="robot-fleet-card-details">
              <span className="robot-fleet-detail">Type: {r.type}</span>
              <span className="robot-fleet-detail">Registered: {new Date(r.registered_at).toLocaleString()}</span>
              <span className="robot-fleet-detail">Last heartbeat: {new Date(r.last_heartbeat).toLocaleString()}</span>
            </div>
            <button
              className="robot-fleet-remove-btn"
              onClick={() => handleRemove(r.robot_id)}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
