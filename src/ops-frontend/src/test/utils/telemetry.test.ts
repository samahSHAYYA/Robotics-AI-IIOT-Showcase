import { describe, it, expect } from 'vitest'
import {
  countAlertsBySeverity,
  getAverageUptime,
  filterAlertsBySeverity,
  formatTimestamp,
  overallSeverity,
} from '../../utils/telemetry'
import type { Alert, RobotStatus } from '../../types/telemetry'

describe('countAlertsBySeverity', () => {
  it('returns empty object for empty array', () => {
    expect(countAlertsBySeverity([])).toEqual({})
  })

  it('counts alerts grouped by severity', () => {
    const alerts: Alert[] = [
      { severity: 'critical', message: 'a', timestamp: 't1' },
      { severity: 'warning', message: 'b', timestamp: 't2' },
      { severity: 'critical', message: 'c', timestamp: 't3' },
      { severity: 'info', message: 'd', timestamp: 't4' },
    ]
    expect(countAlertsBySeverity(alerts)).toEqual({
      critical: 2,
      warning: 1,
      info: 1,
    })
  })
})

describe('getAverageUptime', () => {
  it('returns 0 for empty array', () => {
    expect(getAverageUptime([])).toBe(0)
  })

  it('computes average uptime across robots', () => {
    const robots: RobotStatus[] = [
      { robot_id: 'C3', name: 'C3', status: 'active', uptime_pct: 99, current_task: null, pose: { x: 0, y: 0, theta: 0 } },
      { robot_id: 'W2', name: 'W2', status: 'moving', uptime_pct: 97, current_task: null, pose: { x: 1, y: 1, theta: 0 } },
    ]
    expect(getAverageUptime(robots)).toBe(98)
  })

  it('handles single robot', () => {
    const robots: RobotStatus[] = [
      { robot_id: 'Q1', name: 'Q1', status: 'idle', uptime_pct: 100, current_task: null, pose: { x: 2, y: 2, theta: 0 } },
    ]
    expect(getAverageUptime(robots)).toBe(100)
  })
})

describe('filterAlertsBySeverity', () => {
  it('keeps only matching severities', () => {
    const alerts: Alert[] = [
      { severity: 'critical', message: 'c1', timestamp: 't' },
      { severity: 'warning', message: 'w1', timestamp: 't' },
      { severity: 'info', message: 'i1', timestamp: 't' },
      { severity: 'critical', message: 'c2', timestamp: 't' },
    ]
    const result = filterAlertsBySeverity(alerts, new Set(['critical']))
    expect(result).toHaveLength(2)
    expect(result.every((a) => a.severity === 'critical')).toBe(true)
  })

  it('returns empty array when no match', () => {
    const alerts: Alert[] = [
      { severity: 'info', message: 'i', timestamp: 't' },
    ]
    expect(filterAlertsBySeverity(alerts, new Set(['critical', 'warning']))).toEqual([])
  })
})

describe('formatTimestamp', () => {
  it('formats a valid ISO string', () => {
    const result = formatTimestamp('2026-05-30T10:00:00Z')
    expect(result).toBeTruthy()
    expect(typeof result).toBe('string')
  })

  it('returns empty string for invalid input', () => {
    expect(formatTimestamp('not-a-date')).toBe('')
  })
})

describe('overallSeverity', () => {
  it('returns healthy for empty alerts', () => {
    expect(overallSeverity([])).toBe('healthy')
  })

  it('returns critical when any critical alert exists', () => {
    const alerts: Alert[] = [
      { severity: 'info', message: 'i', timestamp: 't' },
      { severity: 'critical', message: 'c', timestamp: 't' },
      { severity: 'warning', message: 'w', timestamp: 't' },
    ]
    expect(overallSeverity(alerts)).toBe('critical')
  })

  it('returns warning when warning (but no critical) alert exists', () => {
    const alerts: Alert[] = [
      { severity: 'info', message: 'i', timestamp: 't' },
      { severity: 'warning', message: 'w', timestamp: 't' },
    ]
    expect(overallSeverity(alerts)).toBe('warning')
  })

  it('returns healthy for only info/healthy alerts', () => {
    const alerts: Alert[] = [
      { severity: 'info', message: 'i', timestamp: 't' },
    ]
    expect(overallSeverity(alerts)).toBe('healthy')
  })
})
