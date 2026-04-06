import { randomBytes } from 'crypto'
import type { ISlugGenerator } from '../application/ports/ISlugGenerator.js'
import type { ICredentialGenerator } from '../application/ports/ICredentialGenerator.js'

export class DefaultSlugGenerator implements ISlugGenerator {
  generate(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 60)
  }
}

export class SecureCredentialGenerator implements ICredentialGenerator {
  generateClientId(): string { return `client_${randomBytes(16).toString('hex')}` }
  generateClientSecret(): string { return `secret_${randomBytes(32).toString('hex')}` }
}