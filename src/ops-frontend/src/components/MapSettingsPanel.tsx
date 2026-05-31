import { useMapSettings } from '../contexts/MapSettingsContext'

const ROBOT_NAMES: Record<string, string> = {
  C3: 'C3 Humanoid',
  W2: 'W2 Welder Arm',
  Q1: 'Q1 Inspector',
}

const STATUS_LEGEND: Array<{ label: string; color: string }> = [
  { label: 'Moving / Active', color: '#3b82f6' },
  { label: 'Idle', color: '#6b7280' },
  { label: 'Error / Critical', color: '#ef4444' },
  { label: 'Maintenance / Warning', color: '#eab308' },
  { label: 'Offline', color: '#6b7280' },
]

interface MapSettingsPanelProps {
  onClose: () => void
}

export default function MapSettingsPanel({ onClose }: MapSettingsPanelProps) {
  const { settings, updateSetting, resetSettings, resetHeatmap } = useMapSettings()

  const toggleRobot = (id: string) => {
    updateSetting('robotVisibility', {
      ...settings.robotVisibility,
      [id]: !settings.robotVisibility[id],
    })
  }

  const setColor = (id: string, color: string) => {
    updateSetting('robotColors', {
      ...settings.robotColors,
      [id]: color,
    })
  }

  return (
    <div className="map-settings-overlay" onClick={onClose}>
      <div className="map-settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="map-settings-header">
          <h4>Map Settings</h4>
          <button className="map-settings-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="map-settings-body">
          <section className="map-settings-section">
            <h5>Robot Visibility</h5>
            {Object.keys(settings.robotVisibility).map((id) => (
              <label key={id} className="map-settings-row">
                <input
                  type="checkbox"
                  checked={settings.robotVisibility[id]}
                  onChange={() => toggleRobot(id)}
                />
                <span
                  className="map-settings-swatch"
                  style={{ background: settings.robotColors[id] ?? '#6b7280' }}
                />
                {ROBOT_NAMES[id] ?? id}
              </label>
            ))}
          </section>

          <section className="map-settings-section">
            <h5>Robot Colors</h5>
            {Object.keys(settings.robotColors).map((id) => (
              <label key={id} className="map-settings-row">
                <span>{ROBOT_NAMES[id] ?? id}</span>
                <input
                  type="color"
                  value={settings.robotColors[id] ?? '#3b82f6'}
                  onChange={(e) => setColor(id, e.target.value)}
                  className="map-settings-color"
                />
              </label>
            ))}
          </section>

          <section className="map-settings-section">
            <h5>Overlays</h5>
            <label className="map-settings-row">
              <input
                type="checkbox"
                checked={settings.showTrajectories}
                onChange={() => updateSetting('showTrajectories', !settings.showTrajectories)}
              />
              Show Trajectories
            </label>
            <label className="map-settings-row">
              <input
                type="checkbox"
                checked={settings.showTrails}
                onChange={() => updateSetting('showTrails', !settings.showTrails)}
              />
              Show Trails
            </label>
            {settings.showTrails && (
              <div className="map-settings-row">
                <span>Trail Length</span>
                <input
                  type="range"
                  min={5}
                  max={50}
                  value={settings.trailLength}
                  onChange={(e) => updateSetting('trailLength', Number(e.target.value))}
                  className="map-settings-slider"
                />
                <span className="map-settings-value">{settings.trailLength}</span>
              </div>
            )}
            <label className="map-settings-row">
              <input
                type="checkbox"
                checked={settings.showLabels}
                onChange={() => updateSetting('showLabels', !settings.showLabels)}
              />
              Show Labels
            </label>
            <label className="map-settings-row">
              <input
                type="checkbox"
                checked={settings.showBeacons}
                onChange={() => updateSetting('showBeacons', !settings.showBeacons)}
              />
              Show Radar Beacons
            </label>
            <label className="map-settings-row">
              <input
                type="checkbox"
                checked={settings.showGlowRings}
                onChange={() => updateSetting('showGlowRings', !settings.showGlowRings)}
              />
              Show Glow Rings
            </label>
            <label className="map-settings-row">
              <input
                type="checkbox"
                checked={settings.showZoneLabels}
                onChange={() => updateSetting('showZoneLabels', !settings.showZoneLabels)}
              />
              Show Zone Labels
            </label>
            <label className="map-settings-row">
              <input
                type="checkbox"
                checked={settings.showGridLines}
                onChange={() => updateSetting('showGridLines', !settings.showGridLines)}
              />
              Show Grid Lines
            </label>
            <label className="map-settings-row">
              <input
                type="checkbox"
                checked={settings.showHeatmap}
                onChange={() => updateSetting('showHeatmap', !settings.showHeatmap)}
              />
              Show Heatmap
            </label>
            {settings.showHeatmap && (
              <div className="map-settings-row" style={{ justifyContent: 'flex-end' }}>
                <button
                  className="map-settings-reset"
                  style={{ width: 'auto', padding: '0.25rem 0.6rem', fontSize: '0.65rem' }}
                  onClick={resetHeatmap}
                >
                  Reset Heatmap
                </button>
              </div>
            )}
          </section>

          <section className="map-settings-section">
            <h5>Status Color Legend</h5>
            {STATUS_LEGEND.map((item) => (
              <div key={item.label} className="map-settings-row">
                <span className="map-settings-swatch" style={{ background: item.color }} />
                <span>{item.label}</span>
              </div>
            ))}
          </section>
        </div>

        <div className="map-settings-footer">
          <button className="map-settings-reset" onClick={resetSettings}>
            Reset to Defaults
          </button>
        </div>
      </div>
    </div>
  )
}

interface ContextMenuRobot {
  robot_id: string
  name: string
  status: string
}

export function ContextMenu({
  x,
  y,
  robot,
  onOpenSettings,
  onRobotStart,
  onRobotStop,
  onClose,
}: {
  x: number
  y: number
  robot?: ContextMenuRobot | null
  onOpenSettings: () => void
  onRobotStart?: (id: string) => void
  onRobotStop?: (id: string) => void
  onClose: () => void
}) {
  return (
    <>
      <div className="map-context-overlay" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }} />
      <div
        className="map-context-menu"
        style={{ left: x, top: y }}
      >
        {robot && (
          <>
            <div className="map-context-item" style={{ fontWeight: 700, cursor: 'default', color: 'var(--text)' }}>
              {robot.name}
            </div>
            <div className="map-context-item" style={{ fontSize: '0.65rem', cursor: 'default', color: 'var(--text2)' }}>
              Status: {robot.status}
            </div>
            <div className="map-context-sep" />
            {robot.status !== 'moving' && robot.status !== 'active' ? (
              <button className="map-context-item map-context-item--start" onClick={() => { onRobotStart?.(robot.robot_id); onClose() }}>
                ▶ Start Robot
              </button>
            ) : (
              <button className="map-context-item map-context-item--stop" onClick={() => { onRobotStop?.(robot.robot_id); onClose() }}>
                ■ Stop Robot
              </button>
            )}
            <div className="map-context-sep" />
          </>
        )}
        <button className="map-context-item" onClick={() => { onOpenSettings(); onClose() }}>
          Legend & Settings
        </button>
      </div>
    </>
  )
}
