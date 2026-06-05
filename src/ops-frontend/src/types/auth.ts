export interface LoginResponse {
  access_token: string
  token_type: string
  username: string
  role: Role
  tenant_id: number | null
  tenant_name: string | null
  factory_id: number | null
  factory_name: string | null
}

export type Role =
  | 'super_admin'
  | 'tenant_admin'
  | 'factory_admin'
  | 'operator'
  | 'viewer'
  | 'integrator'

export interface Tenant {
  id: number
  name: string
  slug: string
  created_at: string
  updated_at?: string
}

export interface Factory {
  id: number
  tenant_id: number
  name: string
  location: string
  timezone: string
  channel_prefix: string
  created_at: string
  updated_at?: string
}

export interface UserInfo {
  id: number
  tenant_id: number | null
  factory_id: number | null
  username: string
  role: Role
  created_at: string
}

export interface AuthState {
  authed: boolean
  role: Role | null
  tenantId: number | null
  tenantName: string | null
  factoryId: number | null
  factoryName: string | null
  kioskMode: boolean
}

export const ROLE_HIERARCHY_LEVEL: Record<Role, number> = {
  super_admin: 5,
  tenant_admin: 4,
  factory_admin: 3,
  operator: 2,
  viewer: 1,
  integrator: 0,
}

export const ROLE_PERMISSIONS: Record<Role, string[]> = {
  super_admin: [
    'map', 'fleet', 'alerts', 'analytics', 'oee', 'energy', 'predictive',
    'heatmap', 'production', 'camera', 'chat', 'safety', 'supply-chain',
    'federated', 'quality', 'audio', 'sensors', 'audit', 'webhooks',
    'admin', 'sites', 'users', 'shift-scheduler', 'integrations',
    'shifts', 'inventory',
  ],
  tenant_admin: [
    'map', 'fleet', 'alerts', 'analytics', 'oee', 'energy', 'predictive',
    'heatmap', 'production', 'camera', 'chat', 'safety', 'supply-chain',
    'federated', 'quality', 'audio', 'sensors', 'audit', 'webhooks',
    'admin', 'sites', 'users', 'shift-scheduler', 'integrations',
    'shifts', 'inventory',
  ],
  factory_admin: [
    'map', 'fleet', 'alerts', 'analytics', 'oee', 'energy', 'predictive',
    'heatmap', 'production', 'camera', 'chat', 'safety', 'supply-chain',
    'federated', 'quality', 'audio', 'sensors', 'audit', 'webhooks',
    'shift-scheduler', 'inventory',
  ],
  operator: [
    'map', 'fleet', 'alerts', 'analytics', 'oee', 'energy', 'predictive',
    'heatmap', 'production', 'camera', 'chat', 'safety', 'supply-chain',
    'federated', 'quality', 'audio', 'sensors', 'shift-scheduler',
  ],
  viewer: [
    'map', 'fleet', 'alerts', 'analytics', 'oee', 'energy', 'predictive',
    'heatmap', 'production', 'camera', 'chat', 'safety', 'supply-chain',
    'federated', 'quality', 'audio',
  ],
  integrator: ['map'],
}
