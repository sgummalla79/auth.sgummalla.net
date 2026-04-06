export abstract class AppError extends Error {
  abstract readonly code: string
  abstract readonly statusCode: number

  constructor(message: string, public readonly cause?: unknown) {
    super(message)
    this.name = this.constructor.name
    Error.captureStackTrace(this, this.constructor)
  }

  toJSON(): Record<string, unknown> {
    return { code: this.code, message: this.message }
  }
}

export class ValidationError extends AppError {
  readonly code = 'VALIDATION_ERROR' as const
  readonly statusCode = 422
  constructor(message: string, public readonly fields?: Record<string, string[]>, cause?: unknown) {
    super(message, cause)
  }
  override toJSON(): Record<string, unknown> {
    return { ...super.toJSON(), ...(this.fields && { fields: this.fields }) }
  }
}

export class UnauthorizedError extends AppError {
  readonly code = 'UNAUTHORIZED' as const
  readonly statusCode = 401
}

export class ForbiddenError extends AppError {
  readonly code = 'FORBIDDEN' as const
  readonly statusCode = 403
}

export class NotFoundError extends AppError {
  readonly code = 'NOT_FOUND' as const
  readonly statusCode = 404
}

export class ConflictError extends AppError {
  readonly code = 'CONFLICT' as const
  readonly statusCode = 409
}

export class InternalError extends AppError {
  readonly code = 'INTERNAL_ERROR' as const
  readonly statusCode = 500
}

export class DatabaseError extends AppError {
  readonly code = 'DATABASE_ERROR' as const
  readonly statusCode = 500
}

export class ServiceUnavailableError extends AppError {
  readonly code = 'SERVICE_UNAVAILABLE' as const
  readonly statusCode = 503
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError
}

export class CacheError extends AppError {
  readonly code = 'CACHE_ERROR' as const
  readonly statusCode = 500
}