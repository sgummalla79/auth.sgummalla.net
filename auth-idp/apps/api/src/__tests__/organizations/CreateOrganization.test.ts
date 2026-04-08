import { describe, it, expect, vi, beforeEach, assert } from 'vitest'
import { CreateOrganizationUseCase } from '../../modules/organizations/application/use-cases/CreateOrganization.js'
import { ok, err } from '../../shared/result/Result.js'
import { ConflictError, NotFoundError, InternalError } from '../../shared/errors/AppError.js'
import pino from 'pino'

const logger = pino({ level: 'silent' })

describe('CreateOrganizationUseCase', () => {
  let mockOrgRepo: any
  let mockKeyRepo: any
  let mockKeyGen: any
  let mockKeyEnc: any
  let useCase: CreateOrganizationUseCase

  beforeEach(() => {
    mockOrgRepo = {
      findBySlug: vi.fn().mockResolvedValue(err(new NotFoundError('not found'))),
      save: vi.fn().mockResolvedValue(ok({ id: 'org-1', name: 'Acme', slug: 'acme', status: 'active', logoUrl: null, createdAt: new Date(), updatedAt: new Date() })),
      saveRole: vi.fn().mockResolvedValue(ok({ id: 'role-1', organizationId: 'org-1', name: 'org_admin', description: null, isSystem: true, createdAt: new Date() })),
      assignRole: vi.fn().mockResolvedValue(ok(undefined)),
    }
    mockKeyRepo = {
      save: vi.fn().mockResolvedValue(ok({ id: 'key-1' })),
    }
    mockKeyGen = {
      generateKeyPair: vi.fn().mockResolvedValue(ok({
        privateKeyPem: 'private', publicKeyPem: 'public',
      })),
    }
    mockKeyEnc = {
      encrypt: vi.fn().mockResolvedValue(ok({ ciphertext: 'enc', iv: 'iv' })),
    }

    useCase = new CreateOrganizationUseCase({
      organizationRepository: mockOrgRepo,
      signingKeyRepository: mockKeyRepo,
      keyGenerationService: mockKeyGen,
      keyEncryptionService: mockKeyEnc,
      logger,
    })
  })

  it('creates org, keypair, and seeds org_admin role', async () => {
    const result = await useCase.execute({
      name: 'Acme Corp',
      creatingUserId: '00000000-0000-0000-0000-000000000001',
    })
    expect(result.isOk()).toBe(true)
    expect(mockOrgRepo.save).toHaveBeenCalledOnce()
    expect(mockKeyGen.generateKeyPair).toHaveBeenCalledWith('RS256')
    expect(mockKeyRepo.save).toHaveBeenCalledOnce()
    expect(mockOrgRepo.saveRole).toHaveBeenCalledWith(expect.objectContaining({ name: 'org_admin', isSystem: true }))
    expect(mockOrgRepo.assignRole).toHaveBeenCalledOnce()
  })

  it('rejects if slug is already taken', async () => {
    mockOrgRepo.findBySlug.mockResolvedValue(ok({ id: 'existing' }))
    const result = await useCase.execute({
      name: 'Acme Corp',
      creatingUserId: '00000000-0000-0000-0000-000000000001',
    })
    assert(result.isErr())
    expect(result.error).toBeInstanceOf(ConflictError)
  })

  it('rejects invalid creatingUserId', async () => {
    const result = await useCase.execute({
      name: 'Acme Corp',
      creatingUserId: 'not-a-uuid',
    })
    expect(result.isErr()).toBe(true)
  })

  it('fails gracefully if key generation fails', async () => {
    mockKeyGen.generateKeyPair.mockResolvedValue(err(new InternalError('keygen failed')))
    const result = await useCase.execute({
      name: 'Acme Corp',
      creatingUserId: '00000000-0000-0000-0000-000000000001',
    })
    expect(result.isErr()).toBe(true)
  })
})