/**
 * MfaStatus — value object representing a user's MFA enrollment state.
 */
export class MfaStatus {
  constructor(
    public readonly userId: string,
    public readonly enabled: boolean,
    public readonly pending: boolean,       // setup started but not verified yet
    public readonly hasBackupCodes: boolean,
  ) {}

  isFullyEnrolled(): boolean {
    return this.enabled && !this.pending
  }

  requiresSetupCompletion(): boolean {
    return this.pending && !this.enabled
  }
}