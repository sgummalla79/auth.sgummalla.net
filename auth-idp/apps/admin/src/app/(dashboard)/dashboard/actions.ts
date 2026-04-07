'use server'

import { apiFetch } from '@/lib/api-client'

interface DashboardStats {
  totalUsers: number
  totalApps: number
  recentFailures: number
  activeKey: { kid: string; alg: string } | null
  recentEvents: Array<{
    id: string
    type: string
    outcome: string
    userId: string | null
    occurredAt: string
  }>
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const stats: DashboardStats = {
    totalUsers: 0,
    totalApps: 0,
    recentFailures: 0,
    activeKey: null,
    recentEvents: [],
  }

  // Fetch in parallel
  const [usersRes, appsRes, failuresRes, jwksRes, eventsRes] = await Promise.allSettled([
    apiFetch<{ users: unknown[]; limit: number; offset: number }>('/api/v1/admin/users?limit=1&offset=0'),
    apiFetch<unknown[] | { applications?: unknown[] }>('/api/v1/admin/applications'),
    apiFetch<{ events: unknown[]; count: number }>('/api/v1/admin/audit?outcome=failure&limit=1'),
    apiFetch<{ keys: Array<{ kid: string; alg: string }> }>('/.well-known/jwks.json'),
    apiFetch<{ events: Array<{ id: string; type: string; outcome: string; userId: string | null; occurredAt: string }> }>('/api/v1/admin/audit?limit=10'),
  ])

  // Total users — we get the count from a small query
  // Since there's no count endpoint, we do a broader query
  if (usersRes.status === 'fulfilled') {
    // Fetch actual count with a larger limit
    try {
      const full = await apiFetch<{ users: unknown[] }>('/api/v1/admin/users?limit=100&offset=0')
      stats.totalUsers = full.users?.length ?? 0
    } catch {
      stats.totalUsers = usersRes.value.users?.length ?? 0
    }
  }

  // Total apps
  if (appsRes.status === 'fulfilled') {
    const data = appsRes.value
    if (Array.isArray(data)) {
      stats.totalApps = data.length
    } else if (data && typeof data === 'object' && 'applications' in data) {
      stats.totalApps = (data as { applications: unknown[] }).applications?.length ?? 0
    }
  }

  // Recent failures (last 24h)
  if (failuresRes.status === 'fulfilled') {
    // Query failures from last 24 hours
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const res = await apiFetch<{ events: unknown[]; count: number }>(`/api/v1/admin/audit?outcome=failure&from=${since}&limit=100`)
      stats.recentFailures = res.events?.length ?? 0
    } catch {
      stats.recentFailures = failuresRes.value.count ?? 0
    }
  }

  // Active key
  if (jwksRes.status === 'fulfilled') {
    const key = jwksRes.value.keys?.[0]
    if (key) stats.activeKey = { kid: key.kid, alg: key.alg }
  }

  // Recent events
  if (eventsRes.status === 'fulfilled') {
    stats.recentEvents = eventsRes.value.events ?? []
  }

  return stats
}