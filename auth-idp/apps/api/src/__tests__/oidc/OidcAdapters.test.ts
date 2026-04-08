import { describe, it, expect } from 'vitest'

describe('RedisOidcAdapter', () => {
  it('has correct name', async () => {
    const { OidcAdapter, initOidcAdapter } = await import('../../modules/oidc/adapter/RedisOidcAdapter.js')
    const mockRedis = {
      pipeline: () => ({ setex: () => mockRedis.pipeline(), set: () => mockRedis.pipeline(), del: () => mockRedis.pipeline(), exec: async () => [] }),
      get: async () => null,
      smembers: async () => [],
      hset: async () => 1,
    } as any
    initOidcAdapter(mockRedis, () => ({} as any), { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} } as any)
    const adapter = new OidcAdapter('AccessToken')
    expect(adapter.name).toBe('AccessToken')
  })

  it('returns undefined for missing key', async () => {
    const { OidcAdapter, initOidcAdapter } = await import('../../modules/oidc/adapter/RedisOidcAdapter.js')
    const mockRedis = { get: async () => null } as any
    initOidcAdapter(mockRedis, () => ({} as any), { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} } as any)
    const adapter = new OidcAdapter('AccessToken')
    expect(await adapter.find('nonexistent')).toBeUndefined()
  })

  it('parses stored JSON correctly', async () => {
    const { OidcAdapter, initOidcAdapter } = await import('../../modules/oidc/adapter/RedisOidcAdapter.js')
    const payload = { sub: 'user-123', iat: 1234567890 }
    const mockRedis = {
      get: async (key: string) => key.includes('test-id') ? JSON.stringify(payload) : null,
    } as any
    initOidcAdapter(mockRedis, () => ({} as any), { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} } as any)
    const adapter = new OidcAdapter('AccessToken')
    expect(await adapter.find('test-id')).toEqual(payload)
  })
})

describe('OidcAccountAdapter', () => {
  it('returns undefined for unknown user', async () => {
    const { OidcAccountAdapter } = await import('../../modules/oidc/adapter/OidcAccountAdapter.js')
    const { err } = await import('../../shared/result/Result.js')
    const { NotFoundError } = await import('../../shared/errors/AppError.js')
    const pino = (await import('pino')).default
    const mockRepo = { findById: async () => err(new NotFoundError('not found')) } as any
    const adapter = new OidcAccountAdapter(mockRepo, pino({ level: 'silent' }))
    expect(await adapter.findAccount({}, 'unknown')).toBeUndefined()
  })

  it('returns account with correct claims', async () => {
    const { OidcAccountAdapter } = await import('../../modules/oidc/adapter/OidcAccountAdapter.js')
    const { ok } = await import('../../shared/result/Result.js')
    const { User } = await import('../../modules/users/domain/User.js')
    const { UserProfile } = await import('../../modules/users/domain/UserProfile.js')
    const pino = (await import('pino')).default

    const user = new User('user-123', 'org-123', 'alice@example.com', true, '$hash', 'active', 0, null, new Date(), new Date(), null)
    const profile = new UserProfile('user-123', 'Alice', 'Smith', null, null, 'en', 'UTC', {}, new Date())

    const mockRepo = {
      findById: async () => ok(user),
      findProfile: async () => ok(profile),
    } as any

    const adapter = new OidcAccountAdapter(mockRepo, pino({ level: 'silent' }))
    const account = await adapter.findAccount({}, 'user-123')

    expect(account).toBeDefined()
    expect(account!.accountId).toBe('user-123')

    const claims = await account!.claims('userinfo', 'openid email profile', {}, [])
    expect(claims['sub']).toBe('user-123')
    expect(claims['email']).toBe('alice@example.com')
    expect(claims['given_name']).toBe('Alice')
  })
})