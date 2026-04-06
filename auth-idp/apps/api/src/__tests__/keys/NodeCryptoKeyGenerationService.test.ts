import { describe, it, expect, beforeAll } from 'vitest'
import { NodeCryptoKeyGenerationService } from '../../modules/keys/infrastructure/NodeCryptoKeyGenerationService.js'

describe('NodeCryptoKeyGenerationService', () => {
  let service: NodeCryptoKeyGenerationService
  beforeAll(() => { service = new NodeCryptoKeyGenerationService() })

  it('generates RS256 PEM key pair', () => {
    const result = service.generateKeyPair('RS256')
    expect(result.isOk()).toBe(true)
    expect(result.value!.publicKeyPem).toContain('BEGIN PUBLIC KEY')
    expect(result.value!.privateKeyPem).toContain('BEGIN PRIVATE KEY')
  })

  it('generates ES256 PEM key pair', () => {
    const result = service.generateKeyPair('ES256')
    expect(result.isOk()).toBe(true)
    expect(result.value!.publicKeyPem).toContain('BEGIN PUBLIC KEY')
  })

  it('generates unique pairs each time', () => {
    const a = service.generateKeyPair('RS256')
    const b = service.generateKeyPair('RS256')
    expect(a.value!.publicKeyPem).not.toBe(b.value!.publicKeyPem)
  })

  it('errors on unsupported algorithm', () => {
    // @ts-expect-error intentional
    expect(service.generateKeyPair('HS256').isErr()).toBe(true)
  })
})