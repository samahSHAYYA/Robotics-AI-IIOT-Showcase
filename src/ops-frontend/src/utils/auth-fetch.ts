/**
 * Wrapper around fetch that automatically includes the JWT token
 * and handles 401 responses by clearing session and redirecting.
 */

const LOGIN_PATH = '/'

const AUTH_KEYS = [
  'sf_session',
  'sf_role',
  'sf_tenant_id',
  'sf_tenant_name',
  'sf_factory_id',
  'sf_factory_name',
]

export function getToken(): string | null {
  return localStorage.getItem('sf_session')
}

export function clearAuthSession(): void {
  for (const key of AUTH_KEYS) {
    localStorage.removeItem(key)
  }
}

export function dispatchSessionExpired(): void {
  window.dispatchEvent(new CustomEvent('auth:expired'))
}

export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken()
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(url, { ...options, headers })

  if (response.status === 401) {
    clearAuthSession()
    dispatchSessionExpired()
    window.location.href = LOGIN_PATH
    throw new Error('Session expired')
  }

  return response
}

/**
 * Convenience wrapper around authFetch that automatically parses JSON.
 */
export async function authFetchJson(url: string, options: RequestInit = {}): Promise<any> {
  const response = await authFetch(url, options)
  return response.json()
}
