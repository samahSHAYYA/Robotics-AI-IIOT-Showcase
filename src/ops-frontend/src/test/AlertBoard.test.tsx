import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import AlertBoard from '../components/AlertBoard'
import type { Alert, Event } from '../types/telemetry'

const mockAlerts: Alert[] = [
  {
    severity: 'critical',
    message: 'Robot C3 temperature exceeds threshold',
    timestamp: '2026-05-30T10:00:00Z',
  },
  {
    severity: 'warning',
    message: 'Maintenance due for W2',
    timestamp: '2026-05-30T09:55:00Z',
  },
  {
    severity: 'info',
    message: 'Production line started',
    timestamp: '2026-05-30T09:50:00Z',
  },
]

const mockEvents: Event[] = [
  {
    id: 'evt-1',
    type: 'telemetry',
    subtype: 'temperature',
    severity: 'warning',
    robot_id: 'C3',
    timestamp: '2026-05-30T09:45:00Z',
    value: 85,
    unit: '°C',
  },
]

// Mock the useAlertNotifications hook to avoid browser-notification side-effects
vi.mock('../hooks/useAlertNotifications', () => ({
  default: () => ({
    notifEnabled: false,
    setNotifEnabled: vi.fn(),
  }),
}))

describe('AlertBoard', () => {
  it('renders alerts with severity badges', () => {
    render(<AlertBoard alerts={mockAlerts} events={[]} />)

    expect(screen.getByText('Robot C3 temperature exceeds threshold')).toBeInTheDocument()
    expect(screen.getByText('Maintenance due for W2')).toBeInTheDocument()
    expect(screen.getByText('Production line started')).toBeInTheDocument()
  })

  it('renders severity labels in the legend', () => {
    render(<AlertBoard alerts={mockAlerts} events={[]} />)

    expect(screen.getByText('Critical')).toBeInTheDocument()
    expect(screen.getByText('Warning')).toBeInTheDocument()
    expect(screen.getByText('Info')).toBeInTheDocument()
    expect(screen.getByText('Healthy')).toBeInTheDocument()
  })

  it('shows empty state when no alerts or events', () => {
    render(<AlertBoard alerts={[]} events={[]} />)

    expect(screen.getByText('No active alerts')).toBeInTheDocument()
  })

  it('shows error banner when error is provided', () => {
    render(<AlertBoard alerts={[]} events={[]} error="Failed to load alerts" />)

    expect(screen.getByText('Failed to load alerts')).toBeInTheDocument()
  })

  it('renders events alongside alerts', () => {
    render(<AlertBoard alerts={mockAlerts} events={mockEvents} />)

    // The subtype (temperature) should appear for the event
    expect(screen.getByText('temperature')).toBeInTheDocument()
  })

  it('has an alert region with aria-live polite', () => {
    render(<AlertBoard alerts={mockAlerts} events={[]} />)

    const logRegion = document.querySelector('[role="log"]')
    expect(logRegion).toBeInTheDocument()
    expect(logRegion).toHaveAttribute('aria-live', 'polite')
  })

  it('renders heading', () => {
    render(<AlertBoard alerts={mockAlerts} events={[]} />)

    expect(screen.getByText('Alerts & Events')).toBeInTheDocument()
  })
})
