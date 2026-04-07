import { describe, it, expect } from 'vitest'
import { SsoSession } from '../../modules/sessions/domain/SsoSession.js'

function makeSession(overrides: Partial<{
  revokedAt: Date | null
  expiresAt: Date
  participatingApps: { appId: string; protocol: 'saml' | 'oidc' }[]
}> = {}): SsoSession {
  return new SsoSession(
    'session_123',
    'user_abc',
    'token_xyz',
    overrides.participatingApps ?? [],
    new Date(),
    overrides.expiresAt ?? new Date(Date.now() + 86400_000),
    overrides.revokedAt ?? null,
  )
}

describe('SsoSession', () => {
  it('is active when not revoked and not expired', () => {
    const session = makeSession()
    expect(session.isActive()).toBe(true)
  })

  it('is inactive when revoked', () => {
    const session = makeSession({ revokedAt: new Date() })
    expect(session.isActive()).toBe(false)
  })

  it('is inactive when expired', () => {
    const session = makeSession({ expiresAt: new Date(Date.now() - 1000) })
    expect(session.isActive()).toBe(false)
  })

  it('detects a participating app', () => {
    const session = makeSession({
      participatingApps: [{ appId: 'app_1', protocol: 'saml' }],
    })
    expect(session.hasApp('app_1')).toBe(true)
    expect(session.hasApp('app_2')).toBe(false)
  })

  it('returns false for hasApp when no apps', () => {
    const session = makeSession()
    expect(session.hasApp('anything')).toBe(false)
  })
})