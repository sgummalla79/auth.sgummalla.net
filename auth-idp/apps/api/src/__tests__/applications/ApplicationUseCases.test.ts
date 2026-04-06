import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RegisterApplicationUseCase } from '../../modules/applications/application/use-cases/RegisterApplication.js'
import { ok, err } from '../../shared/result/Result.js'
import { ConflictError, NotFoundError } from '../../shared/errors/AppError.js'
import { Application } from '../../modules/applications/domain/Application.js'
import pino from 'pino'

const logger = pino({ level: 'silent' })

function makeApp(protocol: 'saml' | 'oidc' | 'jwt' = 'saml'): Application {
  return new Application('app-uuid', 'Test App', 'test-app', protocol, 'active', null, null, new Date(), new Date())
}

describe('RegisterApplicationUseCase', () => {
  let mockRepo: any, mockSlugs: any, mockCreds: any, mockHash: any, useCase: RegisterApplicationUseCase

  beforeEach(() => {
    mockRepo = {
      findBySlug: vi.fn().mockResolvedValue(err(new NotFoundError('not found'))),
      save: vi.fn().mockResolvedValue(ok(makeApp('saml'))),
      saveSamlConfig: vi.fn().mockResolvedValue(ok({ entityId: 'https://sp.example.com' })),
      saveOidcClient: vi.fn().mockResolvedValue(ok({ clientId: 'client_abc' })),
      saveJwtConfig: vi.fn().mockResolvedValue(ok({ signingAlgorithm: 'RS256' })),
    }
    mockSlugs = { generate: vi.fn().mockReturnValue('test-app') }
    mockCreds = { generateClientId: vi.fn().mockReturnValue('client_abc123'), generateClientSecret: vi.fn().mockReturnValue('secret_xyz789') }
    mockHash = { hash: vi.fn().mockResolvedValue(ok('$argon2id$hashed')) }
    useCase = new RegisterApplicationUseCase({
      applicationRepository: mockRepo, slugGenerator: mockSlugs,
      credentialGenerator: mockCreds, hashService: mockHash, logger,
    })
  })

  it('registers SAML app', async () => {
    const result = await useCase.execute({
      protocol: 'saml', name: 'Test App',
      saml: { entityId: 'https://sp.example.com/metadata', acsUrl: 'https://sp.example.com/acs' },
    })
    expect(result.isOk()).toBe(true)
    expect(mockRepo.saveSamlConfig).toHaveBeenCalled()
  })

  it('registers OIDC app and returns plaintext secret', async () => {
    mockRepo.save.mockResolvedValue(ok(makeApp('oidc')))
    const result = await useCase.execute({
      protocol: 'oidc', name: 'Test App',
      oidc: { redirectUris: ['https://app.example.com/callback'] },
    })
    expect(result.isOk()).toBe(true)
    expect(result.value!.oidcClientSecret).toBe('secret_xyz789')
    expect(mockHash.hash).toHaveBeenCalledWith('secret_xyz789')
  })

  it('registers JWT app', async () => {
    mockRepo.save.mockResolvedValue(ok(makeApp('jwt')))
    const result = await useCase.execute({
      protocol: 'jwt', name: 'Test App',
      jwt: { publicKey: '-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----', audience: ['https://api.example.com'] },
    })
    expect(result.isOk()).toBe(true)
    expect(mockRepo.saveJwtConfig).toHaveBeenCalled()
  })

  it('returns conflict on duplicate name', async () => {
    mockRepo.findBySlug.mockResolvedValue(ok(makeApp()))
    const result = await useCase.execute({
      protocol: 'saml', name: 'Test App',
      saml: { entityId: 'https://sp.example.com', acsUrl: 'https://sp.example.com/acs' },
    })
    expect(result.isErr()).toBe(true)
    expect(result.error).toBeInstanceOf(ConflictError)
  })

  it('rejects invalid ACS URL', async () => {
    const result = await useCase.execute({
      protocol: 'saml', name: 'Test App',
      saml: { entityId: 'https://sp.example.com', acsUrl: 'not-a-url' },
    })
    expect(result.isErr()).toBe(true)
    expect(result.error!.code).toBe('VALIDATION_ERROR')
  })

  it('rejects empty OIDC redirect URIs', async () => {
    const result = await useCase.execute({
      protocol: 'oidc', name: 'Test App', oidc: { redirectUris: [] },
    })
    expect(result.isErr()).toBe(true)
    expect(result.error!.code).toBe('VALIDATION_ERROR')
  })
})

describe('DefaultSlugGenerator', () => {
  it('generates correct slugs', async () => {
    const { DefaultSlugGenerator } = await import('../../modules/applications/infrastructure/Generators.js')
    const gen = new DefaultSlugGenerator()
    expect(gen.generate('Salesforce CRM')).toBe('salesforce-crm')
    expect(gen.generate('My App v2.0!')).toBe('my-app-v20')
    expect(gen.generate('  spaces  ')).toBe('spaces')
  })
})