import { useState } from 'react'

interface LoginPageProps {
  onLogin: (role: string) => void
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('admin')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!username || !password) {
      setError('Enter credentials')
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
        setError('Invalid credentials')
        return
      }
      const data = await resp.json()
      localStorage.setItem('sf_session', data.access_token)
      localStorage.setItem('sf_role', role)
      onLogin(role)
    } catch {
      setError('Connection error')
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
        <h1 className="login-title">Smart Factory</h1>
        <p className="login-sub">Industrial Humanoid Robotics IIoT</p>
        {error && <div className="login-error">{error}</div>}
        <div className="login-field">
          <label>Username</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="admin"
            disabled={loading}
          />
        </div>
        <div className="login-field">
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="admin"
            disabled={loading}
          />
        </div>
        <div className="login-field">
          <label>Role</label>
          <select
            className="login-select"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            disabled={loading}
          >
            <option value="admin">Admin</option>
            <option value="operator">Operator</option>
            <option value="viewer">Viewer</option>
          </select>
        </div>
        <button className="login-btn" type="submit" disabled={loading}>
          {loading ? 'Authenticating...' : 'Enter Control Room'}
        </button>
      </form>
    </div>
  )
}
