import { AuthProvider } from './contexts/AuthContext'
import { TelemetryProvider } from './contexts/TelemetryContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { I18nProvider } from './contexts/I18nContext'
import DashboardLayout from './components/DashboardLayout'
import './App.css'
import './themes/light.css'

export default function App() {
  const kioskMode = new URLSearchParams(window.location.search).get('kiosk') === 'true'

  return (
    <ThemeProvider>
      <I18nProvider>
        <AuthProvider kioskMode={kioskMode}>
          <TelemetryProvider>
            <DashboardLayout />
          </TelemetryProvider>
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  )
}
