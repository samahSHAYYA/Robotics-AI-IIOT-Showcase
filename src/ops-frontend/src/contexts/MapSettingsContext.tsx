import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

export interface MapSettings {
  robotVisibility: Record<string, boolean>
  showTrajectories: boolean
  showTrails: boolean
  trailLength: number
  showLabels: boolean
  showBeacons: boolean
  showGlowRings: boolean
  showZoneLabels: boolean
  showGridLines: boolean
  robotColors: Record<string, string>
}

const DEFAULT_COLORS: Record<string, string> = {
  C3: '#3b82f6',
  W2: '#f59e0b',
  Q1: '#8b5cf6',
}

function loadSettings(): MapSettings {
  try {
    const raw = localStorage.getItem('mapSettings')
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        robotVisibility: { ...parsed.robotVisibility } as Record<string, boolean>,
        showTrajectories: !!parsed.showTrajectories,
        showTrails: !!parsed.showTrails,
        trailLength: typeof parsed.trailLength === 'number' ? parsed.trailLength : 20,
        showLabels: !!parsed.showLabels,
        showBeacons: !!parsed.showBeacons,
        showGlowRings: !!parsed.showGlowRings,
        showZoneLabels: !!parsed.showZoneLabels,
        showGridLines: !!parsed.showGridLines,
        robotColors: { ...DEFAULT_COLORS, ...parsed.robotColors } as Record<string, string>,
      }
    }
  } catch {
  }
  return defaultSettings()
}

function defaultSettings(): MapSettings {
  return {
    robotVisibility: { C3: true, W2: true, Q1: true },
    showTrajectories: true,
    showTrails: true,
    trailLength: 20,
    showLabels: true,
    showBeacons: true,
    showGlowRings: true,
    showZoneLabels: true,
    showGridLines: true,
    robotColors: { ...DEFAULT_COLORS },
  }
}

interface MapSettingsContextType {
  settings: MapSettings
  updateSetting: <K extends keyof MapSettings>(key: K, value: MapSettings[K]) => void
  resetSettings: () => void
}

const MapSettingsContext = createContext<MapSettingsContextType | null>(null)

export function MapSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<MapSettings>(loadSettings)

  const updateSetting = useCallback(<K extends keyof MapSettings>(key: K, value: MapSettings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value }
      localStorage.setItem('mapSettings', JSON.stringify(next))
      return next
    })
  }, [])

  const resetSettings = useCallback(() => {
    const def = defaultSettings()
    setSettings(def)
    localStorage.setItem('mapSettings', JSON.stringify(def))
  }, [])

  return (
    <MapSettingsContext.Provider value={{ settings, updateSetting, resetSettings }}>
      {children}
    </MapSettingsContext.Provider>
  )
}

export function useMapSettings(): MapSettingsContextType {
  const ctx = useContext(MapSettingsContext)
  if (!ctx) throw new Error('useMapSettings must be used within MapSettingsProvider')
  return ctx
}
