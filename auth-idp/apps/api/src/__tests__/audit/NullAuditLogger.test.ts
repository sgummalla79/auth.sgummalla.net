import { describe, it, expect, vi } from 'vitest'

/**
 * NullAuditLogger — no-op implementation for use in tests.
 * Import this wherever IAuditLogger is needed in unit tests.
 */
class NullAuditLogger {
  log = vi.fn().mockResolvedValue(undefined)
}

describe('NullAuditLogger', () => {
  it('never throws', async () => {
    const logger = new NullAuditLogger()
    await expect(logger.log({
      type: 'user.login.success',
      outcome: 'success',
    })).resolves.toBeUndefined()
  })

  it('can be used to assert audit calls', async () => {
    const logger = new NullAuditLogger()
    await logger.log({ type: 'user.login.failure', outcome: 'failure', userId: 'u1' })
    expect(logger.log).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'user.login.failure' }),
    )
  })
})