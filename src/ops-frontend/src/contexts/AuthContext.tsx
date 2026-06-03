import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface AuthContextType {
  authed: boolean
  role: 'admin' | 'operator' | 'viewer'
  login: (role: string) => void
  logout: () => void
  kioskMode: boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ kioskMode, children }: { kioskMode: boolean; children: ReactNode }) {
  const [authed, setAuthed] = useState(() => kioskMode || !!localStorage.getItem('sf_session'))
  const [role, setRole] = useState<'admin' | 'operator' | 'viewer'>(() => {
    if (kioskMode) return 'viewer'
    return (localStorage.getItem('sf_role') as 'admin' | 'operator' | 'viewer') || 'admin'
  })

  const login = useCallback((newRole: string) => {
    setRole(newRole as 'admin' | 'operator' | 'viewer')
    setAuthed(true)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('sf_session')
    localStorage.removeItem('sf_role')
    setAuthed(false)
  }, [])

  return (
    <AuthContext.Provider value={{ authed, role, login, logout, kioskMode }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
