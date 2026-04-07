import { apiFetch } from '@/lib/api-client'

interface HealthResponse {
  status: string
  uptime: number
  timestamp: string
}

export default async function HealthPage() {
  let health: HealthResponse | null = null
  let error: string | null = null

  try {
    health = await apiFetch<HealthResponse>('/health')
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to reach API'
  }

  return (
    <div>
      <h1 className="text-lg font-semibold mb-4">API Health</h1>

      <div
        className="rounded-lg border p-6 max-w-md"
        style={{ borderColor: 'var(--color-border)' }}
      >
        {health ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: health.status === 'ok' ? 'var(--color-success)' : 'var(--color-danger)' }}
              />
              <span className="text-sm font-medium">
                {health.status === 'ok' ? 'API is healthy' : `Status: ${health.status}`}
              </span>
            </div>
            <div className="text-sm space-y-1" style={{ color: 'var(--color-text-secondary)' }}>
              <p>Uptime: {Math.floor(health.uptime / 3600)}h {Math.floor((health.uptime % 3600) / 60)}m</p>
              <p>Checked: {new Date(health.timestamp).toLocaleString()}</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--color-danger)' }} />
            <span className="text-sm font-medium">API unreachable</span>
            {error && (
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>{error}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}