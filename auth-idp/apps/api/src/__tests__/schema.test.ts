import { describe, it, expect } from 'vitest'
import {
  applications, samlConfigs, oidcClients, jwtConfigs,
  users, userProfiles, userMfa, signingKeys, ssoSessions,
  authProtocolEnum, applicationStatusEnum,
  userStatusEnum, mfaTypeEnum,
  keyAlgorithmEnum, keyStatusEnum, sessionStatusEnum,
} from '../database/index.js'

describe('Schema — enums', () => {
  it('authProtocol has correct values', () => {
    expect(authProtocolEnum.enumValues).toEqual(['saml', 'oidc', 'jwt'])
  })
  it('applicationStatus has correct values', () => {
    expect(applicationStatusEnum.enumValues).toEqual(['active', 'inactive', 'suspended'])
  })
  it('userStatus has pending_verification', () => {
    expect(userStatusEnum.enumValues).toContain('pending_verification')
  })
  it('mfaType has all four factors', () => {
    expect(mfaTypeEnum.enumValues).toEqual(['totp', 'webauthn', 'sms', 'email'])
  })
  it('keyStatus has full rotation lifecycle', () => {
    expect(keyStatusEnum.enumValues).toEqual(['active', 'rotating', 'retired', 'revoked'])
  })
  it('sessionStatus has logged_out', () => {
    expect(sessionStatusEnum.enumValues).toContain('logged_out')
  })
})

describe('Schema — table columns', () => {
  it('applications has required columns', () => {
    const cols = Object.keys(applications)
    expect(cols).toContain('id')
    expect(cols).toContain('slug')
    expect(cols).toContain('protocol')
  })
  it('oidcClients has pkceRequired', () => {
    expect(Object.keys(oidcClients)).toContain('pkceRequired')
  })
  it('signingKeys stores encrypted private key', () => {
    const cols = Object.keys(signingKeys)
    expect(cols).toContain('encryptedPrivateKey')
    expect(cols).toContain('encryptionIv')
  })
  it('users has lockout columns', () => {
    const cols = Object.keys(users)
    expect(cols).toContain('failedLoginAttempts')
    expect(cols).toContain('lockedUntil')
  })
  it('ssoSessions has SLO columns', () => {
    const cols = Object.keys(ssoSessions)
    expect(cols).toContain('participatingAppIds')
    expect(cols).toContain('amr')
  })
})

describe('Schema — all nine tables exported', () => {
  it('all tables are defined', () => {
    expect(applications).toBeDefined()
    expect(samlConfigs).toBeDefined()
    expect(oidcClients).toBeDefined()
    expect(jwtConfigs).toBeDefined()
    expect(users).toBeDefined()
    expect(userProfiles).toBeDefined()
    expect(userMfa).toBeDefined()
    expect(signingKeys).toBeDefined()
    expect(ssoSessions).toBeDefined()
  })
})