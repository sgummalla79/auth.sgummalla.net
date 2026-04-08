import { describe, it, expect, beforeAll } from 'vitest'
import { AesKeyEncryptionService } from '../../modules/keys/infrastructure/AesKeyEncryptionService.js'
import type { Env } from '../../shared/config/env.js'
import { isOk, isErr } from '../../shared/result/Result.js'

const mockConfig = { KEY_ENCRYPTION_SECRET: 'test-secret-that-is-long-enough-32chars!!' } as Env

describe('AesKeyEncryptionService', () => {
  let service: AesKeyEncryptionService
  beforeAll(() => { service = new AesKeyEncryptionService({ config: mockConfig }) })

  it('encrypts and does not expose plaintext', () => {
    const result = service.encrypt('my-private-key')
    expect(isOk(result)).toBe(true)
    expect((result as any).value.ciphertext).not.toContain('my-private-key')
  })

  it('decrypts back to original', () => {
    const plaintext = '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----'
    const enc = service.encrypt(plaintext)
    const dec = service.decrypt((enc as any).value.ciphertext, (enc as any).value.iv)
    expect(isOk(dec)).toBe(true)
    expect((dec as any).value).toBe(plaintext)
  })

  it('produces unique ciphertext each time', () => {
    const a = service.encrypt('same')
    const b = service.encrypt('same')
    expect((a as any).value.iv).not.toBe((b as any).value.iv)
  })

  it('detects tampered ciphertext', () => {
    const enc = service.encrypt('original')
    expect(isOk(enc)).toBe(true)

    // Corrupt the encrypted data portion (before the colon), not the auth tag
    const [encPart, tagPart] = (enc as any).value.ciphertext.split(':')
    // Flip the first character of the base64 encoded data
    const tamperedEnc = (encPart!.startsWith('A') ? 'B' : 'A') + encPart!.slice(1)
    const tampered = `${tamperedEnc}:${tagPart}`

    const result = service.decrypt(tampered, (enc as any).value.iv)
    
    expect(isErr(result)).toBe(true)
    expect((result as any).error.message).toContain('Decryption failed')
  })

  it('fails decryption when IV is wrong', () => {
    const enc = service.encrypt('original')
    expect(isOk(enc)).toBe(true)

    // Use a completely different IV — all zeros
    const wrongIv = Buffer.alloc(12, 0).toString('base64')
    const result = service.decrypt((enc as any).value.ciphertext, wrongIv)
    expect(isErr(result)).toBe(true)
  })

  it('rejects malformed ciphertext without auth tag', () => {
    expect(isErr(service.decrypt('nocollonseparator', 'aGVsbG8='))).toBe(true)
  })
})