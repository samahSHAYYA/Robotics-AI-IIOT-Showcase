/**
 * Wrapper around fetch that automatically includes the JWT token
 * and handles 401 responses by clearing session and redirecting.
 */

const SESSION_KEY = 'sf_session'
const LOGIN_PATH = '/'

export function getToken(): string | null {
  return localStorage.getItem(SESSION_KEY)
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
    localStorage.removeItem(SESSION_KEY)
    localStorage.removeItem('sf_role')
    window.location.href = LOGIN_PATH
    throw new Error('Session expired')
  }

  return response
}
