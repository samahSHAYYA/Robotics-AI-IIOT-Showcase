import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useI18n } from '../contexts/I18nContext'
import { authFetch } from '../utils/auth-fetch'
import type { Tenant, Factory, UserInfo, Role } from '../types/auth'

interface EditableTenant {
  name: string
  slug: string
}

interface EditableFactory {
  name: string
  location: string
  timezone: string
}

interface EditableUser {
  username: string
  password: string
  role: Role
  tenant_id: number | null
  factory_id: number | null
}

type PanelView = 'tenants' | 'factories' | 'users'

export default function SiteManagerPanel() {
  const { t } = useI18n()
  const { role, tenantId, factoryId, factoryName } = useAuth()
  const canAdmin = role === 'super_admin' || role === 'tenant_admin'
  const isSuperAdmin = role === 'super_admin'
  const isFactoryAdmin = role === 'factory_admin'

  const [activeView, setActiveView] = useState<PanelView>('tenants')
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [factories, setFactories] = useState<Factory[]>([])
  const [users, setUsers] = useState<UserInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Tenant CRUD
  const [showCreateTenant, setShowCreateTenant] = useState(false)
  const [newTenant, setNewTenant] = useState<EditableTenant>({ name: '', slug: '' })
  const [editingTenant, setEditingTenant] = useState<number | null>(null)
  const [editTenantData, setEditTenantData] = useState<EditableTenant>({ name: '', slug: '' })

  // Factory CRUD
  const [showCreateFactory, setShowCreateFactory] = useState(false)
  const [newFactory, setNewFactory] = useState<EditableFactory>({ name: '', location: '', timezone: '' })
  const [editingFactory, setEditingFactory] = useState<number | null>(null)
  const [editFactoryData, setEditFactoryData] = useState<EditableFactory>({ name: '', location: '', timezone: '' })
  const [selectedTenantId, setSelectedTenantId] = useState<number | null>(null)

  // User CRUD
  const [showCreateUser, setShowCreateUser] = useState(false)
  const [newUser, setNewUser] = useState<EditableUser>({ username: '', password: '', role: 'operator', tenant_id: null, factory_id: null })

  const handleError = useCallback((err: unknown) => {
    setError(err instanceof Error ? err.message : 'An error occurred')
    setLoading(false)
  }, [])

  // ===== Fetch data =====
  const fetchTenants = useCallback(async () => {
    if (!isSuperAdmin) return
    try {
      const res = await authFetch('/api/v1/tenants')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setTenants(Array.isArray(data) ? data : data.tenants ?? [])
    } catch (err) {
      handleError(err)
    }
  }, [isSuperAdmin, handleError])

  const fetchFactories = useCallback(async () => {
    try {
      const res = await authFetch('/api/v1/sites')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setFactories(Array.isArray(data) ? data : data.sites ?? data.factories ?? [])
    } catch (err) {
      handleError(err)
    }
  }, [handleError])

  const fetchUsers = useCallback(async () => {
    if (!canAdmin) return
    try {
      const res = await authFetch('/api/v1/users')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setUsers(Array.isArray(data) ? data : data.users ?? [])
    } catch (err) {
      handleError(err)
    }
  }, [canAdmin, handleError])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    await Promise.all([
      isSuperAdmin ? fetchTenants() : Promise.resolve(),
      fetchFactories(),
      canAdmin ? fetchUsers() : Promise.resolve(),
    ])
    setLoading(false)
  }, [isSuperAdmin, fetchTenants, fetchFactories, canAdmin, fetchUsers])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  // ===== Tenant CRUD =====
  const handleCreateTenant = useCallback(async () => {
    if (!newTenant.name.trim() || !newTenant.slug.trim()) return
    try {
      const res = await authFetch('/api/v1/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTenant),
      })
      if (!res.ok) throw new Error('Failed to create')
      const created = await res.json()
      setTenants(prev => [...prev, created])
      setNewTenant({ name: '', slug: '' })
      setShowCreateTenant(false)
    } catch {
      /* silently fail */
    }
  }, [newTenant])

  const handleDeleteTenant = useCallback(async (id: number) => {
    if (!window.confirm(t('org.deleteConfirm'))) return
    try {
      const res = await authFetch(`/api/v1/tenants/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      setTenants(prev => prev.filter(t => t.id !== id))
    } catch {
      /* silently fail */
    }
  }, [t])

  const handleSaveTenant = useCallback(async (id: number) => {
    if (!editTenantData.name.trim() || !editTenantData.slug.trim()) return
    try {
      const res = await authFetch(`/api/v1/tenants/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editTenantData),
      })
      if (!res.ok) throw new Error('Failed to update')
      setTenants(prev => prev.map(t => t.id === id ? { ...t, ...editTenantData } : t))
      setEditingTenant(null)
    } catch {
      /* silently fail */
    }
  }, [editTenantData])

  // ===== Factory CRUD =====
  const filteredFactories = isSuperAdmin
    ? factories
    : factories.filter(f => f.tenant_id === tenantId)

  const handleCreateFactory = useCallback(async () => {
    if (!newFactory.name.trim() || !newFactory.location.trim() || !newFactory.timezone.trim()) return
    const targetTenantId = isSuperAdmin ? selectedTenantId : tenantId
    if (!targetTenantId) return
    try {
      const res = await authFetch('/api/v1/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newFactory, tenant_id: targetTenantId }),
      })
      if (!res.ok) throw new Error('Failed to create')
      const created = await res.json()
      setFactories(prev => [...prev, created])
      setNewFactory({ name: '', location: '', timezone: '' })
      setShowCreateFactory(false)
    } catch {
      /* silently fail */
    }
  }, [newFactory, isSuperAdmin, selectedTenantId, tenantId])

  const handleDeleteFactory = useCallback(async (id: number) => {
    try {
      const res = await authFetch(`/api/v1/sites/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      setFactories(prev => prev.filter(f => f.id !== id))
    } catch {
      /* silently fail */
    }
  }, [])

  const handleSaveFactory = useCallback(async (id: number) => {
    if (!editFactoryData.name.trim() || !editFactoryData.location.trim() || !editFactoryData.timezone.trim()) return
    try {
      const res = await authFetch(`/api/v1/sites/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editFactoryData),
      })
      if (!res.ok) throw new Error('Failed to update')
      setFactories(prev => prev.map(f => f.id === id ? { ...f, ...editFactoryData } : f))
      setEditingFactory(null)
    } catch {
      /* silently fail */
    }
  }, [editFactoryData])

  // ===== User CRUD =====
  const filteredUsers = isSuperAdmin
    ? users
    : users.filter(u => u.tenant_id === tenantId)

  const handleCreateUser = useCallback(async () => {
    if (!newUser.username.trim() || !newUser.password.trim()) return
    const targetTenantId = isSuperAdmin ? newUser.tenant_id : tenantId
    if (!targetTenantId) return
    try {
      const res = await authFetch('/api/v1/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newUser, tenant_id: targetTenantId }),
      })
      if (!res.ok) throw new Error('Failed to create')
      const created = await res.json()
      setUsers(prev => [...prev, created])
      setNewUser({ username: '', password: '', role: 'operator', tenant_id: null, factory_id: null })
      setShowCreateUser(false)
    } catch {
      /* silently fail */
    }
  }, [newUser, isSuperAdmin, tenantId])

  const handleDeleteUser = useCallback(async (id: number) => {
    try {
      const res = await authFetch(`/api/v1/users/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      setUsers(prev => prev.filter(u => u.id !== id))
    } catch {
      /* silently fail */
    }
  }, [])

  // ===== Render helpers =====
  const renderRoleLabel = (r: Role) => {
    const key = `role.${r}`
    const label = t(key)
    return label !== key ? label : r
  }

  // ===== Loading / Error =====
  if (loading) {
    return (
      <div className="site-manager-panel">
        <div className="panel-head-row">
          <h3>{canAdmin ? t('tab.admin') : t('org.title')}</h3>
        </div>
        <div className="site-manager-loading">Loading...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="site-manager-panel">
        <div className="panel-head-row">
          <h3>{canAdmin ? t('tab.admin') : t('org.title')}</h3>
        </div>
        <div className="site-manager-error">
          <span>{error}</span>
          <button className="btn-retry" onClick={fetchAll}>Retry</button>
        </div>
      </div>
    )
  }

  // Factory admin gets a simple read-only view
  if (isFactoryAdmin) {
    const myFactory = factories.find(f => f.id === factoryId)
    return (
      <div className="site-manager-panel">
        <div className="panel-head-row">
          <h3>{t('org.title')}</h3>
        </div>
        <div className="site-manager-list">
          <div className="site-manager-card">
            <div className="site-manager-card-header">
              <div className="site-manager-card-info">
                <span className="site-manager-name">{myFactory?.name ?? factoryName ?? t('factory.name')}</span>
              </div>
            </div>
            <div className="site-manager-card-details">
              <span className="site-manager-detail">{t('factory.location')}: {myFactory?.location ?? '—'}</span>
              <span className="site-manager-detail">{t('factory.timezone')}: {myFactory?.timezone ?? '—'}</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Viewer/operator gets a read-only view
  if (!canAdmin) {
    return (
      <div className="site-manager-panel">
        <div className="panel-head-row">
          <h3>{t('org.title')}</h3>
        </div>
        <div className="site-manager-list">
          {filteredFactories.map(f => (
            <div key={f.id} className="site-manager-card">
              <div className="site-manager-card-header">
                <div className="site-manager-card-info">
                  <span className="site-manager-name">{f.name}</span>
                </div>
              </div>
              <div className="site-manager-card-details">
                <span className="site-manager-detail">{f.location}</span>
                <span className="site-manager-detail">{f.timezone}</span>
              </div>
            </div>
          ))}
          {filteredFactories.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-text">{t('factory.title')} info</div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Full admin view
  return (
    <div className="site-manager-panel">
      <div className="panel-head-row">
        <h3>{t('tab.admin')}</h3>
      </div>

      {/* View tabs */}
      <nav className="factory-sub-tabs" style={{ marginBottom: '0.5rem' }}>
        {isSuperAdmin && (
          <button
            className={`factory-sub-tab${activeView === 'tenants' ? ' factory-sub-tab--active' : ''}`}
            onClick={() => setActiveView('tenants')}
          >
            {t('org.title')}
          </button>
        )}
        <button
          className={`factory-sub-tab${activeView === 'factories' ? ' factory-sub-tab--active' : ''}`}
          onClick={() => setActiveView('factories')}
        >
          {t('factory.title')}
        </button>
        <button
          className={`factory-sub-tab${activeView === 'users' ? ' factory-sub-tab--active' : ''}`}
          onClick={() => setActiveView('users')}
        >
          {t('user.title')}
        </button>
      </nav>

      {/* Tenants view */}
      {activeView === 'tenants' && isSuperAdmin && (
        <>
          <div className="panel-head-row" style={{ marginBottom: '0.35rem' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text2)' }}>
              {tenants.length} organization(s)
            </span>
            <button
              className="btn-base"
              onClick={() => setShowCreateTenant(p => !p)}
              style={{ fontSize: '0.55rem', padding: '0.15rem 0.4rem' }}
            >
              {showCreateTenant ? 'Cancel' : '+ Create'}
            </button>
          </div>

          {showCreateTenant && (
            <div className="site-manager-form">
              <input
                className="site-manager-input"
                placeholder={t('org.name')}
                value={newTenant.name}
                onChange={e => setNewTenant(prev => ({ ...prev, name: e.target.value }))}
              />
              <input
                className="site-manager-input"
                placeholder="Slug"
                value={newTenant.slug}
                onChange={e => setNewTenant(prev => ({ ...prev, slug: e.target.value }))}
              />
              <button
                className="btn-base"
                onClick={handleCreateTenant}
                disabled={!newTenant.name.trim() || !newTenant.slug.trim()}
                style={{ fontSize: '0.55rem', padding: '0.15rem 0.4rem' }}
              >
                {t('org.create')}
              </button>
            </div>
          )}

          <div className="site-manager-list">
            {tenants.map(tenant => (
              <div key={tenant.id} className="site-manager-card">
                {editingTenant === tenant.id ? (
                  <>
                    <div className="site-manager-edit-fields">
                      <input
                        className="site-manager-input"
                        value={editTenantData.name}
                        onChange={e => setEditTenantData(prev => ({ ...prev, name: e.target.value }))}
                        placeholder={t('org.name')}
                      />
                      <input
                        className="site-manager-input"
                        value={editTenantData.slug}
                        onChange={e => setEditTenantData(prev => ({ ...prev, slug: e.target.value }))}
                        placeholder="Slug"
                      />
                    </div>
                    <div className="site-manager-card-actions">
                      <button className="btn-base" onClick={() => handleSaveTenant(tenant.id)} style={{ padding: '0.15rem 0.4rem', fontSize: '0.55rem' }}>{t('factory.edit')}</button>
                      <button className="btn-base" onClick={() => { setEditingTenant(null); setSelectedTenantId(null) }} style={{ padding: '0.15rem 0.4rem', fontSize: '0.55rem', borderColor: 'var(--text2)', color: 'var(--text2)' }}>Cancel</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="site-manager-card-header">
                      <div className="site-manager-card-info">
                        <span className="site-manager-name">{tenant.name}</span>
                        <span className="site-manager-detail" style={{ fontSize: '0.55rem' }}>/{tenant.slug}</span>
                      </div>
                      <div className="site-manager-card-actions">
                        <button className="btn-base" onClick={() => { setEditingTenant(tenant.id); setEditTenantData({ name: tenant.name, slug: tenant.slug }) }} style={{ padding: '0.15rem 0.4rem', fontSize: '0.55rem' }}>{t('factory.edit')}</button>
                        <button className="btn-base" onClick={() => handleDeleteTenant(tenant.id)} style={{ padding: '0.15rem 0.4rem', fontSize: '0.55rem', borderColor: 'var(--critical)', color: 'var(--critical)' }}>{t('org.delete')}</button>
                        <button className="btn-base" onClick={() => setSelectedTenantId(tenant.id)} style={{ padding: '0.15rem 0.4rem', fontSize: '0.55rem', borderColor: 'var(--accent)', color: 'var(--accent)' }}>View Factories</button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Factories view */}
      {activeView === 'factories' && (
        <>
          <div className="panel-head-row" style={{ marginBottom: '0.35rem' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text2)' }}>
              {filteredFactories.length} factory/factories
            </span>
            <button
              className="btn-base"
              onClick={() => setShowCreateFactory(p => !p)}
              style={{ fontSize: '0.55rem', padding: '0.15rem 0.4rem' }}
            >
              {showCreateFactory ? 'Cancel' : '+ Create'}
            </button>
          </div>

          {showCreateFactory && (
            <div className="site-manager-form">
              {isSuperAdmin && (
                <select
                  className="site-manager-input"
                  value={selectedTenantId ?? ''}
                  onChange={e => setSelectedTenantId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">Select {t('org.title')}</option>
                  {tenants.map(tt => (
                    <option key={tt.id} value={tt.id}>{tt.name}</option>
                  ))}
                </select>
              )}
              <input
                className="site-manager-input"
                placeholder={t('factory.name')}
                value={newFactory.name}
                onChange={e => setNewFactory(prev => ({ ...prev, name: e.target.value }))}
              />
              <input
                className="site-manager-input"
                placeholder={t('factory.location')}
                value={newFactory.location}
                onChange={e => setNewFactory(prev => ({ ...prev, location: e.target.value }))}
              />
              <input
                className="site-manager-input"
                placeholder={t('factory.timezone')}
                value={newFactory.timezone}
                onChange={e => setNewFactory(prev => ({ ...prev, timezone: e.target.value }))}
              />
              <button
                className="btn-base"
                onClick={handleCreateFactory}
                disabled={!newFactory.name.trim() || !newFactory.location.trim() || !newFactory.timezone.trim() || (isSuperAdmin && !selectedTenantId)}
                style={{ fontSize: '0.55rem', padding: '0.15rem 0.4rem' }}
              >
                {t('factory.create')}
              </button>
            </div>
          )}

          <div className="site-manager-list">
            {filteredFactories.map(f => (
              <div key={f.id} className="site-manager-card">
                {editingFactory === f.id ? (
                  <>
                    <div className="site-manager-edit-fields">
                      <input className="site-manager-input" value={editFactoryData.name} onChange={e => setEditFactoryData(prev => ({ ...prev, name: e.target.value }))} placeholder={t('factory.name')} />
                      <input className="site-manager-input" value={editFactoryData.location} onChange={e => setEditFactoryData(prev => ({ ...prev, location: e.target.value }))} placeholder={t('factory.location')} />
                      <input className="site-manager-input" value={editFactoryData.timezone} onChange={e => setEditFactoryData(prev => ({ ...prev, timezone: e.target.value }))} placeholder={t('factory.timezone')} />
                    </div>
                    <div className="site-manager-card-actions">
                      <button className="btn-base" onClick={() => handleSaveFactory(f.id)} style={{ padding: '0.15rem 0.4rem', fontSize: '0.55rem' }}>{t('factory.edit')}</button>
                      <button className="btn-base" onClick={() => setEditingFactory(null)} style={{ padding: '0.15rem 0.4rem', fontSize: '0.55rem', borderColor: 'var(--text2)', color: 'var(--text2)' }}>Cancel</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="site-manager-card-header">
                      <div className="site-manager-card-info">
                        <span className="site-manager-name">{f.name}</span>
                        {isSuperAdmin && (
                          <span className="site-manager-detail" style={{ fontSize: '0.55rem' }}>
                            Tenant #{f.tenant_id}
                          </span>
                        )}
                      </div>
                      <div className="site-manager-card-actions">
                        <button className="btn-base" onClick={() => { setEditingFactory(f.id); setEditFactoryData({ name: f.name, location: f.location, timezone: f.timezone }) }} style={{ padding: '0.15rem 0.4rem', fontSize: '0.55rem' }}>{t('factory.edit')}</button>
                        <button className="btn-base" onClick={() => handleDeleteFactory(f.id)} style={{ padding: '0.15rem 0.4rem', fontSize: '0.55rem', borderColor: 'var(--critical)', color: 'var(--critical)' }}>{t('factory.delete')}</button>
                      </div>
                    </div>
                    <div className="site-manager-card-details">
                      <span className="site-manager-detail">{f.location}</span>
                      <span className="site-manager-detail">{f.timezone}</span>
                    </div>
                  </>
                )}
              </div>
            ))}
            {filteredFactories.length === 0 && (
              <div className="empty-state">
                <div className="empty-state-text">{t('factory.title')}</div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Users view */}
      {activeView === 'users' && (
        <>
          <div className="panel-head-row" style={{ marginBottom: '0.35rem' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text2)' }}>
              {filteredUsers.length} user(s)
            </span>
            <button
              className="btn-base"
              onClick={() => setShowCreateUser(p => !p)}
              style={{ fontSize: '0.55rem', padding: '0.15rem 0.4rem' }}
            >
              {showCreateUser ? 'Cancel' : '+ Create'}
            </button>
          </div>

          {showCreateUser && (
            <div className="site-manager-form">
              {isSuperAdmin && (
                <select
                  className="site-manager-input"
                  value={newUser.tenant_id ?? ''}
                  onChange={e => setNewUser(prev => ({ ...prev, tenant_id: e.target.value ? Number(e.target.value) : null }))}
                >
                  <option value="">Select {t('org.title')}</option>
                  {tenants.map(tt => (
                    <option key={tt.id} value={tt.id}>{tt.name}</option>
                  ))}
                </select>
              )}
              <input
                className="site-manager-input"
                placeholder={t('user.username')}
                value={newUser.username}
                onChange={e => setNewUser(prev => ({ ...prev, username: e.target.value }))}
              />
              <input
                className="site-manager-input"
                type="password"
                placeholder={t('user.password')}
                value={newUser.password}
                onChange={e => setNewUser(prev => ({ ...prev, password: e.target.value }))}
              />
              <select
                className="site-manager-input"
                value={newUser.role}
                onChange={e => setNewUser(prev => ({ ...prev, role: e.target.value as Role }))}
              >
                <option value="super_admin">{renderRoleLabel('super_admin')}</option>
                <option value="tenant_admin">{renderRoleLabel('tenant_admin')}</option>
                <option value="factory_admin">{renderRoleLabel('factory_admin')}</option>
                <option value="operator">{renderRoleLabel('operator')}</option>
                <option value="viewer">{renderRoleLabel('viewer')}</option>
                <option value="integrator">{renderRoleLabel('integrator')}</option>
              </select>
              <button
                className="btn-base"
                onClick={handleCreateUser}
                disabled={!newUser.username.trim() || !newUser.password.trim()}
                style={{ fontSize: '0.55rem', padding: '0.15rem 0.4rem' }}
              >
                {t('user.create')}
              </button>
            </div>
          )}

          <div className="site-manager-list" style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {filteredUsers.map(u => (
              <div key={u.id} className="site-manager-card">
                <div className="site-manager-card-header">
                  <div className="site-manager-card-info">
                    <span className="site-manager-name">{u.username}</span>
                    <span className={`role-badge role-badge--${u.role}`} style={{ fontSize: '0.5rem', padding: '0.1rem 0.3rem' }}>
                      {renderRoleLabel(u.role)}
                    </span>
                  </div>
                  <div className="site-manager-card-actions">
                    <button
                      className="btn-base"
                      onClick={() => handleDeleteUser(u.id)}
                      style={{ padding: '0.15rem 0.4rem', fontSize: '0.55rem', borderColor: 'var(--critical)', color: 'var(--critical)' }}
                    >
                      {t('user.delete')}
                    </button>
                  </div>
                </div>
                <div className="site-manager-card-details">
                  <span className="site-manager-detail">ID: {u.id}</span>
                  {u.tenant_id && <span className="site-manager-detail">Tenant: #{u.tenant_id}</span>}
                  {u.factory_id && <span className="site-manager-detail">Factory: #{u.factory_id}</span>}
                </div>
              </div>
            ))}
            {filteredUsers.length === 0 && (
              <div className="empty-state">
                <div className="empty-state-text">{t('user.title')}</div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
