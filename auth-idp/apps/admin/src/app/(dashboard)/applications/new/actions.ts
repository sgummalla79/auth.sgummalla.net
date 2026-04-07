'use server'

import { apiFetch, ApiError } from '@/lib/api-client'

export async function registerApplication(body: Record<string, unknown>): Promise<{ ok: boolean; error: string }> {
  try {
    await apiFetch('/api/v1/admin/applications', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    return { ok: true, error: '' }
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message }
    return { ok: false, error: 'Failed to register application' }
  }
}