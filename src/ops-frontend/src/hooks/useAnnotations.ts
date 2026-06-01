import { useState, useCallback, useEffect, useRef } from 'react'
import type { Annotation, AnnotationFilter } from '../types/annotations'

const STORAGE_KEY = 'factoryAnnotations'
const CHANNEL_NAME = 'factory-annotations'

function generateId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return Date.now().toString(36) + Math.random().toString(36).slice(2)
  }
}

function loadAnnotations(): Annotation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch { /* ignore */ }
  return []
}

function saveAnnotations(annotations: Annotation[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(annotations))
}

export default function useAnnotations() {
  const [annotations, setAnnotations] = useState<Annotation[]>(loadAnnotations)
  const [filter, setFilterState] = useState<AnnotationFilter>('all')
  const channelRef = useRef<BroadcastChannel | null>(null)
  const mountedRef = useRef(true)

  // Set up BroadcastChannel
  useEffect(() => {
    mountedRef.current = true
    try {
      const channel = new BroadcastChannel(CHANNEL_NAME)
      channelRef.current = channel

      channel.onmessage = (event: MessageEvent) => {
        if (!mountedRef.current) return
        const incoming: Annotation[] = event.data
        if (!Array.isArray(incoming)) return

        setAnnotations((prev) => {
          // Merge: last-write-wins by createdAt timestamp
          const merged = new Map<string, Annotation>()
          for (const a of prev) merged.set(a.id, a)
          for (const a of incoming) {
            const existing = merged.get(a.id)
            if (!existing || new Date(a.createdAt) >= new Date(existing.createdAt)) {
              merged.set(a.id, a)
            }
          }
          return Array.from(merged.values())
        })
      }
    } catch {
      // BroadcastChannel not supported — cross-tab sync unavailable
    }

    return () => {
      mountedRef.current = false
      if (channelRef.current) {
        channelRef.current.close()
        channelRef.current = null
      }
    }
  }, [])

  // Persist to localStorage and broadcast on every change
  const broadcast = useCallback((updated: Annotation[]) => {
    saveAnnotations(updated)
    if (channelRef.current) {
      try {
        channelRef.current.postMessage(updated)
      } catch { /* ignore */ }
    }
  }, [])

  const addAnnotation = useCallback((annotation: Omit<Annotation, 'id' | 'createdAt'>) => {
    const newAnnotation: Annotation = {
      ...annotation,
      id: generateId(),
      createdAt: new Date().toISOString(),
    }
    setAnnotations((prev) => {
      const updated = [...prev, newAnnotation]
      broadcast(updated)
      return updated
    })
  }, [broadcast])

  const updateAnnotation = useCallback((id: string, updates: Partial<Omit<Annotation, 'id' | 'createdAt'>>) => {
    setAnnotations((prev) => {
      const updated = prev.map((a) =>
        a.id === id ? { ...a, ...updates, createdAt: new Date().toISOString() } : a
      )
      broadcast(updated)
      return updated
    })
  }, [broadcast])

  const deleteAnnotation = useCallback((id: string) => {
    setAnnotations((prev) => {
      const updated = prev.filter((a) => a.id !== id)
      broadcast(updated)
      return updated
    })
  }, [broadcast])

  const setFilter = useCallback((f: AnnotationFilter) => {
    setFilterState(f)
  }, [])

  const clearAll = useCallback(() => {
    setAnnotations([])
    broadcast([])
  }, [broadcast])

  return {
    annotations,
    addAnnotation,
    updateAnnotation,
    deleteAnnotation,
    filter,
    setFilter,
    clearAll,
  }
}
