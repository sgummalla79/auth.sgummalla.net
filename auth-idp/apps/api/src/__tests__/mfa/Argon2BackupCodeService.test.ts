import { describe, it, expect } from 'vitest'
import { Argon2BackupCodeService } from '../../modules/mfa/infrastructure/Argon2BackupCodeService.js'

describe('Argon2BackupCodeService', () => {
  const service = new Argon2BackupCodeService()

  it('generates the requested number of codes', () => {
    const codes = service.generate(10)
    expect(codes).toHaveLength(10)
  })

  it('generates codes in XXXX-XXXX-XXXX format', () => {
    const codes = service.generate(5)
    for (const code of codes) {
      expect(code).toMatch(/^[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/)
    }
  })

  it('generates unique codes', () => {
    const codes = service.generate(10)
    const unique = new Set(codes)
    expect(unique.size).toBe(10)
  })

  it('hashes and verifies a code correctly', async () => {
    const code = 'ABCD-1234-EF56'
    const hashResult = await service.hash(code)
    expect(hashResult.isOk()).toBe(true)
    if (hashResult.isOk()) {
      const valid = await service.verify(code, hashResult.value)
      expect(valid).toBe(true)
    }
  })

  it('rejects incorrect code against hash', async () => {
    const hashResult = await service.hash('ABCD-1234-EF56')
    if (hashResult.isOk()) {
      const valid = await service.verify('XXXX-XXXX-XXXX', hashResult.value)
      expect(valid).toBe(false)
    }
  })
})