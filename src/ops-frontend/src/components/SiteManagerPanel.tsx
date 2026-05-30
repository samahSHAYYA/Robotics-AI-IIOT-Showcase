import { useState, useEffect, useCallback } from 'react'

interface Site {
  id: string
  name: string
  location: string
  timezone: string
  active: boolean
}

const API_BASE = '/api/v1/sites'

export default function SiteManagerPanel() {
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newLocation, setNewLocation] = useState('')
  const [newTimezone, setNewTimezone] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editLocation, setEditLocation] = useState('')
  const [editTimezone, setEditTimezone] = useState('')

  const fetchSites = useCallback(async () => {
    try {
      const res = await fetch(API_BASE)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setSites(Array.isArray(data) ? data : data.sites ?? [])
      setError(null)
      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch sites')
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSites()
    const id = setInterval(fetchSites, 10000)
    return () => clearInterval(id)
  }, [fetchSites])

  const handleCreate = useCallback(async () => {
    if (!newName.trim() || !newLocation.trim() || !newTimezone.trim()) return
    try {
      const res = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), location: newLocation.trim(), timezone: newTimezone.trim() }),
      })
      if (!res.ok) throw new Error('Failed to create')
      const created = await res.json()
      setSites(prev => [...prev, created])
      setNewName('')
      setNewLocation('')
      setNewTimezone('')
      setShowCreate(false)
    } catch {
      /* silently fail */
    }
  }, [newName, newLocation, newTimezone])

  const handleDelete = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      setSites(prev => prev.filter(s => s.id !== id))
    } catch {
      /* silently fail */
    }
  }, [])

  const handleSwitch = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/${id}/switch`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to switch')
      const data: { active_site_id: string } = await res.json()
      setSites(prev => prev.map(s => ({ ...s, active: s.id === (data.active_site_id ?? id) })))
    } catch {
      /* silently fail */
    }
  }, [])

  const startEdit = useCallback((s: Site) => {
    setEditingId(s.id)
    setEditName(s.name)
    setEditLocation(s.location)
    setEditTimezone(s.timezone)
  }, [])

  const cancelEdit = useCallback(() => {
    setEditingId(null)
    setEditName('')
    setEditLocation('')
    setEditTimezone('')
  }, [])

  const saveEdit = useCallback(async (id: string) => {
    if (!editName.trim() || !editLocation.trim() || !editTimezone.trim()) return
    try {
      const res = await fetch(`${API_BASE}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), location: editLocation.trim(), timezone: editTimezone.trim() }),
      })
      if (!res.ok) throw new Error('Failed to update')
      setSites(prev => prev.map(s => s.id === id ? { ...s, name: editName.trim(), location: editLocation.trim(), timezone: editTimezone.trim() } : s))
      cancelEdit()
    } catch {
      /* silently fail */
    }
  }, [editName, editLocation, editTimezone, cancelEdit])

  return (
    <div className="site-manager-panel">
      <div className="panel-head-row">
        <h3>Multi-Factory Sites</h3>
        <button className="btn-base" onClick={() => setShowCreate(p => !p)} style={{ fontSize: '0.55rem', padding: '0.15rem 0.4rem' }}>
          {showCreate ? 'Cancel' : '+ Create'}
        </button>
      </div>
      {showCreate && (
        <div className="site-manager-form">
          <input className="site-manager-input" placeholder="Name" value={newName} onChange={e => setNewName(e.target.value)} />
          <input className="site-manager-input" placeholder="Location" value={newLocation} onChange={e => setNewLocation(e.target.value)} />
          <input className="site-manager-input" placeholder="Timezone (e.g. UTC, America/New_York)" value={newTimezone} onChange={e => setNewTimezone(e.target.value)} />
          <button className="btn-base" onClick={handleCreate} disabled={!newName.trim() || !newLocation.trim() || !newTimezone.trim()} style={{ fontSize: '0.55rem', padding: '0.15rem 0.4rem' }}>
            Create
          </button>
        </div>
      )}
      {loading && sites.length === 0 && (
        <div className="site-manager-loading">Loading sites...</div>
      )}
      {error && (
        <div className="site-manager-error">
          <span>{error}</span>
          <button className="btn-retry" onClick={fetchSites}>Retry</button>
        </div>
      )}
      {!loading && !error && sites.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-text">No sites configured</div>
        </div>
      )}
      <div className="site-manager-list">
        {sites.map(s => (
          <div key={s.id} className={`site-manager-card ${s.active ? 'site-manager-card--active' : ''}`}>
            {editingId === s.id ? (
              <>
                <div className="site-manager-edit-fields">
                  <input className="site-manager-input" value={editName} onChange={e => setEditName(e.target.value)} placeholder="Name" />
                  <input className="site-manager-input" value={editLocation} onChange={e => setEditLocation(e.target.value)} placeholder="Location" />
                  <input className="site-manager-input" value={editTimezone} onChange={e => setEditTimezone(e.target.value)} placeholder="Timezone" />
                </div>
                <div className="site-manager-card-actions">
                  <button className="btn-base" onClick={() => saveEdit(s.id)} style={{ padding: '0.15rem 0.4rem', fontSize: '0.55rem' }}>Save</button>
                  <button className="btn-base" onClick={cancelEdit} style={{ padding: '0.15rem 0.4rem', fontSize: '0.55rem', borderColor: 'var(--text2)', color: 'var(--text2)' }}>Cancel</button>
                </div>
              </>
            ) : (
              <>
                <div className="site-manager-card-header">
                  <div className="site-manager-card-info">
                    <span className="site-manager-name">{s.name}</span>
                    {s.active && <span className="site-manager-active-badge">Active</span>}
                  </div>
                  <div className="site-manager-card-actions">
                    <button className="btn-base" onClick={() => startEdit(s)} style={{ padding: '0.15rem 0.4rem', fontSize: '0.55rem' }}>Edit</button>
                    <button className="btn-base" onClick={() => handleDelete(s.id)} style={{ padding: '0.15rem 0.4rem', fontSize: '0.55rem', borderColor: 'var(--critical)', color: 'var(--critical)' }}>Delete</button>
                    {!s.active && (
                      <button className="btn-base" onClick={() => handleSwitch(s.id)} style={{ padding: '0.15rem 0.4rem', fontSize: '0.55rem', borderColor: 'var(--ok)', color: 'var(--ok)' }}>Switch</button>
                    )}
                  </div>
                </div>
                <div className="site-manager-card-details">
                  <span className="site-manager-detail">{s.location}</span>
                  <span className="site-manager-detail">{s.timezone}</span>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
