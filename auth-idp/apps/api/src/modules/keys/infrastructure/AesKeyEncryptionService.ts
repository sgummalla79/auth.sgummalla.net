import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'
import { ok, err } from '../../../shared/result/Result.js'
import type { Result } from '../../../shared/result/Result.js'
import { InternalError } from '../../../shared/errors/AppError.js'
import type { IKeyEncryptionService, EncryptedPayload } from '../application/ports/IKeyEncryptionService.js'
import type { Env } from '../../../shared/config/env.js'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const TAG_LENGTH = 16
const SALT = 'idp-signing-key-encryption-v1'

interface Deps { config: Env }

export class AesKeyEncryptionService implements IKeyEncryptionService {
  private readonly derivedKey: Buffer

  constructor({ config }: Deps) {
    this.derivedKey = scryptSync(
      config.KEY_ENCRYPTION_SECRET, SALT, 32,
      { N: 16384, r: 8, p: 1 },
    )
  }

  encrypt(plaintext: string): Result<EncryptedPayload, InternalError> {
    try {
      const iv = randomBytes(IV_LENGTH)
      const cipher = createCipheriv(ALGORITHM, this.derivedKey, iv, { authTagLength: TAG_LENGTH })
      const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
      const authTag = cipher.getAuthTag()
      const ciphertext = `${encrypted.toString('base64')}:${authTag.toString('base64')}`
      return ok({ ciphertext, iv: iv.toString('base64') })
    } catch (error) {
      return err(new InternalError('Encryption failed', error))
    }
  }

  decrypt(ciphertext: string, iv: string): Result<string, InternalError> {
    try {
      const [encryptedB64, authTagB64] = ciphertext.split(':')
      if (!encryptedB64 || !authTagB64) {
        return err(new InternalError('Invalid ciphertext format — missing auth tag'))
      }
      const decipher = createDecipheriv(
        ALGORITHM, this.derivedKey, Buffer.from(iv, 'base64'), { authTagLength: TAG_LENGTH }
      )
      decipher.setAuthTag(Buffer.from(authTagB64, 'base64'))
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encryptedB64, 'base64')),
        decipher.final(),
      ])
      return ok(decrypted.toString('utf8'))
    } catch (error) {
      return err(new InternalError('Decryption failed — key may be corrupted or tampered', error))
    }
  }
}