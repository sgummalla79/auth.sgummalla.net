import { describe, it, expect } from 'vitest'
import { AccessToken } from '../../modules/jwt/domain/AccessToken.js'

describe('AccessToken', () => {
  it('holds all issued token properties', () => {
    const now = new Date()
    const exp = new Date(now.getTime() + 3600_000)
    const token = new AccessToken('signed.jwt.string', 'app_123', ['https://api.example.com'], exp, now)

    expect(token.token).toBe('signed.jwt.string')
    expect(token.clientId).toBe('app_123')
    expect(token.audience).toEqual(['https://api.example.com'])
    expect(token.expiresAt).toBe(exp)
    expect(token.issuedAt).toBe(now)
  })
})