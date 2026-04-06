import { randomBytes } from 'crypto'
import type { UserProfile } from '../../users/domain/UserProfile.js'
import type { User } from '../../users/domain/User.js'

/**
 * SamlAssertion — immutable value object holding everything needed to build
 * the <saml:Assertion> inside a SAML response.
 *
 * attributeMappings: keys are our internal claim names (email, given_name …),
 * values are the SP-specific attribute names configured per-app.
 *
 * Example mapping:
 *   { "email": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
 *     "given_name": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname" }
 *
 * The resolved user object passed to samlify has shape:
 *   { nameID, nameIDFormat, sessionIndex, email, given_name, … }
 * samlify's valueTag references properties with the internal key names.
 */
export class SamlAssertion {
  constructor(
    /** NameID value — typically the user's email */
    public readonly nameId: string,
    /** NameID format URI */
    public readonly nameIdFormat: string,
    /** Unique session index scoped to this assertion */
    public readonly sessionIndex: string,
    /**
     * Map of internalClaimName → resolvedValue.
     * Keys must match the keys in attributeMappings.
     */
    public readonly claimValues: Record<string, string>,
  ) {}

  /**
   * Build a SamlAssertion from a user + profile + the app's attributeMappings.
   * Only claims that have a value are included.
   */
  static fromUser(
    user: User,
    profile: UserProfile,
    attributeMappings: Record<string, string>,
    nameIdFormat: string,
  ): SamlAssertion {
    // All claims we can resolve from the user + profile
    const available: Record<string, string | null | undefined> = {
      email:        user.email,
      user_id:      user.id,
      given_name:   profile.givenName,
      family_name:  profile.familyName,
      name:         profile.fullName() ?? profile.displayName,
      display_name: profile.displayName,
      locale:       profile.locale,
      zoneinfo:     profile.zoneinfo,
    }

    const claimValues: Record<string, string> = {}
    for (const internalName of Object.keys(attributeMappings)) {
      const value = available[internalName]
      if (value != null && value !== '') {
        claimValues[internalName] = value
      }
    }

    return new SamlAssertion(
      user.email,
      nameIdFormat,
      `_${randomBytes(16).toString('hex')}`,
      claimValues,
    )
  }

  /**
   * Returns a flat object safe to pass directly as the `user` arg to
   * samlify's createLoginResponse. samlify's valueTag `user.{key}` resolves
   * against this object.
   */
  toSamlifyUser(): Record<string, string> {
    return {
      nameID:        this.nameId,
      nameIDFormat:  this.nameIdFormat,
      sessionIndex:  this.sessionIndex,
      ...this.claimValues,
    }
  }
}