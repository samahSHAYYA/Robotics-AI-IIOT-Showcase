/**
 * Wrapper around fetch that automatically includes the JWT token
 * and handles 401 responses by clearing session and redirecting.
 */

const LOGIN_PATH = '/'

export function getToken(): string | null {
  return localStorage.getItem('sf_session')
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
    localStorage.clear()
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
