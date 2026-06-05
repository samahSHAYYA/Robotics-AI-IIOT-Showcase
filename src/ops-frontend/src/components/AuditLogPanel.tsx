import { useState, useEffect, useCallback } from 'react'
import { useI18n } from '../contexts/I18nContext'
import { authFetchJson } from '../utils/auth-fetch'
import type { AuditLogEntry, AuditLogResponse } from '../types/audit'

/**
 * Predefined action options for the filter dropdown.
 * These cover the common actions logged by the backend.
 */
const ACTION_OPTIONS = [
  'start',
  'stop',
  'emergency_stop',
  'assign_task',
  'login',
  'logout',
  'create',
  'update',
  'delete',
  'settings_change',
  'webhook_create',
  'webhook_delete',
  'webhook_test',
  'report_download',
]

/** Number of rows per page. */
const PAGE_SIZE = 20

/** Auto-refresh interval in milliseconds. */
const AUTO_REFRESH_MS = 30000

export default function AuditLogPanel() {
  const { t } = useI18n()

  // ── Data state ──────────────────────────────────────────────
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)

  // ── Filter state ────────────────────────────────────────────
  const [actionFilter, setActionFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  // Applied filters (only change when user clicks Apply)
  const [appliedFilters, setAppliedFilters] = useState({
    action: '',
    from: '',
    to: '',
  })

  // ── Expandable detail rows ──────────────────────────────────
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // ── Data fetching ───────────────────────────────────────────
  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('per_page', String(PAGE_SIZE))
      if (appliedFilters.action) params.set('action', appliedFilters.action)
      if (appliedFilters.from) params.set('from_date', appliedFilters.from)
      if (appliedFilters.to) params.set('to_date', appliedFilters.to)

      const data = (await authFetchJson(
        `/api/v1/audit?${params.toString()}`,
      )) as AuditLogResponse
      setEntries(data.entries ?? [])
      setTotal(data.total ?? 0)
    } catch {
      setEntries([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [page, appliedFilters])

  // Fetch on mount and when page or filters change
  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  // Auto-refresh interval
  useEffect(() => {
    const id = setInterval(fetchLogs, AUTO_REFRESH_MS)
    return () => clearInterval(id)
  }, [fetchLogs])

  // ── Event handlers ──────────────────────────────────────────
  const handleApplyFilters = () => {
    setPage(1)
    setAppliedFilters({ action: actionFilter, from: fromDate, to: toDate })
    setExpandedRows(new Set())
  }

  const handleRefresh = () => {
    fetchLogs()
  }

  const toggleExpand = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ── Helpers ─────────────────────────────────────────────────
  const formatTime = (ts: string): string => {
    try {
      return new Date(ts).toLocaleString()
    } catch {
      return ts
    }
  }

  const parseDetails = (details: string): Record<string, unknown> | string => {
    if (!details) return details
    try {
      return JSON.parse(details) as Record<string, unknown>
    } catch {
      return details
    }
  }

  const renderPageNumbers = () => {
    const pages: React.ReactNode[] = []
    const maxVisible = 5
    let start = Math.max(1, page - Math.floor(maxVisible / 2))
    let end = Math.min(totalPages, start + maxVisible - 1)
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1)
    }
    for (let i = start; i <= end; i++) {
      pages.push(
        <button
          key={i}
          className={`btn-base${i === page ? ' audit-page-active' : ''}`}
          onClick={() => setPage(i)}
          disabled={i === page}
        >
          {i}
        </button>,
      )
    }
    return pages
  }

  // ── Render ──────────────────────────────────────────────────
  return (
    <div className="audit-panel">
      {/* Header row */}
      <div className="panel-head-row">
        <h3>{t('audit.title')}</h3>
        <button
          className="btn-base"
          onClick={handleRefresh}
          disabled={loading}
        >
          {t('audit.refresh')}
        </button>
      </div>

      {/* Filter bar */}
      <div className="audit-filters">
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          aria-label={t('audit.filter.action')}
        >
          <option value="">{t('audit.filter.action')}</option>
          {ACTION_OPTIONS.map((a) => (
            <option key={a} value={a}>
              {a.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          title={t('audit.filter.from')}
          aria-label={t('audit.filter.from')}
        />
        <input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          title={t('audit.filter.to')}
          aria-label={t('audit.filter.to')}
        />
        <button className="btn-base" onClick={handleApplyFilters}>
          {t('audit.filter.apply')}
        </button>
      </div>

      {/* Content area */}
      {loading && entries.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">⏳</div>
          <div className="empty-state-text">{t('audit.loading')}</div>
        </div>
      ) : entries.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <div className="empty-state-text">{t('audit.empty')}</div>
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="audit-table-wrap">
            <table className="audit-table">
              <thead>
                <tr>
                  <th>{t('audit.table.time')}</th>
                  <th>{t('audit.table.user')}</th>
                  <th>{t('audit.table.action')}</th>
                  <th>{t('audit.table.resource')}</th>
                  <th>{t('audit.table.details')}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const parsed = parseDetails(entry.details)
                  const isExpanded = expandedRows.has(entry.id)
                  const hasDetails =
                    entry.details !== null &&
                    entry.details !== undefined &&
                    entry.details !== ''
                  return (
                    <tr key={entry.id}>
                      <td className="audit-cell-time">
                        {formatTime(entry.timestamp)}
                      </td>
                      <td>{entry.user_role}</td>
                      <td>
                        <span className="audit-action-badge">
                          {entry.action.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td>{entry.robot_id}</td>
                      <td className="audit-cell-details">
                        {hasDetails ? (
                          <>
                            <span
                              className="audit-details-toggle"
                              onClick={() => toggleExpand(entry.id)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  toggleExpand(entry.id)
                                }
                              }}
                            >
                              {isExpanded
                                ? t('audit.hideDetails')
                                : t('audit.showDetails')}
                            </span>
                            {isExpanded && (
                              <div className="audit-details-json">
                                {typeof parsed === 'string'
                                  ? parsed
                                  : JSON.stringify(parsed, null, 2)}
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="audit-details-empty">&mdash;</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="audit-pagination">
            <button
              className="btn-base"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {t('audit.pagination.prev')}
            </button>
            {renderPageNumbers()}
            <button
              className="btn-base"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              {t('audit.pagination.next')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
