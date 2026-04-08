import { randomUUID } from 'crypto'
import { z } from 'zod'
import { ok, err, isErr, isOk } from '../../../../shared/result/Result.js'
import type { Result } from '../../../../shared/result/Result.js'
import type { AppError } from '../../../../shared/errors/AppError.js'
import { ValidationError, ConflictError, InternalError } from '../../../../shared/errors/AppError.js'
import type { Logger } from '../../../../shared/logger/logger.js'
import type { IOrganizationRepository } from '../ports/IOrganizationRepository.js'
import type { ISigningKeyRepository } from '../../../keys/application/ports/ISigningKeyRepository.js'
import type { IKeyGenerationService } from '../../../keys/application/ports/IKeyGenerationService.js'
import type { IKeyEncryptionService } from '../../../keys/application/ports/IKeyEncryptionService.js'
import { SYSTEM_ROLES } from '../../domain/Role.js'

// ─── Input schema ─────────────────────────────────────────────────────────────

const CreateOrganizationSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z.string()
    .min(2).max(63)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens only')
    .optional(),
  logoUrl: z.string().url().optional(),
  creatingUserId: z.string().uuid('creatingUserId must be a valid UUID'),
})

export type CreateOrganizationInput = z.infer<typeof CreateOrganizationSchema>

// ─── Use case ─────────────────────────────────────────────────────────────────

type Deps = {
  organizationRepository: IOrganizationRepository
  signingKeyRepository: ISigningKeyRepository
  keyGenerationService: IKeyGenerationService
  keyEncryptionService: IKeyEncryptionService
  logger: Logger
}

export class CreateOrganizationUseCase {
  private readonly organizationRepository: IOrganizationRepository
  private readonly signingKeyRepository: ISigningKeyRepository
  private readonly keyGenerationService: IKeyGenerationService
  private readonly keyEncryptionService: IKeyEncryptionService
  private readonly logger: Logger

  constructor(deps: Deps) {
    this.organizationRepository = deps.organizationRepository
    this.signingKeyRepository = deps.signingKeyRepository
    this.keyGenerationService = deps.keyGenerationService
    this.keyEncryptionService = deps.keyEncryptionService
    this.logger = deps.logger
  }

  async execute(input: CreateOrganizationInput): Promise<Result<{ orgId: string; keyId: string; roleId: string }, AppError>> {
    // 1 — Validate input
    const parsed = CreateOrganizationSchema.safeParse(input)
    if (!parsed.success) {
      return err(new ValidationError('Invalid organization input', parsed.error.flatten().fieldErrors as Record<string, string[]>))
    }

    const { name, logoUrl, creatingUserId } = parsed.data
    const slug = parsed.data.slug ?? this.generateSlug(name)

    // 2 — Check slug uniqueness
    const existing = await this.organizationRepository.findBySlug(slug)
    if (isOk(existing)) {
      return err(new ConflictError(`Organization slug "${slug}" is already taken`))
    }

    const orgId = randomUUID()

    // 3 — Insert organization
    const orgResult = await this.organizationRepository.save({
      id: orgId,
      name,
      slug,
      logoUrl,
    })
    if (isErr(orgResult)) return err(orgResult.error)

    // 4 — Generate RSA-2048 keypair for this org
    const keyPair = await this.keyGenerationService.generateKeyPair('RS256')
    if (isErr(keyPair)) {
      return err(new InternalError('Failed to generate signing key for organization'))
    }

    const encrypted = await this.keyEncryptionService.encrypt(keyPair.value.privateKeyPem)
    if (isErr(encrypted)) {
      return err(new InternalError('Failed to encrypt signing key'))
    }

    const kid = `${slug}-${Date.now()}`

    const keyResult = await this.signingKeyRepository.save({
      kid,
      organizationId:      orgId,
      algorithm:           'RS256',
      status:              'active',
      publicKeyPem:        keyPair.value.publicKeyPem,
      publicKeyJwk:        '',                              // ← placeholder, M15 will derive this properly
      encryptedPrivateKey: encrypted.value.ciphertext,      // ← was encryptedData
      encryptionIv:        encrypted.value.iv,
      expiresAt:           null,
    })
    if (isErr(keyResult)) {
      return err(new InternalError('Failed to save signing key for organization'))
    }

    // 5 — Seed org_admin system role
    const roleId = randomUUID()
    const roleResult = await this.organizationRepository.saveRole({
      id: roleId,
      organizationId: orgId,
      name: SYSTEM_ROLES.ORG_ADMIN,
      description: 'Full administrative access to this organization',
      isSystem: true,
    })
    if (isErr(roleResult)) {
      return err(new InternalError('Failed to seed org_admin role'))
    }

    // 6 — Assign creating user as org_admin
    const assignResult = await this.organizationRepository.assignRole({
      id: randomUUID(),
      userId: creatingUserId,
      roleId,
      assignedBy: creatingUserId,
    })
    if (isErr(assignResult)) {
      return err(new InternalError('Failed to assign org_admin role to creating user'))
    }

    this.logger.info({ orgId, keyId: kid, roleId }, 'Organization created')

    return ok({ orgId, keyId: kid, roleId })
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 63)
  }
}