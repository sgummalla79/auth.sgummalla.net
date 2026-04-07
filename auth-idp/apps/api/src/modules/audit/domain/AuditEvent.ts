/**
 * AuditEvent — immutable domain entity.
 * Never updated after creation — append-only audit trail.
 */
export type AuditEventType =
  | 'user.login.success'
  | 'user.login.failure'
  | 'user.logout'
  | 'user.register'
  | 'user.password.change'
  | 'mfa.setup'
  | 'mfa.activated'
  | 'mfa.validated'
  | 'mfa.validation.failure'
  | 'mfa.backup_code.used'
  | 'saml.sso.success'
  | 'saml.sso.failure'
  | 'saml.slo'
  | 'oidc.token.issued'
  | 'oidc.token.revoked'
  | 'jwt.token.issued'
  | 'key.rotated'
  | 'key.generated'
  | 'session.revoked'
  | 'session.revoked_all'
  | 'admin.action'

export type AuditOutcome = 'success' | 'failure'

export class AuditEvent {
  constructor(
    public readonly id: string,
    public readonly type: AuditEventType,
    public readonly outcome: AuditOutcome,
    public readonly userId: string | null,
    public readonly appId: string | null,
    public readonly traceId: string | null,
    public readonly ipAddress: string | null,
    public readonly userAgent: string | null,
    public readonly metadata: Record<string, unknown>,
    public readonly occurredAt: Date,
  ) {}
}