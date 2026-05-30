import { useState, useEffect, useCallback } from 'react'

interface AuditEntry {
  id: string
  timestamp: string
  robot_id: string
  action: string
  user: string
  ip_address: string
  details: string
}

interface AuditResponse {
  entries: AuditEntry[]
  total: number
  page: number
  per_page: number
}

const ACTION_TYPES = [
  'all',
  'robot_start',
  'robot_stop',
  'robot_task',
  'robot_emergency_stop',
  'user_login',
  'user_logout',
  'settings_change',
  'webhook_create',
  'webhook_delete',
  'webhook_test',
  'report_download',
]

function buildQuery(params: Record<string, string | number>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== '' && v !== 'all') q.set(k, String(v))
  }
  return q.toString()
}

export default function AuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [perPage] = useState(20)
  const [robotIdFilter, setRobotIdFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    const params = {
      page,
      per_page: perPage,
      robot_id: robotIdFilter,
      action: actionFilter,
      from: dateFrom,
      to: dateTo,
    }
    try {
      const res = await fetch(`/api/v1/audit?${buildQuery(params)}`)
      if (!res.ok) throw new Error('Failed to fetch audit logs')
      const data: AuditResponse = await res.json()
      setEntries(data.entries ?? [])
      setTotal(data.total ?? 0)
    } catch {
      setEntries([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [page, perPage, robotIdFilter, actionFilter, dateFrom, dateTo])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  useEffect(() => {
    const id = setInterval(fetchLogs, 30000)
    return () => clearInterval(id)
  }, [fetchLogs])

  const handleExport = useCallback(async () => {
    setExporting(true)
    const params = {
      robot_id: robotIdFilter,
      action: actionFilter,
      from: dateFrom,
      to: dateTo,
      format: 'csv',
    }
    try {
      const res = await fetch(`/api/v1/audit/export?${buildQuery(params)}`)
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      /* silently fail */
    } finally {
      setExporting(false)
    }
  }, [robotIdFilter, actionFilter, dateFrom, dateTo])

  const totalPages = Math.max(1, Math.ceil(total / perPage))

  return (
    <div className="audit-log">
      <div className="panel-head-row">
        <h3>Audit Log</h3>
        <button className="btn-base audit-export-btn" onClick={handleExport} disabled={exporting || entries.length === 0}>
          {exporting ? '…' : 'CSV Export'}
        </button>
      </div>
      <div className="audit-filter-bar">
        <input
          className="audit-filter-input"
          placeholder="Robot ID"
          value={robotIdFilter}
          onChange={e => { setRobotIdFilter(e.target.value); setPage(1) }}
        />
        <select
          className="audit-filter-select"
          value={actionFilter}
          onChange={e => { setActionFilter(e.target.value); setPage(1) }}
        >
          {ACTION_TYPES.map(a => (
            <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <input
          type="date"
          className="audit-filter-date"
          value={dateFrom}
          onChange={e => { setDateFrom(e.target.value); setPage(1) }}
          title="From date"
        />
        <input
          type="date"
          className="audit-filter-date"
          value={dateTo}
          onChange={e => { setDateTo(e.target.value); setPage(1) }}
          title="To date"
        />
      </div>
      {loading && entries.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">⏳</div>
          <div className="empty-state-text">Loading...</div>
        </div>
      ) : entries.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <div className="empty-state-text">No audit log entries found</div>
        </div>
      ) : (
        <>
          <div className="audit-table-wrap">
            <table className="audit-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Robot</th>
                  <th>Action</th>
                  <th>User</th>
                  <th>IP</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(e => (
                  <tr key={e.id}>
                    <td className="audit-cell-time">{new Date(e.timestamp).toLocaleString()}</td>
                    <td>{e.robot_id}</td>
                    <td><span className="audit-action-badge">{e.action.replace(/_/g, ' ')}</span></td>
                    <td>{e.user}</td>
                    <td className="audit-cell-ip">{e.ip_address}</td>
                    <td className="audit-cell-details">{e.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="audit-pagination">
            <button
              className="btn-base"
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
            >
              ← Prev
            </button>
            <span className="audit-page-info">{page} / {totalPages} ({(page - 1) * perPage + 1}–{Math.min(page * perPage, total)} of {total})</span>
            <button
              className="btn-base"
              disabled={page >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            >
              Next →
            </button>
          </div>
        </>
      )}
    </div>
  )
}
