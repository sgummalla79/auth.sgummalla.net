import type { Result } from '../../../../shared/result/Result.js'
import type { InternalError } from '../../../../shared/errors/AppError.js'
import type { AccessToken } from '../../domain/AccessToken.js'

export interface IssueTokenInput {
  clientId: string
  audience: string[]
  tokenLifetime: number
  customClaims: Record<string, unknown>
  signingKeyPem: string
  signingKeyId: string
  algorithm: string
}

export interface IAccessTokenIssuer {
  issue(input: IssueTokenInput): Promise<Result<AccessToken, InternalError>>
}