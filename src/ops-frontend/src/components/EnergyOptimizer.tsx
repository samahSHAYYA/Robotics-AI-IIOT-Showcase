import { useState, useCallback } from 'react'
import type { RobotStatus } from '../types/telemetry'

interface Suggestion {
  id: string
  title: string
  description: string
  savings: string
  effort: 'low' | 'medium' | 'high'
  applied: boolean
}

interface WhatIf {
  label: string
  currentKwh: number
  optimizedKwh: number
  reduction: string
}

interface EnergyOptimizerProps {
  robots: RobotStatus[]
}

function generateSuggestions(robots: RobotStatus[]): Suggestion[] {
  const base: Suggestion[] = [
    { id: 's1', title: 'Reduce conveyor speed', description: 'Lower non-peak conveyor speed by 15% to reduce idle power draw', savings: '~180 kWh/day', effort: 'low', applied: false },
    { id: 's2', title: 'Idle robot standby', description: 'Put idle robots into low-power standby after 5 min of inactivity', savings: '~320 kWh/day', effort: 'low', applied: false },
  ]
  if (robots.some((r) => r.status === 'moving' || r.status === 'active')) {
    base.push(
      { id: 's3', title: 'Optimize robot path', description: 'Reduce non-productive travel distance by 12% through path smoothing', savings: '~95 kWh/day', effort: 'medium', applied: false },
      { id: 's4', title: 'Shift high-load tasks', description: 'Move welding tasks to off-peak hours (22:00-06:00) for lower rates', savings: '~210 kWh/day', effort: 'high', applied: false },
    )
  }
  return base
}

export default function EnergyOptimizer({ robots }: EnergyOptimizerProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>(() => generateSuggestions(robots))
  const [showWhatIf, setShowWhatIf] = useState(false)

  const handleApply = useCallback((id: string) => {
    setSuggestions((prev) => prev.map((s) => s.id === id ? { ...s, applied: !s.applied } : s))
  }, [])

  const whatIfs: WhatIf[] = [
    { label: 'Current baseline', currentKwh: 2840, optimizedKwh: 2840, reduction: '0%' },
    { label: 'With low-effort optimizations', currentKwh: 2840, optimizedKwh: 2340, reduction: '17.6%' },
    { label: 'With all optimizations', currentKwh: 2840, optimizedKwh: 1890, reduction: '33.5%' },
  ]

  const vals = [180, 320, 95, 210]
  const appliedSuggestions = suggestions.filter((s) => s.applied)
  const totalSavings = appliedSuggestions.reduce((sum, a) => {
    const idx = suggestions.findIndex((x) => x.id === a.id)
    return sum + (vals[idx] || 0)
  }, 0)

  const activeCount = suggestions.filter((s) => s.applied).length

  const impactColor = totalSavings > 400 ? '#22c55e' : totalSavings > 200 ? '#eab308' : 'var(--text2)'

  return (
    <div className="eo-panel">
      <div className="panel-head-row">
        <h3>Energy Optimization AI</h3>
        <span className="eo-savings" style={{ color: impactColor }}>
          -{totalSavings} kWh/day
        </span>
      </div>

      <div className="eo-impact">
        <div className="eo-impact-row">
          <span className="eo-impact-label">Active optimizations</span>
          <span className="eo-impact-value">{activeCount}/{suggestions.length}</span>
        </div>
        <div className="eo-impact-row">
          <span className="eo-impact-label">Estimated annual savings</span>
          <span className="eo-impact-value" style={{ color: impactColor }}>
            ~${(totalSavings * 0.12 * 365).toLocaleString()}
          </span>
        </div>
        <div className="eo-impact-row">
          <span className="eo-impact-label">CO₂ reduction</span>
          <span className="eo-impact-value" style={{ color: impactColor }}>
            ~{(totalSavings * 0.4 / 1000).toFixed(1)} tons/year
          </span>
        </div>
      </div>

      <div className="eo-suggestions">
        <h4>AI-Generated Suggestions</h4>
        {suggestions.map((s) => {
          const effortColor = s.effort === 'low' ? '#22c55e' : s.effort === 'medium' ? '#eab308' : '#ef4444'
          return (
            <div key={s.id} className={`eo-suggestion ${s.applied ? 'eo-suggestion--applied' : ''}`}>
              <div className="eo-suggestion-header">
                <span className="eo-suggestion-title">{s.title}</span>
                <button
                  className={`eo-apply-btn ${s.applied ? 'eo-apply-btn--applied' : ''}`}
                  onClick={() => handleApply(s.id)}
                >
                  {s.applied ? 'Applied' : 'Apply'}
                </button>
              </div>
              <div className="eo-suggestion-desc">{s.description}</div>
              <div className="eo-suggestion-footer">
                <span className="eo-suggestion-savings">{s.savings}</span>
                <span className="eo-suggestion-effort" style={{ color: effortColor }}>{s.effort} effort</span>
              </div>
            </div>
          )
        })}
      </div>

      <button className="eo-whatif-toggle" onClick={() => setShowWhatIf(!showWhatIf)}>
        {showWhatIf ? 'Hide' : 'Show'} What-If Analysis
      </button>
      {showWhatIf && (
        <div className="eo-whatif">
          <div className="eo-whatif-chart">
            {whatIfs.map((w, i) => {
              const pct = (w.optimizedKwh / whatIfs[0].currentKwh) * 100
              const barColor = i === 0 ? 'var(--accent)' : i === 1 ? '#eab308' : '#22c55e'
              return (
                <div key={w.label} className="eo-whatif-row">
                  <span className="eo-whatif-label">{w.label}</span>
                  <div className="eo-whatif-bar-bg">
                    <div className="eo-whatif-bar-fill" style={{ width: `${pct}%`, background: barColor }} />
                  </div>
                  <span className="eo-whatif-value">{w.optimizedKwh} kWh</span>
                  {i > 0 && <span className="eo-whatif-reduction">-{w.reduction}</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
