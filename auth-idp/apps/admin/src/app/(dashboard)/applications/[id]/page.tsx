import { apiFetch } from '@/lib/api-client'
import Link from 'next/link'

interface AppDetail {
  id: string
  name: string
  slug: string
  protocol: string
  description?: string
  createdAt: string
  samlConfig?: {
    entityId: string
    acsUrl: string
    sloUrl?: string
    nameIdFormat?: string
  }
  oidcClient?: {
    clientId: string
    redirectUris: string[]
    postLogoutUris?: string[]
    grantTypes: string[]
    responseTypes?: string[]
    scopes?: string[]
    pkceRequired?: boolean
  }
  jwtConfig?: {
    allowedAlgorithms?: string[]
    publicKey?: string
    certThumbprint?: string
    audience?: string[]
    tokenLifetime?: number
  }
}

export default async function AppDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let app: AppDetail | null = null
  let error: string | null = null

  try {
    app = await apiFetch<AppDetail>(`/api/v1/admin/applications/${id}`)
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to fetch application'
  }

  if (error || !app) {
    return (
      <div>
        <Link href="/applications" className="text-sm hover:underline" style={{ color: 'var(--color-accent)' }}>← Back</Link>
        <div className="mt-4 px-4 py-3 rounded-md text-sm border"
style={{ background: 'var(--color-error-bg)', color: 'var(--color-error-text)', borderColor: 'var(--color-error-border)' }}>
          {error ?? 'Application not found'}
        </div>
      </div>
    )
  }

  return (
    <div>
      <Link href="/applications" className="text-sm hover:underline" style={{ color: 'var(--color-accent)' }}>← Back</Link>

      <div className="mt-4 flex items-center gap-3 mb-6">
        <h1 className="text-lg font-semibold">{app.name}</h1>
        <span
          className="inline-block px-2 py-0.5 rounded text-xs font-medium"
          style={{
            background: app.protocol === 'saml' ? '#EEEDFE' : app.protocol === 'oidc' ? '#E1F5EE' : '#FEF3C7',
            color: app.protocol === 'saml' ? '#3C3489' : app.protocol === 'oidc' ? '#085041' : '#92400E',
          }}
        >
          {app.protocol.toUpperCase()}
        </span>
      </div>

      <div className="space-y-6 max-w-xl">
        {/* Base info */}
        <Section title="General">
          <Field label="ID" value={app.id} mono />
          <Field label="Slug" value={app.slug} mono />
          {app.description && <Field label="Description" value={app.description} />}
          <Field label="Created" value={new Date(app.createdAt).toLocaleString()} />
        </Section>

        {/* SAML config */}
        {app.samlConfig && (
          <Section title="SAML Configuration">
            <Field label="Entity ID" value={app.samlConfig.entityId} mono />
            <Field label="ACS URL" value={app.samlConfig.acsUrl} mono />
            {app.samlConfig.sloUrl && <Field label="SLO URL" value={app.samlConfig.sloUrl} mono />}
            {app.samlConfig.nameIdFormat && <Field label="NameID Format" value={app.samlConfig.nameIdFormat} />}
          </Section>
        )}

        {/* OIDC config */}
        {app.oidcClient && (
          <Section title="OIDC Client">
            <Field label="Client ID" value={app.oidcClient.clientId} mono />
            <Field label="Redirect URIs" value={app.oidcClient.redirectUris.join('\n')} mono />
            {app.oidcClient.postLogoutUris?.length ? <Field label="Post-Logout URIs" value={app.oidcClient.postLogoutUris.join('\n')} mono /> : null}
            <Field label="Grant Types" value={app.oidcClient.grantTypes.join(', ')} />
            {app.oidcClient.scopes?.length ? <Field label="Scopes" value={app.oidcClient.scopes.join(', ')} /> : null}
            <Field label="PKCE Required" value={app.oidcClient.pkceRequired ? 'Yes' : 'No'} />
          </Section>
        )}

        {/* JWT config */}
        {app.jwtConfig && (
          <Section title="JWT Configuration">
            {app.jwtConfig.allowedAlgorithms?.length ? <Field label="Algorithms" value={app.jwtConfig.allowedAlgorithms.join(', ')} /> : null}
            {app.jwtConfig.publicKey && <Field label="Public Key" value={app.jwtConfig.publicKey.substring(0, 80) + '...'} mono />}
            {app.jwtConfig.certThumbprint && <Field label="Cert Thumbprint" value={app.jwtConfig.certThumbprint} mono />}
            {app.jwtConfig.audience?.length ? <Field label="Audience" value={app.jwtConfig.audience.join(', ')} /> : null}
            {app.jwtConfig.tokenLifetime && <Field label="Token Lifetime" value={`${app.jwtConfig.tokenLifetime}s`} />}
          </Section>
        )}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-5" style={{ borderColor: 'var(--color-border)' }}>
      <h2 className="text-sm font-medium mb-3">{title}</h2>
      <dl className="space-y-2.5">{children}</dl>
    </div>
  )
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <dt style={{ color: 'var(--color-text-secondary)' }}>{label}</dt>
      <dd className={`text-right ${mono ? 'font-mono text-xs' : ''}`} style={{ wordBreak: 'break-all' }}>{value}</dd>
    </div>
  )
}