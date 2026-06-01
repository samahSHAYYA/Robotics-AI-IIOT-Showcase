import { useState, useMemo } from 'react'
import useAnnotations from '../hooks/useAnnotations'
import type { AnnotationFilter } from '../types/annotations'

const FILTERS: Array<{ key: AnnotationFilter; label: string; icon: string }> = [
  { key: 'all', label: 'All', icon: '📋' },
  { key: 'note', label: 'Notes', icon: '📝' },
  { key: 'alert-pin', label: 'Alerts', icon: '🔔' },
  { key: 'measurement-line', label: 'Meas.', icon: '📏' },
  { key: 'area-highlight', label: 'Highlights', icon: '🟦' },
]

const TYPE_ICONS: Record<string, string> = {
  'note': '📝',
  'alert-pin': '🔔',
  'measurement-line': '📏',
  'area-highlight': '🟦',
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

export default function AnnotationPanel() {
  const { annotations, deleteAnnotation, filter, setFilter, clearAll } = useAnnotations()
  const [confirmClear, setConfirmClear] = useState(false)

  const filtered = useMemo(() => {
    if (filter === 'all') return annotations
    return annotations.filter((a) => a.type === filter)
  }, [annotations, filter])

  const handleFocus = (id: string) => {
    window.dispatchEvent(new CustomEvent('focus-annotation', { detail: { id } }))
  }

  const handleClear = () => {
    if (!confirmClear) {
      setConfirmClear(true)
      return
    }
    clearAll()
    setConfirmClear(false)
  }

  const countByType = useMemo(() => {
    const counts: Record<string, number> = { all: annotations.length }
    for (const a of annotations) {
      counts[a.type] = (counts[a.type] ?? 0) + 1
    }
    return counts
  }, [annotations])

  return (
    <div className="annotation-panel">
      <h3>Annotations</h3>
      <div className="annotation-filters">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`annotation-filter-btn${filter === f.key ? ' active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.icon} {f.label}
            {countByType[f.key] !== undefined && (
              <span className="annotation-count">{countByType[f.key]}</span>
            )}
          </button>
        ))}
      </div>

      <div className="annotation-list">
        {filtered.length === 0 && (
          <div className="empty-state-text" style={{ padding: '0.5rem', textAlign: 'center', fontSize: '0.7rem' }}>
            No annotations
          </div>
        )}
        {filtered.map((a) => (
          <div
            key={a.id}
            className="annotation-item"
            onClick={() => handleFocus(a.id)}
          >
            <div className="annotation-icon">{TYPE_ICONS[a.type] ?? '📌'}</div>
            <div className="annotation-content">
              <div className="annotation-text">{a.content}</div>
              <div className="annotation-meta">
                {a.author} · {formatTime(a.createdAt)}
              </div>
            </div>
            <button
              className="annotation-delete"
              onClick={(e) => {
                e.stopPropagation()
                deleteAnnotation(a.id)
              }}
              title="Delete annotation"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {annotations.length > 0 && (
        <button
          className={`annotation-clear${confirmClear ? ' annotation-clear--confirm' : ''}`}
          onClick={handleClear}
          onBlur={() => setConfirmClear(false)}
        >
          {confirmClear ? 'Confirm Clear All?' : 'Clear All'}
        </button>
      )}
    </div>
  )
}
