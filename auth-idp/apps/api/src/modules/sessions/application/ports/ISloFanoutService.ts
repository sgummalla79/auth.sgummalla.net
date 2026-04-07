import type { ParticipatingApp } from '../../domain/SsoSession.js'

export interface SloFanoutResult {
  appId: string
  protocol: 'saml' | 'oidc'
  success: boolean
  error?: string
}

/**
 * Fans out logout requests to all apps the user logged into
 * during this SSO session.
 *
 * SAML apps: send a LogoutRequest (fire-and-forget, best-effort)
 * OIDC apps: revoke tokens in Redis
 *
 * Never throws — returns per-app results so the IDP can log failures
 * without blocking the user's logout flow.
 */
export interface ISloFanoutService {
  fanout(
    userId: string,
    participatingApps: ParticipatingApp[],
  ): Promise<SloFanoutResult[]>
}