import { useState, useEffect, useCallback } from 'react'
import { authFetchJson, authFetch } from '../utils/auth-fetch'
import type { Integration, IntegrationCreate, SyncLogEntry, AdapterInfo } from '../types/integration'

const API_BASE = '/api/v1'

export function useIntegrations() {
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [adapters, setAdapters] = useState<AdapterInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchIntegrations = useCallback(async () => {
    try {
      setLoading(true)
      const data = await authFetchJson(`${API_BASE}/integrations`)
      setIntegrations(Array.isArray(data) ? data : data.integrations ?? [])
      setError(null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchAdapters = useCallback(async () => {
    try {
      const data = await authFetchJson(`${API_BASE}/adapters`)
      setAdapters(Array.isArray(data) ? data : data.adapters ?? [])
    } catch {
      // Non-critical
    }
  }, [])

  const createIntegration = async (payload: IntegrationCreate): Promise<Integration> => {
    return authFetchJson(`${API_BASE}/integrations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  }

  const updateIntegration = async (id: number, payload: Partial<IntegrationCreate>): Promise<Integration> => {
    return authFetchJson(`${API_BASE}/integrations/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  }

  const deleteIntegration = async (id: number): Promise<void> => {
    await authFetch(`${API_BASE}/integrations/${id}`, { method: 'DELETE' })
  }

  const testConnection = async (id: number): Promise<{ success: boolean; message: string }> => {
    return authFetchJson(`${API_BASE}/integrations/${id}/test`, { method: 'POST' })
  }

  const fetchSyncLog = async (id: number, page = 1): Promise<{ entries: SyncLogEntry[]; total: number }> => {
    return authFetchJson(`${API_BASE}/integrations/${id}/sync-log?page=${page}`)
  }

  useEffect(() => { fetchIntegrations(); fetchAdapters() }, [fetchIntegrations, fetchAdapters])

  return {
    integrations, adapters, loading, error,
    refetch: fetchIntegrations,
    createIntegration, updateIntegration, deleteIntegration,
    testConnection, fetchSyncLog,
  }
}
