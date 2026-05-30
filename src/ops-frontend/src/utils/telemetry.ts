import type { Alert, RobotStatus } from '../types/telemetry'

/**
 * Count alerts grouped by severity.
 */
export function countAlertsBySeverity(alerts: Alert[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const a of alerts) {
    counts[a.severity] = (counts[a.severity] ?? 0) + 1
  }
  return counts
}

/**
 * Compute the average uptime percentage across robots.
 * Returns 0 if the array is empty.
 */
export function getAverageUptime(robots: RobotStatus[]): number {
  if (robots.length === 0) return 0
  const total = robots.reduce((sum, r) => sum + r.uptime_pct, 0)
  return total / robots.length
}

/**
 * Filter alerts to only those whose severity is in the provided set.
 */
export function filterAlertsBySeverity(
  alerts: Alert[],
  severities: Set<string>,
): Alert[] {
  return alerts.filter((a) => severities.has(a.severity))
}

/**
 * Format an ISO timestamp string to a short locale time string.
 */
export function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleTimeString()
  } catch {
    return ''
  }
}

/**
 * Determine the overall severity level of an alert set.
 * - 'critical' if any critical alert exists
 * - 'warning' if any warning alert exists (and no critical)
 * - 'healthy' otherwise
 */
export function overallSeverity(alerts: Alert[]): 'critical' | 'warning' | 'healthy' {
  for (const a of alerts) {
    if (a.severity === 'critical') return 'critical'
    if (a.severity === 'warning') return 'warning'
  }
  return 'healthy'
}
