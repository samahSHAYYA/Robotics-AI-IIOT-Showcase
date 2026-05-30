import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import KpiBoard from '../components/KpiBoard'
import type { TelemetrySnapshot } from '../types/telemetry'

const mockTelemetry: TelemetrySnapshot = {
  throughput: 4200,
  defect_rate_pct: 1.5,
  robot_uptime_pct: 98.7,
  robots: [
    {
      robot_id: 'C3',
      name: 'C3',
      status: 'active',
      uptime_pct: 99.0,
      current_task: 'welding',
      pose: { x: 5, y: 3, theta: 0 },
    },
  ],
  alerts: [],
  events_consumed: 10,
  predictions_consumed: 3,
  last_update: new Date().toISOString(),
}

describe('KpiBoard', () => {
  it('renders gauge cards when telemetry is provided', () => {
    render(<KpiBoard telemetry={mockTelemetry} />)

    expect(screen.getByText('Throughput')).toBeInTheDocument()
    expect(screen.getByText('Defect Rate')).toBeInTheDocument()
    expect(screen.getByText('Robot Uptime')).toBeInTheDocument()
    expect(screen.getByText('Active Robots')).toBeInTheDocument()
  })

  it('shows gauge values from telemetry', () => {
    render(<KpiBoard telemetry={mockTelemetry} />)

    // Throughput value: 4200 units
    expect(screen.getByText('4200.0')).toBeInTheDocument()
    // Defect Rate: 1.5%
    expect(screen.getByText('1.5')).toBeInTheDocument()
    // Uptime: 98.7%
    expect(screen.getByText('98.7')).toBeInTheDocument()
    // Active robots: 1
    expect(screen.getByText('1.0')).toBeInTheDocument()
  })

  it('renders skeleton state when telemetry is undefined', () => {
    const { container } = render(<KpiBoard />)

    // Skeleton board should render 4 skeleton cards
    const skeletonCards = container.querySelectorAll('.skeleton-card')
    expect(skeletonCards.length).toBe(4)
  })

  it('shows error banner with message when error is provided', () => {
    render(<KpiBoard error="Failed to fetch telemetry" />)

    expect(screen.getByText('Failed to fetch telemetry')).toBeInTheDocument()
    const errorBanner = document.querySelector('.error-banner')
    expect(errorBanner).toBeInTheDocument()
  })

  it('shows retry button when onRetry is provided with error', () => {
    const onRetry = vi.fn()
    render(<KpiBoard error="Connection lost" onRetry={onRetry} />)

    const retryBtn = screen.getByText('Retry')
    expect(retryBtn).toBeInTheDocument()
    retryBtn.click()
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('does not show retry button when onRetry is omitted', () => {
    render(<KpiBoard error="Something broke" />)

    expect(screen.queryByText('Retry')).not.toBeInTheDocument()
  })
})
