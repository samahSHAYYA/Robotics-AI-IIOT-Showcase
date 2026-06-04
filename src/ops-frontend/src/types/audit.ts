/**
 * Audit log types matching the ops-api backend response.
 *
 * The GET /api/v1/audit endpoint returns:
 *   { entries: AuditLogEntry[], total: number, page: number, per_page: number }
 */

export interface AuditLogEntry {
  id: string
  timestamp: string
  robot_id: string
  action: string
  user_role: string
  details: string
  ip_address: string
}

export interface AuditLogResponse {
  entries: AuditLogEntry[]
  total: number
  page: number
  per_page: number
}
