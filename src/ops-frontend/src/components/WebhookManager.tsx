import { useState, useEffect, useCallback } from 'react'

interface Webhook {
  id: string
  url: string
  trigger_event: string
  enabled: boolean
}

const TRIGGER_EVENTS = [
  'on_alert_critical',
  'on_robot_error',
  'on_robot_start',
  'on_robot_stop',
]

export default function WebhookManager() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([])
  const [loading, setLoading] = useState(true)
  const [newUrl, setNewUrl] = useState('')
  const [newTrigger, setNewTrigger] = useState(TRIGGER_EVENTS[0])
  const [newEnabled, setNewEnabled] = useState(true)
  const [testing, setTesting] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editUrl, setEditUrl] = useState('')
  const [editTrigger, setEditTrigger] = useState('')
  const [editEnabled, setEditEnabled] = useState(true)

  const fetchWebhooks = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/v1/webhooks')
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setWebhooks(Array.isArray(data) ? data : data.webhooks ?? [])
    } catch {
      setWebhooks([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchWebhooks()
  }, [fetchWebhooks])

  const handleAdd = useCallback(async () => {
    if (!newUrl.trim()) return
    try {
      const res = await fetch('/api/v1/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: newUrl.trim(), trigger_event: newTrigger, enabled: newEnabled }),
      })
      if (!res.ok) throw new Error('Failed to create')
      const created = await res.json()
      setWebhooks(prev => [...prev, created])
      setNewUrl('')
      setNewTrigger(TRIGGER_EVENTS[0])
      setNewEnabled(true)
    } catch {
      /* silently fail */
    }
  }, [newUrl, newTrigger, newEnabled])

  const handleDelete = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/v1/webhooks/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      setWebhooks(prev => prev.filter(w => w.id !== id))
    } catch {
      /* silently fail */
    }
  }, [])

  const handleToggle = useCallback(async (id: string, enabled: boolean) => {
    try {
      const res = await fetch(`/api/v1/webhooks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      if (!res.ok) throw new Error('Failed to update')
      setWebhooks(prev => prev.map(w => w.id === id ? { ...w, enabled } : w))
    } catch {
      /* silently fail */
    }
  }, [])

  const startEdit = useCallback((w: Webhook) => {
    setEditingId(w.id)
    setEditUrl(w.url)
    setEditTrigger(w.trigger_event)
    setEditEnabled(w.enabled)
  }, [])

  const cancelEdit = useCallback(() => {
    setEditingId(null)
    setEditUrl('')
    setEditTrigger('')
    setEditEnabled(true)
  }, [])

  const saveEdit = useCallback(async (id: string) => {
    if (!editUrl.trim()) return
    try {
      const res = await fetch(`/api/v1/webhooks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: editUrl.trim(), trigger_event: editTrigger, enabled: editEnabled }),
      })
      if (!res.ok) throw new Error('Failed to update')
      setWebhooks(prev => prev.map(w => w.id === id ? { ...w, url: editUrl.trim(), trigger_event: editTrigger, enabled: editEnabled } : w))
      cancelEdit()
    } catch {
      /* silently fail */
    }
  }, [editUrl, editTrigger, editEnabled, cancelEdit])

  const handleTest = useCallback(async (id: string) => {
    setTesting(id)
    try {
      const res = await fetch(`/api/v1/webhooks/${id}/test`, { method: 'POST' })
      if (!res.ok) throw new Error('Test failed')
      const result = await res.json()
      if (result.status === 'ok') {
        /* test succeeded */
      }
    } catch {
      /* silently fail */
    } finally {
      setTesting(null)
    }
  }, [])

  return (
    <div className="webhook-manager">
      <div className="panel-head-row">
        <h3>Webhooks</h3>
      </div>
      <div className="webhook-add-form">
        <input
          className="webhook-input"
          placeholder="https://example.com/webhook"
          value={newUrl}
          onChange={e => setNewUrl(e.target.value)}
        />
        <select className="webhook-select" value={newTrigger} onChange={e => setNewTrigger(e.target.value)}>
          {TRIGGER_EVENTS.map(t => (
            <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <label className="webhook-checkbox-label">
          <input type="checkbox" checked={newEnabled} onChange={e => setNewEnabled(e.target.checked)} />
          Enabled
        </label>
        <button className="btn-base" onClick={handleAdd} disabled={!newUrl.trim()}>Add</button>
      </div>
      {loading ? (
        <div className="empty-state">
          <div className="empty-state-icon">⏳</div>
          <div className="empty-state-text">Loading webhooks...</div>
        </div>
      ) : webhooks.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🔗</div>
          <div className="empty-state-text">No webhooks configured</div>
        </div>
      ) : (
        <div className="webhook-list">
          {webhooks.map(w => (
            <div key={w.id} className="webhook-item">
              {editingId === w.id ? (
                <>
                  <input
                    className="webhook-input"
                    value={editUrl}
                    onChange={e => setEditUrl(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <select className="webhook-select" value={editTrigger} onChange={e => setEditTrigger(e.target.value)}>
                    {TRIGGER_EVENTS.map(t => (
                      <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                  <label className="webhook-checkbox-label">
                    <input type="checkbox" checked={editEnabled} onChange={e => setEditEnabled(e.target.checked)} />
                    Enabled
                  </label>
                  <div className="webhook-actions">
                    <button className="btn-base" onClick={() => saveEdit(w.id)} style={{ padding: '0.15rem 0.4rem', fontSize: '0.55rem' }}>Save</button>
                    <button className="btn-base" onClick={cancelEdit} style={{ padding: '0.15rem 0.4rem', fontSize: '0.55rem', borderColor: 'var(--text2)', color: 'var(--text2)' }}>Cancel</button>
                  </div>
                </>
              ) : (
                <>
                  <span className="webhook-url" title={w.url}>{w.url}</span>
                  <span className="webhook-trigger">{w.trigger_event.replace(/_/g, ' ')}</span>
                  <button
                    className={`webhook-toggle ${w.enabled ? 'webhook-toggle--on' : ''}`}
                    onClick={() => handleToggle(w.id, !w.enabled)}
                  >
                    {w.enabled ? 'ON' : 'OFF'}
                  </button>
                  <div className="webhook-actions">
                    <button
                      className="btn-base"
                      onClick={() => startEdit(w)}
                      style={{ padding: '0.15rem 0.4rem', fontSize: '0.55rem' }}
                    >
                      Edit
                    </button>
                    <button
                      className="btn-base"
                      onClick={() => handleTest(w.id)}
                      disabled={testing === w.id}
                      style={{ padding: '0.15rem 0.4rem', fontSize: '0.55rem', borderColor: 'var(--warning)', color: 'var(--warning)' }}
                    >
                      {testing === w.id ? '…' : 'Test'}
                    </button>
                    <button
                      className="btn-base"
                      onClick={() => handleDelete(w.id)}
                      style={{ padding: '0.15rem 0.4rem', fontSize: '0.55rem', borderColor: 'var(--critical)', color: 'var(--critical)' }}
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
