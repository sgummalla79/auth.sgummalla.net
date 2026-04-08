import { describe, it, expect } from 'vitest'
import {
  // organizations module
  organizations, roles, userRoles,
  organizationStatusEnum,
  // applications module
  applications, samlConfigs, oidcClients, jwtConfigs, scopes,
  authProtocolEnum, applicationStatusEnum,
  // users module
  users, userProfiles, userMfa,
  userStatusEnum, mfaFactorTypeEnum,
  // keys module
  signingKeys,
  signingKeyAlgorithmEnum, signingKeyStatusEnum,
  // sessions module
  ssoSessions,
  sessionStatusEnum,
} from '../database/index.js'

describe('Schema — enums', () => {
  it('organizationStatus has correct values', () => {
    expect(organizationStatusEnum.enumValues).toEqual(['active', 'suspended'])
  })

  it('authProtocol has correct values', () => {
    expect(authProtocolEnum.enumValues).toEqual(['saml', 'oidc', 'jwt'])
  })

  it('applicationStatus has correct values', () => {
    expect(applicationStatusEnum.enumValues).toEqual(['active', 'inactive', 'suspended'])
  })

  it('userStatus has correct values', () => {
    expect(userStatusEnum.enumValues).toEqual(['active', 'inactive', 'suspended'])
  })

  it('mfaFactorType has correct values', () => {
    expect(mfaFactorTypeEnum.enumValues).toEqual(['totp', 'webauthn'])
  })

  it('signingKeyAlgorithm has correct values', () => {
    expect(signingKeyAlgorithmEnum.enumValues).toEqual([
      'RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512',
    ])
  })

  it('signingKeyStatus has full rotation lifecycle', () => {
    expect(signingKeyStatusEnum.enumValues).toEqual([
      'active', 'rotating', 'retired', 'revoked',
    ])
  })

  it('sessionStatus has correct values', () => {
    expect(sessionStatusEnum.enumValues).toEqual(['active', 'expired', 'revoked'])
  })
})

describe('Schema — table columns', () => {
  it('organizations has required columns', () => {
    const cols = Object.keys(organizations)
    expect(cols).toContain('id')
    expect(cols).toContain('name')
    expect(cols).toContain('slug')
    expect(cols).toContain('status')
  })

  it('roles is scoped to organization', () => {
    const cols = Object.keys(roles)
    expect(cols).toContain('organizationId')
    expect(cols).toContain('name')
    expect(cols).toContain('isSystem')
  })

  it('userRoles links users to roles', () => {
    const cols = Object.keys(userRoles)
    expect(cols).toContain('userId')
    expect(cols).toContain('roleId')
    expect(cols).toContain('assignedBy')
  })

  it('applications is scoped to organization', () => {
    const cols = Object.keys(applications)
    expect(cols).toContain('id')
    expect(cols).toContain('organizationId')
    expect(cols).toContain('slug')
    expect(cols).toContain('protocol')
  })

  it('scopes is scoped to application', () => {
    const cols = Object.keys(scopes)
    expect(cols).toContain('applicationId')
    expect(cols).toContain('name')
  })

  it('oidcClients has pkce and auth columns', () => {
    const cols = Object.keys(oidcClients)
    expect(cols).toContain('requirePkce')
    expect(cols).toContain('tokenEndpointAuthMethod')
  })

  it('signingKeys is scoped to organization', () => {
    const cols = Object.keys(signingKeys)
    expect(cols).toContain('organizationId')
    expect(cols).toContain('encryptedPrivateKey')
    expect(cols).toContain('encryptionIv')
    expect(cols).toContain('publicKeyJwk')
  })

  it('users is scoped to organization', () => {
    const cols = Object.keys(users)
    expect(cols).toContain('organizationId')
    expect(cols).toContain('failedLoginAttempts')
    expect(cols).toContain('lockedUntil')
  })

  it('ssoSessions has SLO columns', () => {
    const cols = Object.keys(ssoSessions)
    expect(cols).toContain('organizationId')
    expect(cols).toContain('participatingAppIds')
    expect(cols).toContain('amr')
  })
})

describe('Schema — all 13 tables exported', () => {
  it('all tables are defined', () => {
    // organizations module
    expect(organizations).toBeDefined()
    expect(roles).toBeDefined()
    expect(userRoles).toBeDefined()
    // applications module
    expect(applications).toBeDefined()
    expect(scopes).toBeDefined()
    expect(samlConfigs).toBeDefined()
    expect(oidcClients).toBeDefined()
    expect(jwtConfigs).toBeDefined()
    // users module
    expect(users).toBeDefined()
    expect(userProfiles).toBeDefined()
    expect(userMfa).toBeDefined()
    // keys module
    expect(signingKeys).toBeDefined()
    // sessions module
    expect(ssoSessions).toBeDefined()
  })
})