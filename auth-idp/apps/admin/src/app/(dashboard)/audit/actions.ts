'use server'

import { apiFetch } from '@/lib/api-client'

interface AuditQuery {
  type?: string
  outcome?: string
  userId?: string
  from?: string
  to?: string
  limit: number
  offset: number
}

export interface AuditEvent {
  id: string
  type: string
  outcome: 'success' | 'failure'
  userId: string | null
  appId: string | null
  traceId: string | null
  ipAddress: string | null
  userAgent?: string | null
  metadata: Record<string, unknown>
  occurredAt: string
}

export async function queryAuditEvents(params: AuditQuery): Promise<{ events: AuditEvent[]; count: number }> {
  try {
    const qs = new URLSearchParams()
    if (params.type) qs.set('type', params.type)
    if (params.outcome) qs.set('outcome', params.outcome)
    if (params.userId) qs.set('userId', params.userId)
    if (params.from) qs.set('from', params.from)
    if (params.to) qs.set('to', params.to)
    qs.set('limit', String(params.limit))
    qs.set('offset', String(params.offset))

    const res = await apiFetch<{ events: AuditEvent[]; count: number }>(`/api/v1/admin/audit?${qs.toString()}`)
    return { events: res.events ?? [], count: res.count ?? 0 }
  } catch {
    return { events: [], count: 0 }
  }
}

export async function getAuditEvent(eventId: string): Promise<AuditEvent | null> {
  try {
    return await apiFetch<AuditEvent>(`/api/v1/admin/audit/${eventId}`)
  } catch {
    return null
  }
}