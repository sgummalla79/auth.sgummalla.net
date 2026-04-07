'use server'

import { apiFetch, ApiError } from '@/lib/api-client'

interface SearchParams {
  email: string
  status: string
  limit: number
  offset: number
}

export async function searchUsers(params: SearchParams) {
  try {
    const qs = new URLSearchParams()
    if (params.email) qs.set('email', params.email)
    if (params.status) qs.set('status', params.status)
    qs.set('limit', String(params.limit))
    qs.set('offset', String(params.offset))

    const res = await apiFetch<{ users: any[] }>(`/api/v1/admin/users?${qs.toString()}`)
    return { users: res.users ?? [] }
  } catch {
    return { users: [] }
  }
}

export async function forceLogout(userId: string): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await apiFetch<{ message: string }>(`/api/v1/admin/sessions/revoke/${userId}`, {
      method: 'POST',
    })
    return { ok: true, message: res.message }
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, message: e.message }
    return { ok: false, message: 'Failed to force logout' }
  }
}