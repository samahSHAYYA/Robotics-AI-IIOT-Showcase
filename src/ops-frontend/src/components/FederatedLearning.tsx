import { useState, useEffect, useRef, useCallback } from 'react'

interface FLNode {
  id: string
  name: string
  accuracy: number
  loss: number
  samples: number
  color: string
}

interface FLRound {
  round: number
  globalAccuracy: number
  globalLoss: number
  nodeAccuracies: Record<string, number>
}

const NODES: FLNode[] = [
  { id: 'edge-01', name: 'Assembly Line A', accuracy: 0, loss: 0, samples: 1200, color: '#3b82f6' },
  { id: 'edge-02', name: 'Welding Station 3', accuracy: 0, loss: 0, samples: 800, color: '#f59e0b' },
  { id: 'edge-03', name: 'Inspector Q1', accuracy: 0, loss: 0, samples: 950, color: '#8b5cf6' },
  { id: 'edge-04', name: 'Conveyor Sensors', accuracy: 0, loss: 0, samples: 1500, color: '#22c55e' },
  { id: 'edge-05', name: 'Quality Lab', accuracy: 0, loss: 0, samples: 600, color: '#ef4444' },
]

function simulateRound(nodes: FLNode[], prevAcc: number, prevLoss: number): { nodes: FLNode[]; globalAcc: number; globalLoss: number } {
  const updated = nodes.map((n) => {
    const improvement = (Math.random() - 0.45) * 0.04
    const newAcc = Math.min(0.98, Math.max(0.5, n.accuracy + improvement))
    const lossImprovement = (Math.random() - 0.55) * 0.05
    const newLoss = Math.min(1.5, Math.max(0.05, n.loss + lossImprovement))
    return { ...n, accuracy: newAcc, loss: newLoss }
  })
  const totalSamples = updated.reduce((s, n) => s + n.samples, 0)
  const globalAcc = updated.reduce((s, n) => s + n.accuracy * (n.samples / totalSamples), 0)
  const globalLoss = updated.reduce((s, n) => s + n.loss * (n.samples / totalSamples), 0)
  const jitter = (Math.random() - 0.5) * 0.02
  return {
    nodes: updated,
    globalAcc: Math.min(0.98, Math.max(0.3, prevAcc + (globalAcc - prevAcc) * 0.3 + jitter)),
    globalLoss: Math.min(1.5, Math.max(0.05, prevLoss + (globalLoss - prevLoss) * 0.3 + jitter * 0.5)),
  }
}

export default function FederatedLearning() {
  const [nodes, setNodes] = useState<FLNode[]>(NODES)
  const [rounds, setRounds] = useState<FLRound[]>([])
  const [isTraining, setIsTraining] = useState(false)
  const [targetRounds, setTargetRounds] = useState(20)
  const [completedRounds, setCompletedRounds] = useState(0)
  const roundRef = useRef(0)
  const globalAccRef = useRef(0.65)
  const globalLossRef = useRef(0.85)

  useEffect(() => {
    if (!isTraining || completedRounds >= targetRounds) return
    const timeout = setTimeout(() => {
      const result = simulateRound(nodes, globalAccRef.current, globalLossRef.current)
      globalAccRef.current = result.globalAcc
      globalLossRef.current = result.globalLoss
      setNodes(result.nodes)
      roundRef.current += 1
      const nodeAccs: Record<string, number> = {}
      for (const n of result.nodes) nodeAccs[n.id] = n.accuracy
      setRounds((prev) => [...prev, {
        round: roundRef.current,
        globalAccuracy: result.globalAcc,
        globalLoss: result.globalLoss,
        nodeAccuracies: nodeAccs,
      }].slice(-50))
      setCompletedRounds(roundRef.current)
    }, 800)
    return () => clearTimeout(timeout)
  }, [isTraining, completedRounds, targetRounds, nodes])

  const handleStart = useCallback(() => {
    if (rounds.length === 0) {
      roundRef.current = 0
      globalAccRef.current = 0.5 + Math.random() * 0.15
      globalLossRef.current = 0.7 + Math.random() * 0.3
    }
    setIsTraining(true)
  }, [rounds.length])

  const handleStop = useCallback(() => setIsTraining(false), [])

  const handleReset = useCallback(() => {
    setIsTraining(false)
    setNodes(NODES)
    setRounds([])
    setCompletedRounds(0)
    roundRef.current = 0
    globalAccRef.current = 0.65
    globalLossRef.current = 0.85
  }, [])

  const currentAcc = rounds.length > 0 ? rounds[rounds.length - 1].globalAccuracy : 0
  const currentLoss = rounds.length > 0 ? rounds[rounds.length - 1].globalLoss : 0
  const accuracyPoints = rounds.map((r) => r.globalAccuracy)
  const lossPoints = rounds.map((r) => r.globalLoss)

  const maxAcc = Math.max(...accuracyPoints, 0.5)
  const minAcc = Math.min(...accuracyPoints, 0.5)
  const maxLoss = Math.max(...lossPoints, 0.05)

  function svgPath(points: number[], w: number, h: number, min: number, max: number, invert = false): string {
    if (points.length < 2) return ''
    const range = Math.max(max - min, 0.01)
    return points.map((v, i) => {
      const x = (i / (points.length - 1)) * w
      const y = invert ? ((v - min) / range) * h : h - ((v - min) / range) * h
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ')
  }

  const chartW = 220
  const chartH = 60

  return (
    <div className="fl-panel">
      <div className="panel-head-row">
        <h3>Federated Learning</h3>
        <span className="fl-status" style={{
          color: isTraining ? '#22c55e' : completedRounds > 0 ? '#eab308' : 'var(--text2)',
        }}>
          {isTraining ? `Training (${completedRounds}/${targetRounds})` : completedRounds > 0 ? 'Paused' : 'Idle'}
        </span>
      </div>

      <div className="fl-metrics">
        <div className="fl-metric">
          <span className="fl-metric-value" style={{ color: currentAcc > 0.85 ? '#22c55e' : currentAcc > 0.7 ? '#eab308' : '#6b7280' }}>
            {(currentAcc * 100).toFixed(1)}%
          </span>
          <span className="fl-metric-label">Global Accuracy</span>
        </div>
        <div className="fl-metric">
          <span className="fl-metric-value" style={{ color: currentLoss < 0.3 ? '#22c55e' : currentLoss < 0.6 ? '#eab308' : '#6b7280' }}>
            {currentLoss.toFixed(3)}
          </span>
          <span className="fl-metric-label">Global Loss</span>
        </div>
        <div className="fl-metric">
          <span className="fl-metric-value">{completedRounds}</span>
          <span className="fl-metric-label">Rounds</span>
        </div>
      </div>

      {rounds.length >= 2 && (
        <div className="fl-charts">
          <div className="fl-chart">
            <div className="fl-chart-label">Accuracy</div>
            <svg width={chartW} height={chartH} className="fl-svg">
              <rect width={chartW} height={chartH} fill="var(--surface)" rx="3" />
              <path d={svgPath(accuracyPoints, chartW, chartH, minAcc * 0.95, maxAcc * 1.05)} fill="none" stroke="#3b82f6" strokeWidth="2" />
              <circle cx={chartW - 1} cy={((currentAcc - minAcc * 0.95) / (maxAcc * 1.05 - minAcc * 0.95)) * chartH} r="3" fill="#3b82f6" />
            </svg>
          </div>
          <div className="fl-chart">
            <div className="fl-chart-label">Loss</div>
            <svg width={chartW} height={chartH} className="fl-svg">
              <rect width={chartW} height={chartH} fill="var(--surface)" rx="3" />
              <path d={svgPath(lossPoints, chartW, chartH, 0, maxLoss * 1.1, true)} fill="none" stroke="#ef4444" strokeWidth="2" />
              <circle cx={chartW - 1} cy={chartH - ((currentLoss) / (maxLoss * 1.1)) * chartH} r="3" fill="#ef4444" />
            </svg>
          </div>
        </div>
      )}

      <div className="fl-controls">
        {!isTraining ? (
          <button className="fl-btn fl-btn--start" onClick={handleStart} disabled={completedRounds >= targetRounds}>
            {completedRounds > 0 ? 'Resume Training' : 'Start Training'}
          </button>
        ) : (
          <button className="fl-btn fl-btn--stop" onClick={handleStop}>Pause</button>
        )}
        <button className="fl-btn fl-btn--reset" onClick={handleReset}>Reset</button>
        <label className="fl-rounds-label">
          <span className="fl-rounds-text">Rounds:</span>
          <select className="fl-rounds-select" value={targetRounds} onChange={(e) => setTargetRounds(Number(e.target.value))} disabled={isTraining}>
            {[5, 10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>

      <div className="fl-nodes">
        <h4>Edge Nodes</h4>
        {nodes.map((n) => (
          <div key={n.id} className="fl-node-row">
            <div className="fl-node-header">
              <span className="fl-node-dot" style={{ background: n.color }} />
              <span className="fl-node-name">{n.name}</span>
              <span className="fl-node-samples">{n.samples.toLocaleString()} samples</span>
            </div>
            <div className="fl-node-stats">
              <span className="fl-node-stat" style={{ color: n.accuracy > 0.85 ? '#22c55e' : '#eab308' }}>
                Acc: {(n.accuracy * 100).toFixed(1)}%
              </span>
              <span className="fl-node-stat" style={{ color: n.loss < 0.3 ? '#22c55e' : '#eab308' }}>
                Loss: {n.loss.toFixed(3)}
              </span>
            </div>
            <div className="fl-node-bar-bg">
              <div className="fl-node-bar-fill" style={{ width: `${n.accuracy * 100}%`, background: n.color }} />
            </div>
          </div>
        ))}
      </div>

      {rounds.length > 0 && (
        <div className="fl-aggregation">
          <h4>FedAvg Aggregation Tree</h4>
          <div className="fl-tree">
            <div className="fl-tree-leaf fl-tree-leaf--root">
              <span className="fl-tree-label">Global Model</span>
              <span className="fl-tree-value">{(currentAcc * 100).toFixed(1)}%</span>
            </div>
            <div className="fl-tree-branch">
              <div className="fl-tree-leaf">
                <span className="fl-tree-label">Edge Nodes</span>
                <span className="fl-tree-value">{nodes.length}</span>
              </div>
              <div className="fl-tree-leaf">
                <span className="fl-tree-label">Samples</span>
                <span className="fl-tree-value">{nodes.reduce((s, n) => s + n.samples, 0).toLocaleString()}</span>
              </div>
              <div className="fl-tree-leaf">
                <span className="fl-tree-label">Weighted Avg</span>
                <span className="fl-tree-value">FedAvg</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
