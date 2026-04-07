import Link from 'next/link'
import { getDashboardStats } from './actions'

export default async function DashboardPage() {
  const stats = await getDashboardStats()

  return (
    <div>
      <h1 className="text-lg font-semibold mb-6">Dashboard</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total Users"
          value={String(stats.totalUsers)}
          href="/users"
          color="var(--color-accent)"
        />
        <StatCard
          label="Registered Apps"
          value={String(stats.totalApps)}
          href="/applications"
          color="var(--color-success)"
        />
        <StatCard
          label="Failures (24h)"
          value={String(stats.recentFailures)}
          href="/audit"
          color={stats.recentFailures > 0 ? 'var(--color-danger)' : 'var(--color-success)'}
        />
        <StatCard
          label="Active Key"
          value={stats.activeKey ? stats.activeKey.kid.substring(0, 12) : 'None'}
          subtext={stats.activeKey?.alg}
          href="/keys"
          color="var(--color-warning)"
        />
      </div>

      {/* Recent audit events */}
      <div className="rounded-lg border" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <h2 className="text-sm font-medium">Recent Activity</h2>
          <Link href="/audit" className="text-xs hover:underline" style={{ color: 'var(--color-accent)' }}>
            View all →
          </Link>
        </div>

        {stats.recentEvents.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            No audit events yet. Activity will appear here as users interact with the IDP.
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
            {stats.recentEvents.map((ev) => (
              <div key={ev.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: ev.outcome === 'success' ? 'var(--color-success)' : 'var(--color-danger)' }}
                  />
                  <div>
                    <span className="text-sm font-mono">{ev.type}</span>
                    {ev.userId && (
                      <span className="text-xs ml-2 font-mono" style={{ color: 'var(--color-text-secondary)' }}>
                        {ev.userId.substring(0, 8)}...
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-xs whitespace-nowrap" style={{ color: 'var(--color-text-secondary)' }}>
                  {formatRelativeTime(ev.occurredAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  subtext,
  href,
  color,
}: {
  label: string
  value: string
  subtext?: string
  href: string
  color: string
}) {
  return (
    <Link
      href={href}
      className="rounded-lg border p-5 transition-colors hover:border-current"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <p className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>
        {label}
      </p>
      <p className="text-2xl font-semibold" style={{ color }}>
        {value}
      </p>
      {subtext && (
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>
          {subtext}
        </p>
      )}
    </Link>
  )
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const seconds = Math.floor(diff / 1000)

  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}