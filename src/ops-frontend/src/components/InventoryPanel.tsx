import { useState, useEffect, useCallback } from 'react'
import { useI18n } from '../contexts/I18nContext'
import { authFetchJson, authFetch } from '../utils/auth-fetch'

interface InventoryItem {
  id: number; sku: string; name: string; description?: string
  quantity: number; unit: string; min_threshold: number
  location?: string; created_at?: string; updated_at?: string
}

interface StockMovement {
  id: number; item_id: number; quantity_change: number
  reason: string; reference?: string; created_by?: string; created_at?: string
}

type StatusLevel = 'ok' | 'low' | 'critical'

function getStatus(quantity: number, minThreshold: number): StatusLevel {
  if (quantity <= minThreshold) return 'critical'
  if (quantity <= minThreshold * 2) return 'low'
  return 'ok'
}

export default function InventoryPanel() {
  const { t } = useI18n()
  const [items, setItems] = useState<InventoryItem[]>([])
  const [editingItem, setEditingItem] = useState<Partial<InventoryItem> | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null)
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [showMovements, setShowMovements] = useState(false)
  const [adjustItemId, setAdjustItemId] = useState<number | null>(null)
  const [adjustQty, setAdjustQty] = useState<string>('')
  const [adjustReason, setAdjustReason] = useState<string>('')
  const [adjustRef, setAdjustRef] = useState<string>('')

  const fetchItems = useCallback(async () => {
    try { setItems(await authFetchJson('/api/v1/inventory')) } catch {}
  }, [])

  useEffect(() => { fetchItems() }, [fetchItems])

  const fetchMovements = useCallback(async (itemId: number) => {
    try {
      const data = await authFetchJson(`/api/v1/inventory/${itemId}/movements`)
      setMovements(Array.isArray(data) ? data : [])
    } catch {
      setMovements([])
    }
  }, [])

  const openMovements = async (itemId: number) => {
    setSelectedItemId(itemId)
    setShowMovements(true)
    await fetchMovements(itemId)
  }

  const saveItem = async () => {
    if (!editingItem?.sku || !editingItem?.name) return
    const payload: any = {
      sku: editingItem.sku,
      name: editingItem.name,
      unit: editingItem.unit || 'EA',
      min_threshold: editingItem.min_threshold ?? 10,
      quantity: editingItem.quantity ?? 0,
    }
    if (editingItem.description !== undefined) payload.description = editingItem.description
    if (editingItem.location !== undefined) payload.location = editingItem.location
    try {
      if (editingItem.id) {
        await authFetchJson(`/api/v1/inventory/${editingItem.id}`, { method: 'PUT', body: JSON.stringify(payload) })
      } else {
        await authFetchJson('/api/v1/inventory', { method: 'POST', body: JSON.stringify(payload) })
      }
      setEditingItem(null)
      await fetchItems()
    } catch {}
  }

  const deleteItem = async (id: number) => {
    try {
      await authFetch(`/api/v1/inventory/${id}`, { method: 'DELETE' })
      setDeleteConfirm(null)
      await fetchItems()
      if (selectedItemId === id) { setShowMovements(false); setSelectedItemId(null) }
    } catch {}
  }

  const submitAdjustment = async () => {
    if (adjustItemId === null || !adjustQty || !adjustReason) return
    const qty = parseInt(adjustQty, 10)
    if (isNaN(qty) || qty === 0) return
    try {
      await authFetchJson(`/api/v1/inventory/${adjustItemId}/adjust`, {
        method: 'POST',
        body: JSON.stringify({ quantity_change: qty, reason: adjustReason, reference: adjustRef || undefined }),
      })
      setAdjustItemId(null)
      setAdjustQty('')
      setAdjustReason('')
      setAdjustRef('')
      await fetchItems()
      if (selectedItemId === adjustItemId) await fetchMovements(adjustItemId)
    } catch {}
  }

  const statusClass = (item: InventoryItem): string => {
    const s = getStatus(item.quantity, item.min_threshold)
    return `inv-status inv-status--${s}`
  }

  const statusLabel = (item: InventoryItem): string => {
    const s = getStatus(item.quantity, item.min_threshold)
    return t(`inventory.status.${s}`)
  }

  return (
    <div className="inventory-panel">
      <div className="panel-head-row">
        <h3>{t('inventory.title')}</h3>
        <button className="btn-base" onClick={() => setEditingItem({ sku: '', name: '', quantity: 0, unit: 'EA', min_threshold: 10 })}>
          {t('inventory.add')}
        </button>
      </div>

      {/* Add/Edit Form */}
      {editingItem && (
        <div className="inv-form">
          <div className="integration-form__row"><label>{t('inventory.sku')}</label><input value={editingItem.sku || ''} onChange={e => setEditingItem({...editingItem, sku: e.target.value})} /></div>
          <div className="integration-form__row"><label>{t('inventory.name')}</label><input value={editingItem.name || ''} onChange={e => setEditingItem({...editingItem, name: e.target.value})} /></div>
          <div className="integration-form__row"><label>{t('inventory.description')}</label><input value={editingItem.description || ''} onChange={e => setEditingItem({...editingItem, description: e.target.value})} /></div>
          <div className="shift-form-row">
            <div className="integration-form__row"><label>{t('inventory.quantity')}</label><input type="number" value={editingItem.quantity ?? 0} onChange={e => setEditingItem({...editingItem, quantity: parseInt(e.target.value) || 0})} /></div>
            <div className="integration-form__row"><label>{t('inventory.unit')}</label><input value={editingItem.unit || 'EA'} onChange={e => setEditingItem({...editingItem, unit: e.target.value})} /></div>
          </div>
          <div className="shift-form-row">
            <div className="integration-form__row"><label>{t('inventory.minThreshold')}</label><input type="number" value={editingItem.min_threshold ?? 10} onChange={e => setEditingItem({...editingItem, min_threshold: parseInt(e.target.value) || 0})} /></div>
            <div className="integration-form__row"><label>{t('inventory.location')}</label><input value={editingItem.location || ''} onChange={e => setEditingItem({...editingItem, location: e.target.value})} /></div>
          </div>
          <div className="integration-form__actions">
            <button className="btn-base" onClick={() => setEditingItem(null)} style={{borderColor:'var(--text2)',color:'var(--text2)'}}>{t('inventory.cancel')}</button>
            <button className="btn-base" onClick={saveItem}>{editingItem.id ? t('inventory.edit') : t('inventory.add')}</button>
          </div>
        </div>
      )}

      {/* Movements Modal */}
      {showMovements && selectedItemId && (
        <div className="inv-movements-modal">
          <div className="inv-movements-header">
            <h4>{t('inventory.movements')} — {items.find(i => i.id === selectedItemId)?.name}</h4>
            <button className="btn-base" style={{padding:'0.15rem 0.4rem',fontSize:'0.55rem'}} onClick={() => { setShowMovements(false); setSelectedItemId(null) }}>{t('inventory.close')}</button>
          </div>
          <div className="inv-movements-table">
            <div className="inv-movements-row inv-movements-row--header">
              <span>{t('inventory.movementTime')}</span>
              <span>{t('inventory.movementQty')}</span>
              <span>{t('inventory.movementReason')}</span>
              <span>{t('inventory.movementRef')}</span>
              <span>{t('inventory.movementBy')}</span>
            </div>
            {movements.map(m => (
              <div key={m.id} className="inv-movements-row">
                <span>{m.created_at ? new Date(m.created_at).toLocaleString() : ''}</span>
                <span className={m.quantity_change >= 0 ? 'movement-qty--in' : 'movement-qty--out'}>{m.quantity_change >= 0 ? '+' : ''}{m.quantity_change}</span>
                <span>{m.reason}</span>
                <span>{m.reference || ''}</span>
                <span>{m.created_by || ''}</span>
              </div>
            ))}
            {movements.length === 0 && <div className="empty-state-text">{t('inventory.noMovements')}</div>}
          </div>
        </div>
      )}

      {/* Adjust Stock Modal */}
      {adjustItemId !== null && (
        <div className="inv-adjust-modal">
          <div className="inv-form">
            <h4>{t('inventory.adjustStock')} — {items.find(i => i.id === adjustItemId)?.name}</h4>
            <div className="integration-form__row"><label>{t('inventory.adjustQty')}</label><input type="number" value={adjustQty} onChange={e => setAdjustQty(e.target.value)} placeholder={t('inventory.adjustQtyPlaceholder')} /></div>
            <div className="integration-form__row"><label>{t('inventory.adjustReason')}</label>
              <select value={adjustReason} onChange={e => setAdjustReason(e.target.value)}>
                <option value="">{t('inventory.selectReason')}</option>
                <option value="receipt">{t('inventory.reasonReceipt')}</option>
                <option value="consumption">{t('inventory.reasonConsumption')}</option>
                <option value="transfer">{t('inventory.reasonTransfer')}</option>
                <option value="adjustment">{t('inventory.reasonAdjustment')}</option>
              </select>
            </div>
            <div className="integration-form__row"><label>{t('inventory.adjustRef')}</label><input value={adjustRef} onChange={e => setAdjustRef(e.target.value)} placeholder={t('inventory.adjustRefPlaceholder')} /></div>
            <div className="integration-form__actions">
              <button className="btn-base" onClick={() => { setAdjustItemId(null); setAdjustQty(''); setAdjustReason(''); setAdjustRef('') }} style={{borderColor:'var(--text2)',color:'var(--text2)'}}>{t('inventory.cancel')}</button>
              <button className="btn-base" onClick={submitAdjustment} disabled={!adjustQty || !adjustReason}>{t('inventory.submitAdjust')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Inventory Table */}
      <div className="inv-table">
        <div className="inv-table-row inv-table-row--header">
          <span className="inv-col--sku">{t('inventory.sku')}</span>
          <span className="inv-col--name">{t('inventory.name')}</span>
          <span className="inv-col--qty">{t('inventory.quantity')}</span>
          <span className="inv-col--unit">{t('inventory.unit')}</span>
          <span className="inv-col--threshold">{t('inventory.minThreshold')}</span>
          <span className="inv-col--location">{t('inventory.location')}</span>
          <span className="inv-col--status">{t('inventory.status')}</span>
          <span className="inv-col--actions">{t('inventory.actions')}</span>
        </div>
        {items.map(item => (
          <div key={item.id} className="inv-table-row">
            <span className="inv-col--sku"><code>{item.sku}</code></span>
            <span className="inv-col--name">
              <button className="inv-name-btn" onClick={() => openMovements(item.id)} title={t('inventory.viewMovements')}>
                {item.name}
              </button>
            </span>
            <span className="inv-col--qty">{item.quantity}</span>
            <span className="inv-col--unit">{item.unit}</span>
            <span className="inv-col--threshold">{item.min_threshold}</span>
            <span className="inv-col--location">{item.location || ''}</span>
            <span className="inv-col--status">
              <span className={statusClass(item)}>{statusLabel(item)}</span>
            </span>
            <span className="inv-col--actions">
              <button className="btn-base" style={{padding:'0.1rem 0.3rem',fontSize:'0.5rem'}} onClick={() => setEditingItem(item)}>{t('inventory.edit')}</button>
              <button className="btn-base" style={{padding:'0.1rem 0.3rem',fontSize:'0.5rem'}} onClick={() => setAdjustItemId(item.id)}>{t('inventory.adjust')}</button>
              {deleteConfirm === item.id ? (
                <>
                  <button className="btn-base" style={{padding:'0.1rem 0.3rem',fontSize:'0.5rem',borderColor:'var(--critical)',color:'var(--critical)'}} onClick={() => deleteItem(item.id)}>{t('inventory.confirm')}</button>
                  <button className="btn-base" style={{padding:'0.1rem 0.3rem',fontSize:'0.5rem'}} onClick={() => setDeleteConfirm(null)}>{t('inventory.cancel')}</button>
                </>
              ) : (
                <button className="btn-base" style={{padding:'0.1rem 0.3rem',fontSize:'0.5rem',borderColor:'var(--critical)',color:'var(--critical)'}} onClick={() => setDeleteConfirm(item.id)}>{t('inventory.delete')}</button>
              )}
            </span>
          </div>
        ))}
        {items.length === 0 && <div className="empty-state-text">{t('inventory.noItems')}</div>}
      </div>
    </div>
  )
}
