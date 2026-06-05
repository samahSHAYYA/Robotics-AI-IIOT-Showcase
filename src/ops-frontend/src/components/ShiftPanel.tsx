import { useState, useEffect, useCallback } from 'react'
import { useI18n } from '../contexts/I18nContext'
import { authFetchJson, authFetch } from '../utils/auth-fetch'

interface Shift {
  id: number; name: string; start_time: string; end_time: string
  days_of_week: number[]; created_at?: string
}

interface Worker {
  id: number; name: string; role: string; email?: string
  phone?: string; shift_id?: number | null; active: boolean
}

type SubView = 'shifts' | 'workers'

export default function ShiftPanel() {
  const { t } = useI18n()
  const [subView, setSubView] = useState<SubView>('shifts')
  const [shifts, setShifts] = useState<Shift[]>([])
  const [workers, setWorkers] = useState<Worker[]>([])
  const [editingShift, setEditingShift] = useState<Partial<Shift> | null>(null)
  const [editingWorker, setEditingWorker] = useState<Partial<Worker> | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)

  const fetchShifts = useCallback(async () => {
    try { setShifts(await authFetchJson('/api/v1/shifts')) } catch {}
  }, [])
  const fetchWorkers = useCallback(async () => {
    try { setWorkers(await authFetchJson('/api/v1/workers')) } catch {}
  }, [])

  useEffect(() => { fetchShifts(); fetchWorkers() }, [fetchShifts, fetchWorkers])

  const daysLabels = [t('shift.mon'), t('shift.tue'), t('shift.wed'), t('shift.thu'), t('shift.fri'), t('shift.sat'), t('shift.sun')]

  const toggleDay = (day: number) => {
    if (!editingShift) return
    const current = editingShift.days_of_week || []
    const next = current.includes(day) ? current.filter(d => d !== day) : [...current, day]
    setEditingShift({ ...editingShift, days_of_week: next })
  }

  const saveShift = async () => {
    if (!editingShift?.name || !editingShift?.start_time || !editingShift?.end_time) return
    const payload = {
      name: editingShift.name,
      start_time: editingShift.start_time,
      end_time: editingShift.end_time,
      days_of_week: editingShift.days_of_week || [],
    }
    try {
      if (editingShift.id) {
        await authFetchJson(`/api/v1/shifts/${editingShift.id}`, { method: 'PUT', body: JSON.stringify(payload) })
      } else {
        await authFetchJson('/api/v1/shifts', { method: 'POST', body: JSON.stringify(payload) })
      }
      setEditingShift(null)
      await fetchShifts()
    } catch {}
  }

  const deleteShift = async (id: number) => {
    try { await authFetch(`/api/v1/shifts/${id}`, { method: 'DELETE' }); setDeleteConfirm(null); await fetchShifts() } catch {}
  }

  const saveWorker = async () => {
    if (!editingWorker?.name) return
    const payload: any = { name: editingWorker.name, role: editingWorker.role || 'operator' }
    if (editingWorker.email !== undefined) payload.email = editingWorker.email
    if (editingWorker.phone !== undefined) payload.phone = editingWorker.phone
    if (editingWorker.shift_id !== undefined) payload.shift_id = editingWorker.shift_id
    if (editingWorker.active !== undefined) payload.active = editingWorker.active
    try {
      if (editingWorker.id) {
        await authFetchJson(`/api/v1/workers/${editingWorker.id}`, { method: 'PUT', body: JSON.stringify(payload) })
      } else {
        await authFetchJson('/api/v1/workers', { method: 'POST', body: JSON.stringify(payload) })
      }
      setEditingWorker(null)
      await fetchWorkers()
    } catch {}
  }

  const deleteWorker = async (id: number) => {
    try { await authFetch(`/api/v1/workers/${id}`, { method: 'DELETE' }); setDeleteConfirm(null); await fetchWorkers() } catch {}
  }

  // Render shifts tab
  const renderShifts = () => (
    <div>
      <div className="panel-head-row">
        <h3>{t('shift.title')}</h3>
        <button className="btn-base" onClick={() => setEditingShift({ name: '', start_time: '08:00', end_time: '16:00', days_of_week: [0,1,2,3,4] })}>
          {t('shift.add')}
        </button>
      </div>
      {editingShift && (
        <div className="shift-form">
          <div className="integration-form__row"><label>{t('shift.name')}</label><input value={editingShift.name || ''} onChange={e => setEditingShift({...editingShift, name: e.target.value})} /></div>
          <div className="shift-form-row">
            <div className="integration-form__row"><label>{t('shift.startTime')}</label><input type="time" value={editingShift.start_time || '08:00'} onChange={e => setEditingShift({...editingShift, start_time: e.target.value})} /></div>
            <div className="integration-form__row"><label>{t('shift.endTime')}</label><input type="time" value={editingShift.end_time || '16:00'} onChange={e => setEditingShift({...editingShift, end_time: e.target.value})} /></div>
          </div>
          <div className="integration-form__row">
            <label>{t('shift.days')}</label>
            <div className="shift-days-row">{daysLabels.map((label, i) => (
              <label key={i} className="shift-day-label"><input type="checkbox" checked={(editingShift.days_of_week || []).includes(i)} onChange={() => toggleDay(i)} />{label}</label>
            ))}</div>
          </div>
          <div className="integration-form__actions">
            <button className="btn-base" onClick={() => setEditingShift(null)} style={{borderColor:'var(--text2)',color:'var(--text2)'}}>{t('shift.cancel')}</button>
            <button className="btn-base" onClick={saveShift}>{editingShift.id ? t('shift.edit') : t('shift.add')}</button>
          </div>
        </div>
      )}
      <div className="shift-list">
        {shifts.map(s => (
          <div key={s.id} className="shift-card">
            <div className="shift-card__header">
              <strong>{s.name}</strong>
              <span>{s.start_time} - {s.end_time}</span>
            </div>
            <div className="shift-card__days">{s.days_of_week.map(d => daysLabels[d]).join(', ')}</div>
            <div className="shift-card__actions">
              <button className="btn-base" style={{padding:'0.15rem 0.4rem',fontSize:'0.55rem'}} onClick={() => setEditingShift(s)}>{t('shift.edit')}</button>
              {deleteConfirm === s.id ? (
                <><button className="btn-base" style={{padding:'0.15rem 0.4rem',fontSize:'0.55rem',borderColor:'var(--critical)',color:'var(--critical)'}} onClick={() => deleteShift(s.id)}>{t('shift.confirm')}</button>
                <button className="btn-base" style={{padding:'0.15rem 0.4rem',fontSize:'0.55rem'}} onClick={() => setDeleteConfirm(null)}>{t('shift.cancel')}</button></>
              ) : (
                <button className="btn-base" style={{padding:'0.15rem 0.4rem',fontSize:'0.55rem',borderColor:'var(--critical)',color:'var(--critical)'}} onClick={() => setDeleteConfirm(s.id)}>{t('shift.delete')}</button>
              )}
            </div>
          </div>
        ))}
        {shifts.length === 0 && <div className="empty-state-text">{t('shift.noShifts')}</div>}
      </div>
    </div>
  )

  // Render workers tab
  const renderWorkers = () => (
    <div>
      <div className="panel-head-row">
        <h3>{t('worker.title')}</h3>
        <button className="btn-base" onClick={() => setEditingWorker({ name: '', role: 'operator', active: true })}>
          {t('worker.add')}
        </button>
      </div>
      {editingWorker && (
        <div className="shift-form">
          <div className="integration-form__row"><label>{t('worker.name')}</label><input value={editingWorker.name || ''} onChange={e => setEditingWorker({...editingWorker, name: e.target.value})} /></div>
          <div className="integration-form__row">
            <label>{t('worker.role')}</label>
            <select value={editingWorker.role || 'operator'} onChange={e => setEditingWorker({...editingWorker, role: e.target.value})}>
              <option value="operator">{t('worker.operator')}</option>
              <option value="supervisor">{t('worker.supervisor')}</option>
              <option value="engineer">{t('worker.engineer')}</option>
              <option value="manager">{t('worker.manager')}</option>
            </select>
          </div>
          <div className="integration-form__row"><label>{t('worker.email')}</label><input type="email" value={editingWorker.email || ''} onChange={e => setEditingWorker({...editingWorker, email: e.target.value})} /></div>
          <div className="integration-form__row"><label>{t('worker.phone')}</label><input value={editingWorker.phone || ''} onChange={e => setEditingWorker({...editingWorker, phone: e.target.value})} /></div>
          <div className="integration-form__row">
            <label>{t('worker.shift')}</label>
            <select value={editingWorker.shift_id ?? ''} onChange={e => setEditingWorker({...editingWorker, shift_id: e.target.value ? Number(e.target.value) : null})}>
              <option value="">{t('worker.noShift')}</option>
              {shifts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="integration-form__row">
            <label className="integration-form__checkbox-label">
              <input type="checkbox" checked={editingWorker.active ?? true} onChange={e => setEditingWorker({...editingWorker, active: e.target.checked})} />
              {t('worker.active')}
            </label>
          </div>
          <div className="integration-form__actions">
            <button className="btn-base" onClick={() => setEditingWorker(null)} style={{borderColor:'var(--text2)',color:'var(--text2)'}}>{t('shift.cancel')}</button>
            <button className="btn-base" onClick={saveWorker}>{editingWorker.id ? t('worker.edit') : t('worker.add')}</button>
          </div>
        </div>
      )}
      <div className="shift-list">
        {workers.map(w => (
          <div key={w.id} className="worker-card">
            <div className="shift-card__header">
              <strong>{w.name}</strong>
              <span className={`worker-badge worker-badge--${w.role}`}>{w.role}</span>
            </div>
            <div className="worker-card__details">
              {w.email && <span>{w.email}</span>}
              {w.phone && <span>{w.phone}</span>}
              <span>{w.active ? t('worker.active') : t('worker.inactive')}</span>
              <span>{t('worker.shift')}: {shifts.find(s => s.id === w.shift_id)?.name || t('worker.noShift')}</span>
            </div>
            <div className="shift-card__actions">
              <button className="btn-base" style={{padding:'0.15rem 0.4rem',fontSize:'0.55rem'}} onClick={() => setEditingWorker(w)}>{t('worker.edit')}</button>
              {deleteConfirm === w.id ? (
                <><button className="btn-base" style={{padding:'0.15rem 0.4rem',fontSize:'0.55rem',borderColor:'var(--critical)',color:'var(--critical)'}} onClick={() => deleteWorker(w.id)}>{t('shift.confirm')}</button>
                <button className="btn-base" style={{padding:'0.15rem 0.4rem',fontSize:'0.55rem'}} onClick={() => setDeleteConfirm(null)}>{t('shift.cancel')}</button></>
              ) : (
                <button className="btn-base" style={{padding:'0.15rem 0.4rem',fontSize:'0.55rem',borderColor:'var(--critical)',color:'var(--critical)'}} onClick={() => setDeleteConfirm(w.id)}>{t('worker.delete')}</button>
              )}
            </div>
          </div>
        ))}
        {workers.length === 0 && <div className="empty-state-text">{t('worker.noWorkers')}</div>}
      </div>
    </div>
  )

  return (
    <div className="shift-panel">
      <div className="sub-tabs">
        <button className={`sub-tab ${subView === 'shifts' ? 'sub-tab--active' : ''}`} onClick={() => setSubView('shifts')}>{t('shift.title')}</button>
        <button className={`sub-tab ${subView === 'workers' ? 'sub-tab--active' : ''}`} onClick={() => setSubView('workers')}>{t('worker.title')}</button>
      </div>
      {subView === 'shifts' ? renderShifts() : renderWorkers()}
    </div>
  )
}
