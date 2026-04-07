'use server'

import { apiFetch, ApiError } from '@/lib/api-client'

export async function rotateKey(): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await apiFetch<{ kid: string; message: string }>('/api/v1/admin/keys/rotate', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    return { ok: true, message: `Rotated — new key: ${res.kid}` }
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, message: e.message }
    return { ok: false, message: 'Failed to rotate key' }
  }
}