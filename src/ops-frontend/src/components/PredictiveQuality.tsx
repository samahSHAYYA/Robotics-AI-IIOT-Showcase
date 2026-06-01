import { useState, useEffect, useMemo } from 'react'

interface StationQuality {
  id: string
  name: string
  defectRate: number
  sampleCount: number
  trend: 'improving' | 'stable' | 'degrading'
}

const STATIONS: StationQuality[] = [
  { id: 'st-01', name: 'Assembly A', defectRate: 2.1, sampleCount: 450, trend: 'stable' },
  { id: 'st-02', name: 'Assembly B', defectRate: 4.8, sampleCount: 380, trend: 'degrading' },
  { id: 'st-03', name: 'Welding Bay', defectRate: 1.3, sampleCount: 520, trend: 'improving' },
  { id: 'st-04', name: 'Inspection', defectRate: 0.7, sampleCount: 600, trend: 'stable' },
  { id: 'st-05', name: 'Packaging', defectRate: 3.2, sampleCount: 310, trend: 'degrading' },
  { id: 'st-06', name: 'Testing Lab', defectRate: 0.9, sampleCount: 280, trend: 'improving' },
]

function defectColor(rate: number): string {
  if (rate > 4) return '#ef4444'
  if (rate > 2.5) return '#eab308'
  return '#22c55e'
}

function makeDefectHistory(): number[] {
  return Array.from({ length: 100 }, () => Math.round((Math.random() * 8 + 0.5) * 10) / 10)
}

export default function PredictiveQuality() {
  const [stations, setStations] = useState<StationQuality[]>(STATIONS)
  const [defectHistory] = useState<number[]>(makeDefectHistory)
  const [selectedStation, setSelectedStation] = useState<string | null>(null)

  useEffect(() => {
    const interval = setInterval(() => {
      setStations((prev) => prev.map((s) => {
        const drift = (Math.random() - 0.5 + (s.trend === 'degrading' ? 0.15 : s.trend === 'improving' ? -0.15 : 0)) * 0.3
        const newRate = Math.max(0.1, Math.min(10, s.defectRate + drift))
        const newTrend = newRate > s.defectRate + 0.1 ? 'degrading' : newRate < s.defectRate - 0.1 ? 'improving' : 'stable'
        return { ...s, defectRate: Math.round(newRate * 10) / 10, sampleCount: s.sampleCount + Math.round(Math.random() * 5), trend: newTrend as StationQuality['trend'] }
      }))
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  const overallDefectRate = useMemo(
    () => stations.reduce((s, st) => s + st.defectRate * st.sampleCount, 0) / stations.reduce((s, st) => s + st.sampleCount, 0),
    [stations],
  )

  const atRiskStations = useMemo(() => stations.filter((s) => s.defectRate > 4), [stations])

  const defectTrend = defectHistory[defectHistory.length - 1] > defectHistory[0] ? 'increasing' : 'decreasing'

  const chartW = 220
  const chartH = 55
  const maxHist = Math.max(...defectHistory)
  const points = defectHistory.map((v, i) => {
    const x = (i / (defectHistory.length - 1)) * chartW
    const y = chartH - ((v / maxHist) * chartH * 0.9)
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  return (
    <div className="pq-panel">
      <div className="panel-head-row">
        <h3>Predictive Quality Control</h3>
        <span className="pq-overall" style={{ color: defectColor(overallDefectRate) }}>
          {(overallDefectRate).toFixed(1)}% avg defect
        </span>
      </div>

      <div className="pq-metrics">
        <div className="pq-metric">
          <span className="pq-metric-value">{defectHistory.length}</span>
          <span className="pq-metric-label">Products Tracked</span>
        </div>
        <div className="pq-metric">
          <span className="pq-metric-value" style={{ color: defectTrend === 'increasing' ? '#ef4444' : '#22c55e' }}>
            {defectTrend === 'increasing' ? '↑' : '↓'} {defectTrend}
          </span>
          <span className="pq-metric-label">Defect Trend</span>
        </div>
        <div className="pq-metric">
          <span className="pq-metric-value" style={{ color: atRiskStations.length > 0 ? '#ef4444' : '#22c55e' }}>
            {atRiskStations.length}
          </span>
          <span className="pq-metric-label">At-Risk Stations</span>
        </div>
      </div>

      <div className="pq-chart-section">
        <div className="pq-chart-label">Defect Rate History (Last {defectHistory.length} products)</div>
        <svg width={chartW} height={chartH} className="pq-svg">
          <rect width={chartW} height={chartH} fill="var(--surface)" rx="3" />
          <path d={points} fill="none" stroke="#ef4444" strokeWidth="1.5" />
          <line x1="0" y1={chartH - (4 / maxHist) * chartH * 0.9} x2={chartW} y2={chartH - (4 / maxHist) * chartH * 0.9}
            stroke="#ef4444" strokeWidth="0.5" strokeDasharray="4 4" opacity="0.5" />
          <line x1="0" y1={chartH - (2.5 / maxHist) * chartH * 0.9} x2={chartW} y2={chartH - (2.5 / maxHist) * chartH * 0.9}
            stroke="#eab308" strokeWidth="0.5" strokeDasharray="4 4" opacity="0.5" />
        </svg>
      </div>

      <div className="pq-stations">
        {stations.map((s) => {
          const isSelected = selectedStation === s.id
          const color = defectColor(s.defectRate)
          const pctBar = Math.min(100, (s.defectRate / 10) * 100)
          const trendIcon = s.trend === 'improving' ? '↓' : s.trend === 'degrading' ? '↑' : '→'
          const trendColor = s.trend === 'improving' ? '#22c55e' : s.trend === 'degrading' ? '#ef4444' : '#eab308'
          return (
            <div
              key={s.id}
              className={`pq-station-row ${isSelected ? 'pq-station-row--selected' : ''}`}
              onClick={() => setSelectedStation(isSelected ? null : s.id)}
            >
              <div className="pq-station-header">
                <span className="pq-station-name">{s.name}</span>
                <span className="pq-station-rate" style={{ color }}>{s.defectRate}%</span>
                <span className="pq-station-trend" style={{ color: trendColor }}>{trendIcon}</span>
              </div>
              <div className="pq-station-bar-bg">
                <div className="pq-station-bar-fill" style={{ width: `${pctBar}%`, background: color }} />
                <div className="pq-station-threshold" style={{ left: '25%' }} title="2.5% threshold">|</div>
                <div className="pq-station-threshold" style={{ left: '40%' }} title="4% threshold">||</div>
              </div>
              <div className="pq-station-footer">
                <span className="pq-station-samples">{s.sampleCount} samples</span>
                {s.defectRate > 4 && (
                  <span className="pq-station-alert">⚠ High defect rate</span>
                )}
                {s.defectRate > 2.5 && s.defectRate <= 4 && (
                  <span className="pq-station-warn">Watch threshold</span>
                )}
              </div>
              {isSelected && (
                <div className="pq-station-detail">
                  <div className="pq-station-detail-row">
                    <span>Predicted next 50: ~{Math.round(s.defectRate * 50) / 10} defects</span>
                  </div>
                  <div className="pq-station-detail-row">
                    <span>Root cause: {s.defectRate > 4 ? 'Calibration drift, sensor noise' : s.defectRate > 2.5 ? 'Material variance' : 'Within spec'}</span>
                  </div>
                  {s.defectRate > 2.5 && (
                    <button className="pq-investigate-btn">Investigate &rarr;</button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
