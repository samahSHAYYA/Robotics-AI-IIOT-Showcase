import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { Role, LoginResponse } from '../types/auth'

interface AuthContextType {
  authed: boolean
  role: Role | null
  tenantId: number | null
  tenantName: string | null
  factoryId: number | null
  factoryName: string | null
  kioskMode: boolean
  login: (payload: LoginResponse) => void
  logout: () => void
  switchFactory: (factoryId: number, factoryName: string) => void
  getAuthHeaders: () => Record<string, string>
}

const AuthContext = createContext<AuthContextType | null>(null)

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const val = localStorage.getItem(key)
    if (val === null || val === 'null' || val === 'undefined') return fallback
    return JSON.parse(val) as T
  } catch {
    return fallback
  }
}

export function AuthProvider({ kioskMode, children }: { kioskMode: boolean; children: ReactNode }) {
  const [authed, setAuthed] = useState(() => kioskMode || !!localStorage.getItem('sf_session'))
  const [role, setRole] = useState<Role | null>(() => {
    if (kioskMode) return 'viewer'
    return loadFromStorage<Role | null>('sf_role', 'viewer')
  })
  const [tenantId, setTenantId] = useState<number | null>(() => {
    if (kioskMode) return null
    return loadFromStorage<number | null>('sf_tenant_id', null)
  })
  const [tenantName, setTenantName] = useState<string | null>(() => {
    if (kioskMode) return null
    return loadFromStorage<string | null>('sf_tenant_name', null)
  })
  const [factoryId, setFactoryId] = useState<number | null>(() => {
    if (kioskMode) return null
    return loadFromStorage<number | null>('sf_factory_id', null)
  })
  const [factoryName, setFactoryName] = useState<string | null>(() => {
    if (kioskMode) return null
    return loadFromStorage<string | null>('sf_factory_name', null)
  })

  const login = useCallback((payload: LoginResponse) => {
    const { access_token, role: r, tenant_id, tenant_name, factory_id, factory_name } = payload

    localStorage.setItem('sf_session', access_token)
    localStorage.setItem('sf_role', JSON.stringify(r))
    if (tenant_id !== null && tenant_id !== undefined) {
      localStorage.setItem('sf_tenant_id', JSON.stringify(tenant_id))
    } else {
      localStorage.removeItem('sf_tenant_id')
    }
    if (tenant_name !== null && tenant_name !== undefined) {
      localStorage.setItem('sf_tenant_name', JSON.stringify(tenant_name))
    } else {
      localStorage.removeItem('sf_tenant_name')
    }
    if (factory_id !== null && factory_id !== undefined) {
      localStorage.setItem('sf_factory_id', JSON.stringify(factory_id))
    } else {
      localStorage.removeItem('sf_factory_id')
    }
    if (factory_name !== null && factory_name !== undefined) {
      localStorage.setItem('sf_factory_name', JSON.stringify(factory_name))
    } else {
      localStorage.removeItem('sf_factory_name')
    }

    setRole(r)
    setTenantId(tenant_id ?? null)
    setTenantName(tenant_name ?? null)
    setFactoryId(factory_id ?? null)
    setFactoryName(factory_name ?? null)
    setAuthed(true)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('sf_session')
    localStorage.removeItem('sf_role')
    localStorage.removeItem('sf_tenant_id')
    localStorage.removeItem('sf_tenant_name')
    localStorage.removeItem('sf_factory_id')
    localStorage.removeItem('sf_factory_name')
    setAuthed(false)
    setRole(null)
    setTenantId(null)
    setTenantName(null)
    setFactoryId(null)
    setFactoryName(null)
  }, [])

  const switchFactory = useCallback((newFactoryId: number, newFactoryName: string) => {
    setFactoryId(newFactoryId)
    setFactoryName(newFactoryName)
    localStorage.setItem('sf_factory_id', JSON.stringify(newFactoryId))
    localStorage.setItem('sf_factory_name', JSON.stringify(newFactoryName))
  }, [])

  const getAuthHeaders = useCallback((): Record<string, string> => {
    const token = localStorage.getItem('sf_session')
    if (!token) return {}
    return { Authorization: `Bearer ${token}` }
  }, [])

  return (
    <AuthContext.Provider
      value={{
        authed, role, tenantId, tenantName, factoryId, factoryName, kioskMode,
        login, logout, switchFactory, getAuthHeaders,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
