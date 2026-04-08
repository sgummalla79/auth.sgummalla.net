import { describe, it, expect } from 'vitest'
import speakeasy from 'speakeasy'
import { OtplibTotpService } from '../../modules/mfa/infrastructure/OtplibTotpService.js'
import { isOk } from '../../shared/result/Result.js'

describe('OtplibTotpService', () => {
  const service = new OtplibTotpService()

  it('generates a secret and otpauth URI', () => {
    const result = service.generateSecret('alice@example.com', 'http://localhost:3000')
    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      expect(result.value.secret).toBeTruthy()
      expect(result.value.otpauthUri).toMatch(/^otpauth:\/\/totp\//)
    }
  })

  it('verifies a valid TOTP code', async () => {
    const result = service.generateSecret('test@example.com', 'http://localhost:3000')
    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      const code = speakeasy.totp({ secret: result.value.secret, encoding: 'base32' })
      expect(await service.verify(code, result.value.secret)).toBe(true)
    }
  })

  it('rejects an invalid code', async () => {
    const result = service.generateSecret('test@example.com', 'http://localhost:3000')
    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      expect(await service.verify('000000', result.value.secret)).toBe(false)
    }
  })
})