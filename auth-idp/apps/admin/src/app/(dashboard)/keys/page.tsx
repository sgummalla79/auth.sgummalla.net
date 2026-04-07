import { apiFetch } from '@/lib/api-client'
import { KeyActions } from './KeyActions'

export default async function KeysPage() {
  let jwks: { keys: Array<{ kid: string; alg: string; kty: string; use: string }> } | null = null
  let error: string | null = null

  try {
    jwks = await apiFetch('/well-known/jwks.json')
  } catch (e) {
    // Try alternate path
    try {
      jwks = await apiFetch('/.well-known/jwks.json')
    } catch (e2) {
      error = e2 instanceof Error ? e2.message : 'Failed to fetch keys'
    }
  }

  const activeKey = jwks?.keys?.[0] ?? null

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold">Key Management</h1>
        <KeyActions />
      </div>

      {error && (
        <div className="px-4 py-3 rounded-md text-sm border mb-4"
style={{ background: 'var(--color-error-bg)', color: 'var(--color-error-text)', borderColor: 'var(--color-error-border)' }}>
          {error}
        </div>
      )}

      {activeKey ? (
        <div className="rounded-lg border p-5 max-w-lg" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--color-success)' }} />
            <span className="text-sm font-medium">Active Signing Key</span>
          </div>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt style={{ color: 'var(--color-text-secondary)' }}>Key ID</dt>
              <dd className="font-mono text-xs">{activeKey.kid}</dd>
            </div>
            <div className="flex justify-between">
              <dt style={{ color: 'var(--color-text-secondary)' }}>Algorithm</dt>
              <dd>{activeKey.alg}</dd>
            </div>
            <div className="flex justify-between">
              <dt style={{ color: 'var(--color-text-secondary)' }}>Type</dt>
              <dd>{activeKey.kty}</dd>
            </div>
            <div className="flex justify-between">
              <dt style={{ color: 'var(--color-text-secondary)' }}>Use</dt>
              <dd>{activeKey.use}</dd>
            </div>
          </dl>
        </div>
      ) : (
        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>No active signing key found.</p>
      )}

      {jwks && jwks.keys.length > 1 && (
        <div className="mt-6">
          <h2 className="text-sm font-medium mb-3">All Keys ({jwks.keys.length})</h2>
          <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--color-bg)' }}>
                  <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--color-text-secondary)' }}>KID</th>
                  <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--color-text-secondary)' }}>Algorithm</th>
                  <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--color-text-secondary)' }}>Type</th>
                </tr>
              </thead>
              <tbody>
                {jwks.keys.map((k) => (
                  <tr key={k.kid} className="border-t" style={{ borderColor: 'var(--color-border)' }}>
                    <td className="px-4 py-2 font-mono text-xs">{k.kid}</td>
                    <td className="px-4 py-2">{k.alg}</td>
                    <td className="px-4 py-2">{k.kty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}