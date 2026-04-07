'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { registerApplication } from './actions'

type Protocol = 'saml' | 'oidc' | 'jwt'

export default function RegisterAppPage() {
  const router = useRouter()
  const [protocol, setProtocol] = useState<Protocol>('saml')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const form = new FormData(e.currentTarget)
    const name = form.get('name') as string
    const description = form.get('description') as string

    let body: Record<string, unknown> = { name, protocol, description: description || undefined }

    if (protocol === 'saml') {
      body.saml = {
        entityId: form.get('entityId') as string,
        acsUrl: form.get('acsUrl') as string,
        sloUrl: (form.get('sloUrl') as string) || undefined,
      }
    } else if (protocol === 'oidc') {
      body.oidc = {
        redirectUris: (form.get('redirectUris') as string).split('\n').map((s) => s.trim()).filter(Boolean),
        grantTypes: (form.get('grantTypes') as string).split(',').map((s) => s.trim()).filter(Boolean),
        responseTypes: (form.get('responseTypes') as string || 'code').split(',').map((s) => s.trim()).filter(Boolean),
        scopes: (form.get('scopes') as string || 'openid profile email').split(' ').filter(Boolean),
        pkceRequired: form.get('pkceRequired') === 'on',
      }
    } else {
      body.jwt = {
        publicKey: (form.get('publicKey') as string) || undefined,
        certThumbprint: (form.get('certThumbprint') as string) || undefined,
        audience: (form.get('audience') as string || '').split(',').map((s) => s.trim()).filter(Boolean),
        tokenLifetime: Number(form.get('tokenLifetime')) || 3600,
      }
    }

    const result = await registerApplication(body)

    if (result.ok) {
      router.push('/applications')
      router.refresh()
    } else {
      setError(result.error)
      setLoading(false)
    }
  }

  const tabStyle = (p: Protocol) => ({
    padding: '6px 16px',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 500 as const,
    cursor: 'pointer' as const,
    background: protocol === p ? 'var(--color-accent)' : 'transparent',
    color: protocol === p ? '#fff' : 'var(--color-text-secondary)',
    border: protocol === p ? 'none' : '1px solid var(--color-border)',
  })

  return (
    <div className="max-w-lg">
      <Link href="/applications" className="text-sm hover:underline" style={{ color: 'var(--color-accent)' }}>← Back</Link>

      <h1 className="text-lg font-semibold mt-4 mb-6">Register Application</h1>

      {error && (
        <div className="px-4 py-3 rounded-md text-sm border mb-4"
style={{ background: 'var(--color-error-bg)', color: 'var(--color-error-text)', borderColor: 'var(--color-error-border)' }}>{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium mb-1.5">Application Name</label>
          <input name="name" required className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500" style={{ borderColor: 'var(--color-border)' }} placeholder="e.g. Salesforce CRM" />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium mb-1.5">Description (optional)</label>
          <input name="description" className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500" style={{ borderColor: 'var(--color-border)' }} placeholder="Short description" />
        </div>

        {/* Protocol tabs */}
        <div>
          <label className="block text-sm font-medium mb-2">Protocol</label>
          <div className="flex gap-2">
            <button type="button" onClick={() => setProtocol('saml')} style={tabStyle('saml')}>SAML 2.0</button>
            <button type="button" onClick={() => setProtocol('oidc')} style={tabStyle('oidc')}>OIDC / OAuth</button>
            <button type="button" onClick={() => setProtocol('jwt')} style={tabStyle('jwt')}>JWT / Cert</button>
          </div>
        </div>

        {/* SAML fields */}
        {protocol === 'saml' && (
          <div className="space-y-4 rounded-lg border p-4" style={{ borderColor: 'var(--color-border)' }}>
            <div>
              <label className="block text-sm font-medium mb-1.5">SP Entity ID</label>
              <input name="entityId" required className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500" style={{ borderColor: 'var(--color-border)' }} placeholder="https://sp.example.com/metadata" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">ACS URL</label>
              <input name="acsUrl" required className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500" style={{ borderColor: 'var(--color-border)' }} placeholder="https://sp.example.com/saml/acs" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">SLO URL (optional)</label>
              <input name="sloUrl" className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500" style={{ borderColor: 'var(--color-border)' }} placeholder="https://sp.example.com/saml/slo" />
            </div>
          </div>
        )}

        {/* OIDC fields */}
        {protocol === 'oidc' && (
          <div className="space-y-4 rounded-lg border p-4" style={{ borderColor: 'var(--color-border)' }}>
            <div>
              <label className="block text-sm font-medium mb-1.5">Redirect URIs (one per line)</label>
              <textarea name="redirectUris" required rows={3} className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500 font-mono" style={{ borderColor: 'var(--color-border)' }} placeholder={"https://app.example.com/callback\nhttps://app.example.com/auth/callback"} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Grant Types (comma-separated)</label>
              <input name="grantTypes" required className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500" style={{ borderColor: 'var(--color-border)' }} defaultValue="authorization_code" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Response Types (comma-separated)</label>
              <input name="responseTypes" className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500" style={{ borderColor: 'var(--color-border)' }} defaultValue="code" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Scopes (space-separated)</label>
              <input name="scopes" className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500" style={{ borderColor: 'var(--color-border)' }} defaultValue="openid profile email" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="pkceRequired" defaultChecked />
              Require PKCE
            </label>
          </div>
        )}

        {/* JWT fields */}
        {protocol === 'jwt' && (
          <div className="space-y-4 rounded-lg border p-4" style={{ borderColor: 'var(--color-border)' }}>
            <div>
              <label className="block text-sm font-medium mb-1.5">Client Public Key (PEM)</label>
              <textarea name="publicKey" rows={4} className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500 font-mono" style={{ borderColor: 'var(--color-border)' }} placeholder="-----BEGIN PUBLIC KEY-----" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Certificate Thumbprint (SHA-1, for mTLS)</label>
              <input name="certThumbprint" className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500 font-mono" style={{ borderColor: 'var(--color-border)' }} placeholder="a1b2c3d4e5..." />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Audience (comma-separated)</label>
              <input name="audience" className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500" style={{ borderColor: 'var(--color-border)' }} placeholder="https://api.example.com" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Token Lifetime (seconds)</label>
              <input name="tokenLifetime" type="number" className="w-full px-3 py-2 border rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500" style={{ borderColor: 'var(--color-border)' }} defaultValue={3600} />
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 rounded-md text-sm font-medium text-white disabled:opacity-50"
          style={{ background: 'var(--color-accent)' }}
        >
          {loading ? 'Registering...' : 'Register Application'}
        </button>
      </form>
    </div>
  )
}