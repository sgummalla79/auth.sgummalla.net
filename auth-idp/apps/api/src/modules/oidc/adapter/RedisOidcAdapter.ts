import type { Redis } from 'ioredis'
import type { Adapter, AdapterPayload } from 'oidc-provider'
import type { IApplicationRepository } from '../../applications/application/ports/IApplicationRepository.js'
import type { Logger } from '../../../shared/logger/logger.js'

// ─── Module-level dependency store ───────────────────────────────────────────
// oidc-provider calls `new Adapter(name)` — closures don't survive this.
// We store deps at module scope so the class methods can always reach them.

let _redis: Redis
let _getRepo: () => IApplicationRepository
let _logger: Logger

export function initOidcAdapter(
  redis: Redis,
  getRepo: () => IApplicationRepository,
  logger: Logger,
): void {
  _redis = redis
  _getRepo = getRepo
  _logger = logger
}

// ─── Single adapter class — handles all model types ───────────────────────────

export class OidcAdapter implements Adapter {
  private readonly prefix: string

  constructor(public readonly name: string) {
    this.prefix = `oidc:${name.toLowerCase()}:`
  }

  private key(id: string): string { return `${this.prefix}${id}` }
  private uidKey(uid: string): string { return `${this.prefix}uid:${uid}` }
  private userCodeKey(uc: string): string { return `${this.prefix}userCode:${uc}` }

  async upsert(id: string, payload: AdapterPayload, expiresIn: number): Promise<void> {
    if (this.name === 'Client') return

    const pipeline = _redis.pipeline()
    const value = JSON.stringify(payload)

    if (expiresIn > 0) {
      pipeline.setex(this.key(id), expiresIn, value)
    } else {
      pipeline.set(this.key(id), value)
    }

    if (payload.uid) pipeline.setex(this.uidKey(payload.uid), expiresIn || 3600, id)
    if (payload.userCode) pipeline.setex(this.userCodeKey(payload.userCode), expiresIn || 3600, id)

    await pipeline.exec()
  }

  async find(id: string): Promise<AdapterPayload | undefined> {
    // Client model — query our database
    if (this.name === 'Client') {
      const repo = _getRepo()
      const result = await repo.findOidcClientByClientId(id)

      if (result.isErr()) {
        _logger.debug({ clientId: id }, 'OIDC client not found')
        return undefined
      }

      const client = result.value
      const secret = `oidc_${client.clientId}`
      console.log('>>> CLIENT SECRET BEING SET:', secret)
      return {
        client_id: client.clientId,
        client_secret: `oidc_${client.clientId}`,
        redirect_uris: client.redirectUris,
        post_logout_redirect_uris: client.postLogoutUris,
        grant_types: client.grantTypes,
        response_types: client.responseTypes,
        scope: client.scopes.join(' '),
        token_endpoint_auth_method: 'client_secret_post',
        require_pkce: true,
        ...(client.accessTokenTtl && { access_token_ttl: client.accessTokenTtl }),
      } as AdapterPayload
    }

    // All other models — Redis
    const raw = await _redis.get(this.key(id))
    if (!raw) return undefined
    return JSON.parse(raw) as AdapterPayload
  }

  async findByUid(uid: string): Promise<AdapterPayload | undefined> {
    const id = await _redis.get(this.uidKey(uid))
    if (!id) return undefined
    return this.find(id)
  }

  async findByUserCode(userCode: string): Promise<AdapterPayload | undefined> {
    const id = await _redis.get(this.userCodeKey(userCode))
    if (!id) return undefined
    return this.find(id)
  }

  async destroy(id: string): Promise<void> {
    if (this.name === 'Client') return
    const payload = await this.find(id)
    const pipeline = _redis.pipeline()
    pipeline.del(this.key(id))
    if (payload?.uid) pipeline.del(this.uidKey(payload.uid))
    if (payload?.userCode) pipeline.del(this.userCodeKey(payload.userCode))
    await pipeline.exec()
  }

  async revokeByGrantId(grantId: string): Promise<void> {
    const ids = await _redis.smembers(`oidc:grant:${grantId}`)
    const pipeline = _redis.pipeline()
    for (const id of ids) pipeline.del(id)
    pipeline.del(`oidc:grant:${grantId}`)
    await pipeline.exec()
  }

  async consume(id: string): Promise<void> {
    const key = this.prefix + id
    const raw = await _redis.get(key)
    if (!raw) return

    try {
      const payload = JSON.parse(raw)
      payload.consumed = Math.floor(Date.now() / 1000)
      // Get remaining TTL so we don't extend or shorten it
      const ttl = await _redis.ttl(key)
      if (ttl > 0) {
        await _redis.setex(key, ttl, JSON.stringify(payload))
      } else {
        await _redis.set(key, JSON.stringify(payload))
      }
    } catch {
      // Key already expired or malformed — nothing to consume
    }
  }
}