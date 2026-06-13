import { useState, useCallback } from 'react'
import { useI18n } from '../contexts/I18nContext'
import { useIntegrations } from '../hooks/useIntegrations'
import { authFetch } from '../utils/auth-fetch'
import type { Integration, SyncLogEntry } from '../types/integration'

type PanelView = 'list' | 'form' | 'log'

interface FormState {
  name: string
  adapter_type: string
  base_url: string
  auth_type: string
  auth_config: Record<string, string>
  sync_interval_minutes: number
  enabled: boolean
}

const EMPTY_FORM: FormState = {
  name: '',
  adapter_type: 'rest',
  base_url: '',
  auth_type: 'api_key',
  auth_config: {},
  sync_interval_minutes: 60,
  enabled: true,
}

export default function IntegrationsPanel() {
  const { t } = useI18n()
  const {
    integrations, adapters, loading, error,
    refetch, createIntegration, updateIntegration, deleteIntegration,
    testConnection, fetchSyncLog,
  } = useIntegrations()

  const [activeView, setActiveView] = useState<PanelView>('list')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingIntegration, setEditingIntegration] = useState<Integration | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)

  // Sync log state
  const [logIntegration, setLogIntegration] = useState<Integration | null>(null)
  const [logEntries, setLogEntries] = useState<SyncLogEntry[]>([])
  const [logLoading, setLogLoading] = useState(false)

  // Form helper: which auth fields to show
  const authFields = (() => {
    switch (form.auth_type) {
      case 'api_key': return ['apiKey', 'apiKeyHeader'] as const
      case 'basic': return ['username', 'password'] as const
      case 'oauth2': return ['tokenUrl', 'clientId', 'clientSecret'] as const
      default: return [] as readonly string[]
    }
  })()

  const resetForm = useCallback(() => {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setEditingIntegration(null)
    setTestResult(null)
  }, [])

  const openCreate = useCallback(() => {
    resetForm()
    setActiveView('form')
  }, [resetForm])

  const openEdit = useCallback((integration: Integration) => {
    setForm({
      name: integration.name,
      adapter_type: integration.adapter_type,
      base_url: integration.base_url,
      auth_type: integration.auth_type,
      auth_config: {},
      sync_interval_minutes: integration.sync_interval_minutes,
      enabled: integration.enabled,
    })
    setEditingId(integration.id)
    setEditingIntegration(integration)
    setTestResult(null)
    setActiveView('form')
  }, [])

  const cancelForm = useCallback(() => {
    resetForm()
    setActiveView('list')
  }, [resetForm])

  const handleSave = useCallback(async () => {
    if (!form.name.trim() || !form.base_url.trim()) return
    setSaving(true)
    setTestResult(null)
    try {
      const payload = {
        name: form.name.trim(),
        adapter_type: form.adapter_type,
        base_url: form.base_url.trim(),
        auth_type: form.auth_type,
        auth_config: form.auth_type !== 'none' ? form.auth_config : undefined,
        sync_interval_minutes: form.sync_interval_minutes,
        enabled: form.enabled,
      }

      if (editingId !== null) {
        await updateIntegration(editingId, payload)
      } else {
        await createIntegration(payload)
      }

      // Test connection after save
      if (editingId !== null) {
        setTesting(true)
        try {
          const result = await testConnection(editingId)
          setTestResult(result)
        } catch {
          setTestResult({ success: false, message: 'Connection test failed' })
        } finally {
          setTesting(false)
        }
      }

      await refetch()
      resetForm()
      setActiveView('list')
    } catch {
      setTestResult({ success: false, message: 'Save failed' })
    } finally {
      setSaving(false)
    }
  }, [form, editingId, createIntegration, updateIntegration, testConnection, refetch, resetForm])

  const handleTest = useCallback(async (id: number) => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await testConnection(id)
      setTestResult(result)
    } catch {
      setTestResult({ success: false, message: 'Connection test failed' })
    } finally {
      setTesting(false)
    }
  }, [testConnection])

  const handleDelete = useCallback(async (id: number) => {
    try {
      await deleteIntegration(id)
      await refetch()
      setDeleteConfirm(null)
    } catch {
      // silently fail
    }
  }, [deleteIntegration, refetch])

  const openSyncLog = useCallback(async (integration: Integration) => {
    setLogIntegration(integration)
    setLogLoading(true)
    try {
      const result = await fetchSyncLog(integration.id)
      setLogEntries(Array.isArray(result) ? result : result.entries ?? [])
    } catch {
      setLogEntries([])
    } finally {
      setLogLoading(false)
    }
  }, [fetchSyncLog])

  const closeSyncLog = useCallback(() => {
    setLogIntegration(null)
    setLogEntries([])
  }, [])

  // Status helpers
  const getStatusInfo = (integration: Integration) => {
    if (!integration.enabled) {
      return { label: t('integration.status.disabled'), className: 'integration-card--disabled', icon: '\u25CB' }
    }
    if (integration.last_sync_status === 'error') {
      return { label: t('integration.status.error'), className: 'integration-card--error', icon: '\u2717' }
    }
    if (integration.last_sync_status === 'success') {
      return { label: t('integration.status.connected'), className: 'integration-card--success', icon: '\u25CF' }
    }
    return { label: t('integration.status.never'), className: 'integration-card--disabled', icon: '\u25CB' }
  }

  const formatLastSync = (integration: Integration) => {
    if (!integration.last_sync_at) return t('integration.status.never')
    const d = new Date(integration.last_sync_at)
    const now = Date.now()
    const diffMin = Math.floor((now - d.getTime()) / 60000)
    if (diffMin < 1) return t('integration.justNow')
    if (diffMin < 60) return t('integration.minutesAgo').replace('{count}', String(diffMin))
    const diffHr = Math.floor(diffMin / 60)
    if (diffHr < 24) return t('integration.hoursAgo').replace('{count}', String(diffHr))
    return d.toLocaleDateString()
  }

  const getAuthFieldLabel = (field: string) => {
    const map: Record<string, string> = {
      apiKey: t('integration.apiKey'),
      apiKeyHeader: t('integration.apiKeyHeader'),
      username: t('integration.username'),
      password: t('integration.password'),
      tokenUrl: t('integration.tokenUrl'),
      clientId: t('integration.clientId'),
      clientSecret: t('integration.clientSecret'),
    }
    return map[field] ?? field
  }

  // ===== Render: Loading =====
  if (loading && integrations.length === 0) {
    return (
      <div className="integrations-panel">
        <div className="panel-head-row">
          <h3>{t('integration.title')}</h3>
        </div>
        <div className="integrations-loading">{t('integration.loading')}</div>
      </div>
    )
  }

  // ===== Render: Error =====
  if (error && integrations.length === 0) {
    return (
      <div className="integrations-panel">
        <div className="panel-head-row">
          <h3>{t('integration.title')}</h3>
        </div>
        <div className="integrations-error">
          <span>{error}</span>
          <button className="btn-retry" onClick={refetch}>{t('integration.retry')}</button>
        </div>
      </div>
    )
  }

  // ===== Render: Sync Log =====
  if (activeView === 'log' && logIntegration) {
    return (
      <div className="integrations-panel">
        <div className="panel-head-row">
          <h3>{t('integration.syncLog')}: {logIntegration.name}</h3>
          <button className="btn-base" onClick={closeSyncLog} style={{ padding: '0.15rem 0.4rem', fontSize: '0.55rem', borderColor: 'var(--text2)', color: 'var(--text2)' }}>
            {t('integration.close')}
          </button>
        </div>
        {logLoading ? (
          <div className="integrations-loading">{t('integration.loading')}</div>
        ) : logEntries.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-text">{t('integration.noSyncHistory')}</div>
          </div>
        ) : (
          <div className="integration-log-table">
            <div className="integration-log-header">
              <span className="integration-log-col integration-log-col--time">{t('integration.log.time')}</span>
              <span className="integration-log-col integration-log-col--status">{t('integration.log.status')}</span>
              <span className="integration-log-col integration-log-col--records">{t('integration.log.records')}</span>
              <span className="integration-log-col integration-log-col--error">{t('integration.log.error')}</span>
            </div>
            {logEntries.map(entry => (
              <div key={entry.id} className={'integration-log-row' + (entry.status === 'error' ? ' integration-log-row--error' : '')}>
                <span className="integration-log-col integration-log-col--time">
                  {new Date(entry.started_at).toLocaleTimeString()}
                </span>
                <span className="integration-log-col integration-log-col--status">
                  {entry.status === 'success' ? '\u2713' : '\u2717'}
                </span>
                <span className="integration-log-col integration-log-col--records">
                  {entry.records_synced}
                </span>
                <span className="integration-log-col integration-log-col--error">
                  {entry.error_message || '\u2014'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ===== Render: Create/Edit Form =====
  if (activeView === 'form') {
    return (
      <div className="integrations-panel">
        <div className="panel-head-row">
          <h3>{editingId !== null ? t('integration.edit') : t('integration.add')}</h3>
        </div>
        <div className="integration-form">
          <div className="integration-form__row">
            <label>{t('integration.name')}</label>
            <input
              value={form.name}
              onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder={t('integration.name')}
            />
          </div>
          <div className="integration-form__row">
            <label>{t('integration.adapterType')}</label>
            <select
              value={form.adapter_type}
              onChange={e => setForm(prev => ({ ...prev, adapter_type: e.target.value }))}
            >
              {adapters.length === 0 ? (
                <>
                  <option value="rest">REST</option>
                  <option value="opcua">OPC-UA</option>
                  <option value="mqtt">MQTT</option>
                  <option value="soap">SOAP</option>
                  <option value="sap_odata">SAP OData</option>
                </>
              ) : (
                adapters.map(a => (
                  <option key={a.name} value={a.name}>{a.description || a.name}</option>
                ))
              )}
            </select>
          </div>
          <div className="integration-form__row">
            <label>{t('integration.baseUrl')}</label>
            <input
              value={form.base_url}
              onChange={e => setForm(prev => ({ ...prev, base_url: e.target.value }))}
              placeholder="https://example.com/api"
            />
          </div>
          <div className="integration-form__row">
            <label>{t('integration.authType')}</label>
            <select
              value={form.auth_type}
              onChange={e => setForm(prev => ({ ...prev, auth_type: e.target.value }))}
            >
              <option value="api_key">API Key</option>
              <option value="basic">Basic Auth</option>
              <option value="oauth2">OAuth2</option>
              <option value="none">None</option>
            </select>
          </div>

          {/* Dynamic auth fields */}
          {authFields.map(field => (
            <div key={field} className="integration-form__row">
              <label>{getAuthFieldLabel(field)}</label>
              <input
                type={field === 'password' || field === 'clientSecret' ? 'password' : 'text'}
                value={form.auth_config[field] ?? ''}
                onChange={e => setForm(prev => ({
                  ...prev,
                  auth_config: { ...prev.auth_config, [field]: e.target.value },
                }))}
              />
            </div>
          ))}

          {/* Key rotation info — shown only when editing an existing integration */}
          {editingId !== null && editingIntegration && (
            <>
              <div className="integration-form__row">
                <span className="integration-form__key-info">
                  {t('integration.keyRotated')}: {editingIntegration.key_rotated_at ? new Date(editingIntegration.key_rotated_at).toLocaleDateString() : t('integration.neverRotated')}
                </span>
              </div>
              <div className="integration-form__row">
                <button
                  className="btn-base"
                  type="button"
                  style={{ borderColor: 'var(--warning)', color: 'var(--warning)', fontSize: '0.55rem', padding: '0.15rem 0.4rem' }}
                  onClick={async () => {
                    // Call the rotate-key endpoint
                    try {
                      const response = await authFetch(`/api/v1/integrations/${editingId}/rotate-key`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                      })
                      if (response.ok) {
                        const updated = await response.json()
                        setEditingIntegration(prev => prev ? { ...prev, key_rotated_at: updated.key_rotated_at } : null)
                        await refetch()
                      }
                    } catch {
                      // silently fail
                    }
                  }}
                >
                  {t('integration.rotateKey')}
                </button>
              </div>
            </>
          )}

          <div className="integration-form__row">
            <label>{t('integration.syncInterval')}</label>
            <input
              type="number"
              min={1}
              value={form.sync_interval_minutes}
              onChange={e => setForm(prev => ({ ...prev, sync_interval_minutes: parseInt(e.target.value) || 60 }))}
            />
          </div>
          <div className="integration-form__row">
            <label className="integration-form__checkbox-label">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={e => setForm(prev => ({ ...prev, enabled: e.target.checked }))}
              />
              {t('integration.enabled')}
            </label>
          </div>

          {testResult && (
            <div className={'integration-test-result ' + (testResult.success ? 'integration-test-result--ok' : 'integration-test-result--fail')}>
              {testResult.message}
            </div>
          )}

          <div className="integration-form__actions">
            <button
              className="btn-base"
              onClick={cancelForm}
              style={{ borderColor: 'var(--text2)', color: 'var(--text2)' }}
            >
              {t('integration.cancel')}
            </button>
            <button
              className="btn-base"
              onClick={handleSave}
              disabled={saving || !form.name.trim() || !form.base_url.trim()}
            >
              {saving ? (testing ? t('integration.testing') : t('integration.saving')) : editingId !== null ? t('integration.save') : t('integration.add')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ===== Render: List View (default) =====
  return (
    <div className="integrations-panel">
      <div className="panel-head-row">
        <h3>{t('integration.title')}</h3>
        <button className="btn-base" onClick={openCreate} style={{ fontSize: '0.55rem', padding: '0.15rem 0.4rem' }}>
          {t('integration.addButton')}
        </button>
      </div>

      {testResult && (
        <div className={'integration-test-result ' + (testResult.success ? 'integration-test-result--ok' : 'integration-test-result--fail')}>
          {testResult.message}
          <button className="integration-test-result__close" onClick={() => setTestResult(null)}>x</button>
        </div>
      )}

      {integrations.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">{'\uD83D\uDD0C'}</div>
          <div className="empty-state-text">{t('integration.noIntegrations')}</div>
        </div>
      ) : (
        <div className="integration-list">
          {integrations.map(integration => {
            const status = getStatusInfo(integration)
            return (
              <div key={integration.id} className={'integration-card ' + status.className}>
                <div className="integration-card__header">
                  <div className="integration-card__info">
                    <span className="integration-card__name">{integration.name}</span>
                    <span className={'integration-card__badge integration-card__badge--' + integration.adapter_type}>
                      {integration.adapter_type}
                    </span>
                  </div>
                  <div className="integration-card__actions">
                    <button
                      className="btn-base"
                      onClick={() => openEdit(integration)}
                      style={{ padding: '0.15rem 0.4rem', fontSize: '0.55rem' }}
                      title={t('integration.edit')}
                    >
                      {t('integration.edit')}
                    </button>
                    <button
                      className="btn-base"
                      onClick={() => handleTest(integration.id)}
                      disabled={testing}
                      style={{ padding: '0.15rem 0.4rem', fontSize: '0.55rem', borderColor: 'var(--warning)', color: 'var(--warning)' }}
                      title={t('integration.test')}
                    >
                      {testing ? t('integration.testing') : t('integration.test')}
                    </button>
                    <button
                      className="btn-base"
                      onClick={() => openSyncLog(integration)}
                      style={{ padding: '0.15rem 0.4rem', fontSize: '0.55rem', borderColor: 'var(--accent)', color: 'var(--accent)' }}
                      title={t('integration.syncLog')}
                    >
                      {t('integration.logShort')}
                    </button>
                    {deleteConfirm === integration.id ? (
                      <>
                        <button
                          className="btn-base"
                          onClick={() => handleDelete(integration.id)}
                          style={{ padding: '0.15rem 0.4rem', fontSize: '0.55rem', borderColor: 'var(--critical)', color: 'var(--critical)' }}
                        >
                          {t('integration.confirm')}
                        </button>
                        <button
                          className="btn-base"
                          onClick={() => setDeleteConfirm(null)}
                          style={{ padding: '0.15rem 0.4rem', fontSize: '0.55rem', borderColor: 'var(--text2)', color: 'var(--text2)' }}
                        >
                          {t('integration.cancel')}
                        </button>
                      </>
                    ) : (
                      <button
                        className="btn-base"
                        onClick={() => setDeleteConfirm(integration.id)}
                        style={{ padding: '0.15rem 0.4rem', fontSize: '0.55rem', borderColor: 'var(--critical)', color: 'var(--critical)' }}
                        title={t('integration.delete')}
                      >
                        {t('integration.del')}
                      </button>
                    )}
                  </div>
                </div>
                <div className="integration-card__details">
                  <span className="integration-card__status">
                    <span className={'integration-status-dot integration-status-dot--' + integration.last_sync_status} />
                    {status.label}
                  </span>
                  <span className="integration-card__meta">
                    {t('integration.lastSync')}: {formatLastSync(integration)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
