import { apiFetch } from '@/lib/api-client'
import Link from 'next/link'
import { ForceLogoutButton } from './ForceLogoutButton'

interface MfaFactor {
  id: string
  type: string
  verified: boolean
  name: string | null
  createdAt: string
  lastUsedAt: string | null
}

interface UserDetail {
  id: string
  email: string
  emailVerified: boolean
  status: string
  mfaEnabled?: boolean
  failedLoginAttempts?: string | number
  lockedUntil?: string | null
  lastLoginAt: string | null
  createdAt: string
  profile: {
    givenName?: string
    familyName?: string
    displayName?: string
    pictureUrl?: string | null
    locale?: string
    zoneinfo?: string
  } | null
  mfaFactors?: MfaFactor[]
}

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let user: UserDetail | null = null
  let error: string | null = null

  try {
    user = await apiFetch<UserDetail>(`/api/v1/admin/users/${id}`)
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to fetch user'
  }

  if (error || !user) {
    return (
      <div>
        <Link href="/users" className="text-sm hover:underline" style={{ color: 'var(--color-accent)' }}>← Back</Link>
        <div
          className="mt-4 px-4 py-3 rounded-md text-sm border"
          style={{ background: 'var(--color-error-bg)', color: 'var(--color-error-text)', borderColor: 'var(--color-error-border)' }}
        >
          {error ?? 'User not found'}
        </div>
      </div>
    )
  }

  const isLocked = user.lockedUntil && new Date(user.lockedUntil) > new Date()
  const verifiedFactors = user.mfaFactors?.filter((f) => f.verified) ?? []

  return (
    <div>
      <Link href="/users" className="text-sm hover:underline" style={{ color: 'var(--color-accent)' }}>← Back</Link>

      <div className="mt-4 flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold">{user.email}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
            {user.profile?.displayName || 'No profile name'}
          </p>
        </div>
        <ForceLogoutButton userId={user.id} />
      </div>

      <div className="space-y-6 max-w-xl">
        {/* Account */}
        <Section title="Account">
          <Field label="User ID" value={user.id} mono />
          <Field label="Email" value={user.email} />
          <Field label="Verified" value={user.emailVerified ? 'Yes' : 'No'} />
          <Field label="Status" value={user.status} />
          {isLocked && <Field label="Locked Until" value={new Date(user.lockedUntil!).toLocaleString()} />}
          <Field label="Failed Logins" value={String(user.failedLoginAttempts ?? 0)} />
          <Field label="Last Login" value={user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'} />
          <Field label="Created" value={new Date(user.createdAt).toLocaleString()} />
        </Section>

        {/* MFA */}
        <Section title="Multi-Factor Authentication">
          <Field label="MFA Enabled" value={user.mfaEnabled ? 'Yes' : 'No'} />
          {verifiedFactors.length > 0 ? (
            <div className="mt-3 space-y-2">
              {verifiedFactors.map((f) => (
                <div
                  key={f.id}
                  className="flex justify-between items-center text-sm px-3 py-2 rounded-md border"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <div>
                    <span className="font-medium">{f.type.toUpperCase()}</span>
                    {f.name && <span style={{ color: 'var(--color-text-secondary)' }}> — {f.name}</span>}
                  </div>
                  <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    {f.lastUsedAt ? `Last used ${new Date(f.lastUsedAt).toLocaleDateString()}` : 'Never used'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>No verified MFA factors.</p>
          )}
        </Section>

        {/* Profile */}
        {user.profile && (
          <Section title="Profile">
            {user.profile.givenName && <Field label="Given Name" value={user.profile.givenName} />}
            {user.profile.familyName && <Field label="Family Name" value={user.profile.familyName} />}
            {user.profile.displayName && <Field label="Display Name" value={user.profile.displayName} />}
            {user.profile.locale && <Field label="Locale" value={user.profile.locale} />}
            {user.profile.zoneinfo && <Field label="Timezone" value={user.profile.zoneinfo} />}
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
      <dd className={mono ? 'font-mono text-xs' : ''} style={{ wordBreak: 'break-all' }}>{value}</dd>
    </div>
  )
}