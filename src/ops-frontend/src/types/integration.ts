export interface Integration {
  id: number
  tenant_id: number
  name: string
  adapter_type: string
  base_url: string
  auth_type: 'api_key' | 'basic' | 'oauth2' | 'none'
  sync_interval_minutes: number
  enabled: boolean
  last_sync_at: string | null
  last_sync_status: 'never' | 'success' | 'error'
  created_at: string
  updated_at?: string
}

export interface IntegrationCreate {
  name: string
  adapter_type: string
  base_url: string
  auth_type: string
  auth_config?: Record<string, any>
  sync_interval_minutes?: number
}

export interface SyncLogEntry {
  id: number
  integration_id: number
  status: 'success' | 'error'
  records_synced: number
  error_message: string | null
  started_at: string
  completed_at: string
}

export interface AdapterInfo {
  name: string
  description?: string
}
