import { createHash } from 'crypto'
import { ok, err } from '../../../shared/result/Result.js'
import type { Result } from '../../../shared/result/Result.js'
import { UnauthorizedError, InternalError } from '../../../shared/errors/AppError.js'
import type { ICertThumbprintExtractor } from '../application/ports/ICertThumbprintExtractor.js'

export class ForgeCertThumbprintExtractor implements ICertThumbprintExtractor {
  extract(certPem: string): Result<string, UnauthorizedError | InternalError> {
    try {
      if (!certPem.includes('-----BEGIN CERTIFICATE-----')) {
        return err(new UnauthorizedError('Invalid or malformed client certificate'))
      }

      const base64 = certPem
        .replace(/-----BEGIN CERTIFICATE-----/, '')
        .replace(/-----END CERTIFICATE-----/, '')
        .replace(/\s+/g, '')

      const der = Buffer.from(base64, 'base64')
      const thumbprint = createHash('sha1').update(der).digest('hex')
      return ok(thumbprint)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      if (message.includes('PEM') || message.includes('certificate')) {
        return err(new UnauthorizedError('Invalid or malformed client certificate'))
      }
      return err(new InternalError('Failed to extract certificate thumbprint', e))
    }
  }
}