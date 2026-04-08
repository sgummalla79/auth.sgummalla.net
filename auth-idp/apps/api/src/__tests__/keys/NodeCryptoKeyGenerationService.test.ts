import { describe, it, expect, beforeAll } from 'vitest'
import { NodeCryptoKeyGenerationService } from '../../modules/keys/infrastructure/NodeCryptoKeyGenerationService.js'
import { isOk } from '../../shared/result/Result.js'

describe('NodeCryptoKeyGenerationService', () => {
  let service: NodeCryptoKeyGenerationService
  beforeAll(() => { service = new NodeCryptoKeyGenerationService() })

  it('generates RS256 PEM key pair', () => {
    const result = service.generateKeyPair('RS256')
    expect(isOk(result)).toBe(true)
    expect((result as any).value.publicKeyPem).toContain('BEGIN PUBLIC KEY')
    expect((result as any).value.privateKeyPem).toContain('BEGIN PRIVATE KEY')
  })

  it('generates ES256 PEM key pair', () => {
    const result = service.generateKeyPair('ES256')
    expect(isOk(result)).toBe(true)
    expect((result as any).value.publicKeyPem).toContain('BEGIN PUBLIC KEY')
  })

  it('generates unique pairs each time', () => {
    const a = service.generateKeyPair('RS256')
    const b = service.generateKeyPair('RS256')
    expect((a as any).value.publicKeyPem).not.toBe((b as any).value.publicKeyPem)
  })

  it('errors on unsupported algorithm', () => {
    // @ts-expect-error intentional
    expect(service.generateKeyPair('HS256').isErr()).toBe(true)
  })
})