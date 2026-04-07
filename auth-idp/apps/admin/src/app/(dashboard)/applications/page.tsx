import Link from 'next/link'
import { apiFetch } from '@/lib/api-client'

interface Application {
  id: string
  name: string
  slug: string
  protocol: 'saml' | 'oidc' | 'jwt'
  description?: string
  createdAt: string
}

export default async function ApplicationsPage() {
  let apps: Application[] = []
  let error: string | null = null

  try {
    const res = await apiFetch<Application[] | { applications: Application[] }>('/api/v1/admin/applications')
    apps = Array.isArray(res) ? res : res.applications ?? []
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to fetch applications'
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold">Applications</h1>
        <Link
          href="/applications/new"
          className="px-3 py-1.5 rounded-md text-sm font-medium text-white"
          style={{ background: 'var(--color-accent)' }}
        >
          Register App
        </Link>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-md text-sm border mb-4"
style={{ background: 'var(--color-error-bg)', color: 'var(--color-error-text)', borderColor: 'var(--color-error-border)' }}>
          {error}
        </div>
      )}

      {apps.length === 0 && !error ? (
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          No applications registered yet. Click "Register App" to get started.
        </p>
      ) : (
        <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--color-bg)' }}>
                <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--color-text-secondary)' }}>Name</th>
                <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--color-text-secondary)' }}>Protocol</th>
                <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--color-text-secondary)' }}>Slug</th>
                <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--color-text-secondary)' }}>Created</th>
              </tr>
            </thead>
            <tbody>
              {apps.map((app) => (
                <tr key={app.id} className="border-t" style={{ borderColor: 'var(--color-border)' }}>
                  <td className="px-4 py-2.5">
                    <Link href={`/applications/${app.id}`} className="font-medium hover:underline" style={{ color: 'var(--color-accent)' }}>
                      {app.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className="inline-block px-2 py-0.5 rounded text-xs font-medium"
                      style={{
                        background: app.protocol === 'saml' ? '#EEEDFE' : app.protocol === 'oidc' ? '#E1F5EE' : '#FEF3C7',
                        color: app.protocol === 'saml' ? '#3C3489' : app.protocol === 'oidc' ? '#085041' : '#92400E',
                      }}
                    >
                      {app.protocol.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs" style={{ color: 'var(--color-text-secondary)' }}>{app.slug}</td>
                  <td className="px-4 py-2.5" style={{ color: 'var(--color-text-secondary)' }}>{new Date(app.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}