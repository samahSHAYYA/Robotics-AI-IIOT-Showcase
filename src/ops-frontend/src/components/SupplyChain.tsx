import { useState, useEffect, useCallback } from 'react'

interface PartType {
  id: string
  name: string
  icon: string
  stock: number
  maxStock: number
  reorderPoint: number
  leadTime: string
  supplier: string
  inTransit: number
}

const PART_TYPES: PartType[] = [
  { id: 'widget', name: 'Widgets', icon: '⚙', stock: 480, maxStock: 800, reorderPoint: 200, leadTime: '3 days', supplier: 'Acme Corp', inTransit: 120 },
  { id: 'boards', name: 'PCB Boards', icon: '🔲', stock: 120, maxStock: 400, reorderPoint: 150, leadTime: '5 days', supplier: 'TechFab Inc', inTransit: 80 },
  { id: 'cables', name: 'Cable Harnesses', icon: '🔌', stock: 340, maxStock: 600, reorderPoint: 180, leadTime: '2 days', supplier: 'WirePro Ltd', inTransit: 200 },
  { id: 'sensors', name: 'Sensors', icon: '📡', stock: 65, maxStock: 300, reorderPoint: 100, leadTime: '7 days', supplier: 'SensoCorp', inTransit: 50 },
  { id: 'actuators', name: 'Actuators', icon: '🔄', stock: 28, maxStock: 150, reorderPoint: 40, leadTime: '10 days', supplier: 'MotionSys', inTransit: 35 },
  { id: 'fasteners', name: 'Fasteners', icon: '🔩', stock: 1200, maxStock: 2000, reorderPoint: 500, leadTime: '1 day', supplier: 'BoltHouse', inTransit: 600 },
]

function stockRiskColor(stock: number, reorderPoint: number, _maxStock: number): string {
  if (stock <= reorderPoint) return '#ef4444'
  if (stock < reorderPoint * 1.5) return '#eab308'
  return '#22c55e'
}

function stockRiskLabel(stock: number, reorderPoint: number): string {
  if (stock <= 0) return 'Out of Stock'
  if (stock <= reorderPoint) return 'Reorder Now'
  if (stock < reorderPoint * 1.5) return 'Low Stock'
  return 'In Stock'
}

export default function SupplyChain() {
  const [parts, setParts] = useState<PartType[]>(PART_TYPES)
  const [reorderHistory, setReorderHistory] = useState<Array<{ part: string; qty: number; time: string }>>([])
  const [showHistory, setShowHistory] = useState(false)

  useEffect(() => {
    const interval = setInterval(() => {
      setParts((prev) => prev.map((p) => {
        const variance = Math.round((Math.random() - 0.48) * 8)
        let newStock = Math.max(0, p.stock + variance)
        let newInTransit = p.inTransit
        if (newStock <= p.reorderPoint && p.inTransit === 0) {
          const reorderQty = Math.round(p.maxStock * 0.4)
          newInTransit = reorderQty
          setReorderHistory((h) => [...h.slice(-30), {
            part: p.name,
            qty: reorderQty,
            time: new Date().toISOString(),
          }])
        }
        if (newInTransit > 0 && Math.random() < 0.15) {
          newStock = Math.min(p.maxStock, newStock + Math.round(newInTransit * 0.6))
          newInTransit = Math.round(newInTransit * 0.4)
        }
        return { ...p, stock: newStock, inTransit: newInTransit }
      }))
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  const handleManualReorder = useCallback((partId: string) => {
    setParts((prev) => prev.map((p) => {
      if (p.id !== partId) return p
      const reorderQty = Math.round(p.maxStock * 0.4)
      return { ...p, inTransit: p.inTransit + reorderQty }
    }))
  }, [])

  const overallRisk = parts.filter((p) => p.stock <= p.reorderPoint).length

  return (
    <div className="supply-chain">
      <div className="panel-head-row">
        <h3>Supply Chain Monitor</h3>
        <span className="supply-risk-badge" style={{
          background: overallRisk > 2 ? '#ef444420' : overallRisk > 0 ? '#eab30820' : '#22c55e20',
          color: overallRisk > 2 ? '#ef4444' : overallRisk > 0 ? '#eab308' : '#22c55e',
        }}>
          {overallRisk > 0 ? `${overallRisk} at risk` : 'All Stocked'}
        </span>
      </div>

      <div className="supply-grid">
        {parts.map((p) => {
          const pct = Math.min(100, (p.stock / p.maxStock) * 100)
          const riskColor = stockRiskColor(p.stock, p.reorderPoint, p.maxStock)
          const riskLabel = stockRiskLabel(p.stock, p.reorderPoint)
          return (
            <div key={p.id} className="supply-card">
              <div className="supply-card-header">
                <span className="supply-card-icon">{p.icon}</span>
                <span className="supply-card-name">{p.name}</span>
                <span className="supply-card-stock">{p.stock}</span>
              </div>
              <div className="supply-bar-bg">
                <div className="supply-bar-fill" style={{ width: `${pct}%`, background: riskColor }} />
                <div className="supply-reorder-marker" style={{ left: `${(p.reorderPoint / p.maxStock) * 100}%` }} />
              </div>
              <div className="supply-card-details">
                <span className="supply-risk-label" style={{ color: riskColor }}>{riskLabel}</span>
                <span className="supply-card-lead">{p.leadTime}</span>
              </div>
              {p.inTransit > 0 && (
                <div className="supply-intransit">
                  <span className="supply-intransit-icon">🚚</span>
                  <span className="supply-intransit-text">{p.inTransit} in transit</span>
                </div>
              )}
              {p.stock <= p.reorderPoint && (
                <button className="supply-reorder-btn" onClick={() => handleManualReorder(p.id)}>
                  Reorder ({p.supplier})
                </button>
              )}
            </div>
          )
        })}
      </div>

      <button className="supply-history-toggle" onClick={() => setShowHistory(!showHistory)}>
        {showHistory ? 'Hide' : 'Show'} Reorder History ({reorderHistory.length})
      </button>
      {showHistory && (
        <div className="supply-history-log">
          {reorderHistory.length === 0 ? (
            <div className="supply-history-empty">No reorders yet</div>
          ) : (
            [...reorderHistory].reverse().slice(0, 15).map((r, i) => (
              <div key={`${r.time}-${i}`} className="supply-history-row">
                <span className="supply-history-part">{r.part}</span>
                <span className="supply-history-qty">+{r.qty}</span>
                <span className="supply-history-time">{new Date(r.time).toLocaleTimeString()}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
