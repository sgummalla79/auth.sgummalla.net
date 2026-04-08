import { describe, it, expect } from 'vitest'
import { AuditEvent } from '../../modules/audit/domain/AuditEvent.js'

describe('AuditEvent', () => {
  it('holds all event properties', () => {
    const now = new Date()
    const event = new AuditEvent(
      'evt_123',
      'user.login.success',
      'success',
      'user_abc',
      null,
      'trace_xyz',
      '127.0.0.1',
      'Mozilla/5.0',
      { email: 'alice@example.com' },
      now,
      ''
    )

    expect(event.id).toBe('evt_123')
    expect(event.type).toBe('user.login.success')
    expect(event.outcome).toBe('success')
    expect(event.userId).toBe('user_abc')
    expect(event.appId).toBeNull()
    expect(event.traceId).toBe('trace_xyz')
    expect(event.metadata).toEqual({ email: 'alice@example.com' })
    expect(event.occurredAt).toBe(now)
  })

  it('supports failure outcome', () => {
    const event = new AuditEvent(
      'evt_456',
      'user.login.failure',
      'failure',
      null,
      null,
      null,
      null,
      null,
      { reason: 'invalid_password' },
      new Date(),
      ''
    )
    expect(event.outcome).toBe('failure')
    expect(event.userId).toBeNull()
  })
})