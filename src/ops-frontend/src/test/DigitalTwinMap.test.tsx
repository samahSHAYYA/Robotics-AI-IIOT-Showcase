import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import DigitalTwinMap from '../components/DigitalTwinMap'
import { MapSettingsProvider } from '../contexts/MapSettingsContext'
import type { RobotStatus } from '../types/telemetry'
import type { ReactNode } from 'react'

const mockRobots: RobotStatus[] = [
  {
    robot_id: 'C3',
    name: 'C3',
    status: 'active',
    uptime_pct: 99.0,
    current_task: 'welding',
    pose: { x: 5, y: 3, theta: 0 },
  },
  {
    robot_id: 'W2',
    name: 'W2',
    status: 'moving',
    uptime_pct: 97.5,
    current_task: 'transport',
    pose: { x: 7, y: 4, theta: 1.2 },
  },
]

function Wrapper({ children }: { children: ReactNode }) {
  return <MapSettingsProvider>{children}</MapSettingsProvider>
}

describe('DigitalTwinMap', () => {
  it('renders canvas element when robots are provided', () => {
    const { container } = render(
      <Wrapper>
        <DigitalTwinMap robots={mockRobots} />
      </Wrapper>,
    )

    const canvas = container.querySelector('canvas')
    expect(canvas).toBeInTheDocument()
    expect(container.querySelector('.digital-twin')).toBeInTheDocument()
  })

  it('shows heading "Factory Floor"', () => {
    render(
      <Wrapper>
        <DigitalTwinMap robots={mockRobots} />
      </Wrapper>,
    )

    expect(screen.getByText('Factory Floor')).toBeInTheDocument()
  })

  it('shows empty state when robots array is empty', () => {
    render(
      <Wrapper>
        <DigitalTwinMap robots={[]} />
      </Wrapper>,
    )

    expect(screen.getByText('Waiting for robot telemetry...')).toBeInTheDocument()
    expect(screen.queryByText('Factory Floor')).toBeInTheDocument()
  })

  it('shows error banner when error is provided', () => {
    render(
      <Wrapper>
        <DigitalTwinMap robots={[]} error="Map data unavailable" />
      </Wrapper>,
    )

    expect(screen.getByText('Map data unavailable')).toBeInTheDocument()
    const errorBanner = document.querySelector('.error-banner')
    expect(errorBanner).toBeInTheDocument()
  })

  it('renders timeline bar with live label when robots present', () => {
    render(
      <Wrapper>
        <DigitalTwinMap robots={mockRobots} />
      </Wrapper>,
    )

    expect(screen.getByText('LIVE')).toBeInTheDocument()
  })
})
