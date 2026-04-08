import { describe, it, expect } from 'vitest'
import { SamlAssertion } from '../../modules/saml/domain/SamlAssertion.js'
import { User } from '../../modules/users/domain/User.js'
import { UserProfile } from '../../modules/users/domain/UserProfile.js'

const EMAIL_FORMAT = 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress'

function makeUser(): User {
  return new User(
    'user-123', 'org-123', 'alice@example.com', false,
    '$argon2id$v=19$m=65536,t=3,p=4$hashedpassword',
    'active', 0, null, new Date(), new Date(), null,
  )
}

function makeProfile(): UserProfile {
  return new UserProfile(
    'user_abc123',
    'Alice',
    'Smith',
    'Alice Smith',
    null,
    'en-US',
    'America/Los_Angeles',
    {},
    new Date(),
  )
}

describe('SamlAssertion', () => {
  it('maps internal claim names to values using attributeMappings keys', () => {
    const mappings = {
      email:       'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
      given_name:  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
      family_name: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname',
    }

    const assertion = SamlAssertion.fromUser(makeUser(), makeProfile(), mappings, EMAIL_FORMAT)

    expect(assertion.nameId).toBe('alice@example.com')
    expect(assertion.nameIdFormat).toBe(EMAIL_FORMAT)
    expect(assertion.claimValues.email).toBe('alice@example.com')
    expect(assertion.claimValues.given_name).toBe('Alice')
    expect(assertion.claimValues.family_name).toBe('Smith')
  })

  it('omits claims not in attributeMappings', () => {
    const mappings = { email: 'emailAddress' }  // only email mapped
    const assertion = SamlAssertion.fromUser(makeUser(), makeProfile(), mappings, EMAIL_FORMAT)

    expect(assertion.claimValues.email).toBe('alice@example.com')
    expect(assertion.claimValues.given_name).toBeUndefined()
  })

  it('omits claims with null/empty values', () => {
    const profile = new UserProfile('user_abc123', null, null, null, null, 'en', 'UTC', {}, new Date())
    const mappings = { email: 'email', given_name: 'firstName' }
    const assertion = SamlAssertion.fromUser(makeUser(), profile, mappings, EMAIL_FORMAT)

    expect(assertion.claimValues.email).toBe('alice@example.com')
    expect(assertion.claimValues.given_name).toBeUndefined()
  })

  it('toSamlifyUser includes nameID and all claimValues', () => {
    const assertion = SamlAssertion.fromUser(
      makeUser(),
      makeProfile(),
      { email: 'mail', given_name: 'firstName' },
      EMAIL_FORMAT,
    )

    const samlifyUser = assertion.toSamlifyUser()
    expect(samlifyUser.nameID).toBe('alice@example.com')
    expect(samlifyUser.nameIDFormat).toBe(EMAIL_FORMAT)
    expect(samlifyUser.email).toBe('alice@example.com')
    expect(samlifyUser.given_name).toBe('Alice')
    expect(typeof samlifyUser.sessionIndex).toBe('string')
  })
})