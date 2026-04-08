import { z } from 'zod'
import { ok, err, isErr } from '../../../../shared/result/Result.js'
import type { Result } from '../../../../shared/result/Result.js'
import type { AppError } from '../../../../shared/errors/AppError.js'
import { ValidationError } from '../../../../shared/errors/AppError.js'
import type { Application } from '../../domain/Application.js'
import type { ApplicationWithConfig, IApplicationRepository } from '../ports/IApplicationRepository.js'

interface Deps { applicationRepository: IApplicationRepository }

export class GetApplicationUseCase {
  private readonly repo: IApplicationRepository
  constructor({ applicationRepository }: Deps) { this.repo = applicationRepository }
  async execute(id: string): Promise<Result<ApplicationWithConfig, AppError>> {
    const result = await this.repo.findWithConfig(id)
    if (isErr(result)) return err(result.error)
    return ok(result.value)
  }
}

export class ListApplicationsUseCase {
  private readonly repo: IApplicationRepository
  constructor({ applicationRepository }: Deps) { this.repo = applicationRepository }
  async execute(): Promise<Result<Application[], AppError>> {
    const result = await this.repo.findAll()
    if (isErr(result)) return err(result.error)
    return ok(result.value)
  }
}

const UpdateApplicationSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  logoUrl: z.string().url().optional(),
  description: z.string().max(500).optional(),
  status: z.enum(['active', 'inactive', 'suspended']).optional(),
})

export class UpdateApplicationUseCase {
  private readonly repo: IApplicationRepository

  constructor({ applicationRepository }: Deps) {
    this.repo = applicationRepository;
  }
  async execute(id: string, cmd: unknown): Promise<Result<Application, AppError>> {
    const parsed = UpdateApplicationSchema.safeParse(cmd)
    if (!parsed.success) {
      const fields: Record<string, string[]> = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.') || 'unknown'
        if (!fields[key]) fields[key] = []
        fields[key]!.push(issue.message)
      }
      return err(new ValidationError('Invalid update data', fields))
    }
    const result = await this.repo.update(id, parsed.data)
    if (isErr(result)) return err(result.error)

    return ok(result.value)
  }
}