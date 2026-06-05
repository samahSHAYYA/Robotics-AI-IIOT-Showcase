import { useState } from 'react'
import { useI18n } from '../contexts/I18nContext'
import type { LoginResponse } from '../types/auth'

interface LoginPageProps {
  onLogin: (payload: LoginResponse) => void
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const { t } = useI18n()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [loginResult, setLoginResult] = useState<LoginResponse | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!username || !password) {
      setError(t('login.error.credentials'))
      return
    }
    setLoading(true)
    try {
      const resp = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      if (!resp.ok) {
        setError(t('login.error.invalid'))
        return
      }
      const data: LoginResponse = await resp.json()
      setLoginResult(data)
      // Brief delay to show the context summary, then proceed
      setTimeout(() => onLogin(data), 1500)
    } catch {
      setError(t('login.error.connection'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-bg">
        <div className="login-grid" />
        <div className="login-orbit">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="login-ring" style={{ animationDelay: `${i * 2}s` }} />
          ))}
        </div>
      </div>
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-logo">
          <svg width="48" height="48" viewBox="0 0 48 48">
            <circle cx="24" cy="24" r="22" fill="none" stroke="#3b82f6" strokeWidth="2" />
            <circle cx="24" cy="24" r="8" fill="#3b82f6" />
            <line x1="24" y1="4" x2="24" y2="14" stroke="#3b82f6" strokeWidth="2" />
            <line x1="24" y1="34" x2="24" y2="44" stroke="#3b82f6" strokeWidth="2" />
            <line x1="4" y1="24" x2="14" y2="24" stroke="#3b82f6" strokeWidth="2" />
            <line x1="34" y1="24" x2="44" y2="24" stroke="#3b82f6" strokeWidth="2" />
          </svg>
        </div>
        <h1 className="login-title">{t('login.title')}</h1>
        <p className="login-sub">{t('login.subtitle')}</p>
        {error && <div className="login-error">{error}</div>}
        {loginResult && (
          <div className="login-context-info">
            <div className="login-context-row">
              <span className="login-context-label">{t('login.role')}</span>
              <span className="login-context-value">{loginResult.role}</span>
            </div>
            {loginResult.tenant_name && (
              <div className="login-context-row">
                <span className="login-context-label">{t('org.name')}</span>
                <span className="login-context-value">{loginResult.tenant_name}</span>
              </div>
            )}
            {loginResult.factory_name && (
              <div className="login-context-row">
                <span className="login-context-label">{t('factory.name')}</span>
                <span className="login-context-value">{loginResult.factory_name}</span>
              </div>
            )}
            <div className="login-context-message">Access granted — entering control room...</div>
          </div>
        )}
        {!loginResult && (
          <>
            <div className="login-field">
              <label>{t('login.username')}</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                disabled={loading}
              />
            </div>
            <div className="login-field">
              <label>{t('login.password')}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="admin"
                disabled={loading}
              />
            </div>
            <button className="login-btn" type="submit" disabled={loading}>
              {loading ? t('login.loading') : t('login.signIn')}
            </button>
          </>
        )}
      </form>
    </div>
  )
}
