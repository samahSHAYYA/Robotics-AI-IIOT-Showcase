import { useState, useEffect, useCallback } from 'react'

interface ReconcileState {
  version: number
  timestamp: string
  robots: number
  alerts: number
  sensors: number
}

interface DiffResult {
  added: number
  removed: number
  changed: number
  conflicts: number
}

interface Conflict {
  id: string
  local: unknown
  remote: unknown
}

const API_BASE = '/api/v1/reconcile'

export default function ReconcilePanel() {
  const [state, setState] = useState<ReconcileState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null)
  const [conflicts, setConflicts] = useState<Conflict[]>([])
  const [strategy, setStrategy] = useState<'local' | 'remote' | 'merge'>('merge')
  const [computing, setComputing] = useState(false)
  const [resolving, setResolving] = useState(false)

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/state`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setState(data)
      setError(null)
      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch state')
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchState()
  }, [fetchState])

  const handleComputeDiff = useCallback(async () => {
    setComputing(true)
    setDiffResult(null)
    setConflicts([])
    try {
      const frontendState = state ?? { version: 0, timestamp: new Date().toISOString(), robots: 0, alerts: 0, sensors: 0 }
      const res = await fetch(`${API_BASE}/diff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frontendState }),
      })
      if (!res.ok) throw new Error('Diff failed')
      const data = await res.json()
      setDiffResult({ added: data.added ?? 0, removed: data.removed ?? 0, changed: data.changed ?? 0, conflicts: data.conflicts ?? 0 })
      setConflicts(data.conflictDetails ?? [])
    } catch {
      setDiffResult(null)
    } finally {
      setComputing(false)
    }
  }, [state])

  const handleResolve = useCallback(async () => {
    if (conflicts.length === 0) return
    setResolving(true)
    try {
      const res = await fetch(`${API_BASE}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy, conflictIds: conflicts.map(c => c.id) }),
      })
      if (!res.ok) throw new Error('Resolve failed')
      setConflicts([])
      setDiffResult(null)
      fetchState()
    } catch {
      /* silently fail */
    } finally {
      setResolving(false)
    }
  }, [strategy, conflicts, fetchState])

  return (
    <div className="reconcile-panel">
      <div className="panel-head-row">
        <h3>State Reconciliation</h3>
        <button
          className="btn-base"
          onClick={handleComputeDiff}
          disabled={computing}
          style={{ fontSize: '0.55rem', padding: '0.15rem 0.4rem' }}
        >
          {computing ? '…' : 'Compute Diff'}
        </button>
      </div>
      {loading && (
        <div className="reconcile-loading">Loading state...</div>
      )}
      {error && (
        <div className="reconcile-error">
          <span>{error}</span>
          <button className="btn-retry" onClick={fetchState}>Retry</button>
        </div>
      )}
      {!loading && !error && !state && (
        <div className="empty-state">
          <div className="empty-state-text">No state available</div>
        </div>
      )}
      {state && (
        <div className="reconcile-state">
          <div className="reconcile-state-row">
            <span className="reconcile-state-label">Version</span>
            <span className="reconcile-state-value">{state.version}</span>
          </div>
          <div className="reconcile-state-row">
            <span className="reconcile-state-label">Timestamp</span>
            <span className="reconcile-state-value">{new Date(state.timestamp).toLocaleString()}</span>
          </div>
          <div className="reconcile-state-row">
            <span className="reconcile-state-label">Robots</span>
            <span className="reconcile-state-value">{state.robots}</span>
          </div>
          <div className="reconcile-state-row">
            <span className="reconcile-state-label">Alerts</span>
            <span className="reconcile-state-value">{state.alerts}</span>
          </div>
          <div className="reconcile-state-row">
            <span className="reconcile-state-label">Sensors</span>
            <span className="reconcile-state-value">{state.sensors}</span>
          </div>
        </div>
      )}
      {diffResult && (
        <div className="reconcile-diff">
          <div className="reconcile-diff-grid">
            <div className="reconcile-diff-item reconcile-diff-item--add">
              <span className="reconcile-diff-count">{diffResult.added}</span>
              <span className="reconcile-diff-label">Added</span>
            </div>
            <div className="reconcile-diff-item reconcile-diff-item--remove">
              <span className="reconcile-diff-count">{diffResult.removed}</span>
              <span className="reconcile-diff-label">Removed</span>
            </div>
            <div className="reconcile-diff-item reconcile-diff-item--change">
              <span className="reconcile-diff-count">{diffResult.changed}</span>
              <span className="reconcile-diff-label">Changed</span>
            </div>
            <div className="reconcile-diff-item reconcile-diff-item--conflict">
              <span className="reconcile-diff-count">{diffResult.conflicts}</span>
              <span className="reconcile-diff-label">Conflicts</span>
            </div>
          </div>
          {conflicts.length > 0 && (
            <div className="reconcile-resolve-row">
              <select className="reconcile-select" value={strategy} onChange={e => setStrategy(e.target.value as 'local' | 'remote' | 'merge')}>
                <option value="local">Use Local</option>
                <option value="remote">Use Remote</option>
                <option value="merge">Merge</option>
              </select>
              <button
                className="btn-base"
                onClick={handleResolve}
                disabled={resolving}
                style={{ fontSize: '0.55rem', padding: '0.15rem 0.4rem' }}
              >
                {resolving ? '…' : 'Resolve'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
