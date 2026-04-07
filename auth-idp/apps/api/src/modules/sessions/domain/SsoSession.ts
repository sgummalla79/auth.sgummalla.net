/**
 * SsoSession — domain entity tracking one user's SSO session.
 *
 * participatingApps: list of app IDs the user has logged into
 * during this session. Used to fan out SLO requests on logout.
 */
export class SsoSession {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly idpSessionToken: string | null,
    public readonly participatingApps: ParticipatingApp[],
    public readonly createdAt: Date,
    public readonly expiresAt: Date,
    public readonly revokedAt: Date | null,
  ) {}

  isActive(): boolean {
    return !this.revokedAt && this.expiresAt > new Date()
  }

  hasApp(appId: string): boolean {
    return this.participatingApps.some(a => a.appId === appId)
  }
}

export interface ParticipatingApp {
  appId: string
  protocol: 'saml' | 'oidc'
  nameId?: string      // SAML nameID — needed for SLO LogoutRequest
  sessionIndex?: string // SAML sessionIndex — needed for SLO
}