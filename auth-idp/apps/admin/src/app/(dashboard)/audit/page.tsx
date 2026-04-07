'use client'

import { useState, useEffect, useCallback } from 'react'
import { queryAuditEvents, getAuditEvent } from './actions'
import type { AuditEvent } from './actions'

const EVENT_TYPES = [
  'user.login.success',
  'user.login.failure',
  'user.logout',
  'user.register',
  'user.password.change',
  'mfa.setup',
  'mfa.activated',
  'mfa.validated',
  'mfa.validation.failure',
  'mfa.backup_code.used',
  'saml.sso.success',
  'saml.sso.failure',
  'saml.slo',
  'oidc.token.issued',
  'oidc.token.revoked',
  'jwt.token.issued',
  'key.rotated',
  'key.generated',
  'session.revoked',
  'session.revoked_all',
  'admin.action',
]

export default function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedEvent, setExpandedEvent] = useState<AuditEvent | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  // Filters
  const [type, setType] = useState('')
  const [outcome, setOutcome] = useState('')
  const [userId, setUserId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [offset, setOffset] = useState(0)
  const limit = 25

  const load = useCallback(async () => {
    setLoading(true)
    const res = await queryAuditEvents({ type, outcome, userId, from, to, limit, offset })
    setEvents(res.events)
    setLoading(false)
  }, [type, outcome, userId, from, to, offset])

  useEffect(() => { load() }, [load])

  async function handleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null)
      setExpandedEvent(null)
      return
    }
    setExpandedId(id)
    setLoadingDetail(true)
    const detail = await getAuditEvent(id)
    setExpandedEvent(detail)
    setLoadingDetail(false)
  }

  function handleFilter(e: React.FormEvent) {
    e.preventDefault()
    setOffset(0)
    load()
  }

  function resetFilters() {
    setType('')
    setOutcome('')
    setUserId('')
    setFrom('')
    setTo('')
    setOffset(0)
  }

  return (
    <div>
      <h1 className="text-lg font-semibold mb-6">Audit Log</h1>

      {/* Filters */}
      <form onSubmit={handleFilter} className="rounded-lg border p-4 mb-6 space-y-3" style={{ borderColor: 'var(--color-border)' }}>
        <div className="flex gap-3 flex-wrap">
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm outline-none"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-input-bg)', color: 'var(--color-text)' }}
          >
            <option value="">All event types</option>
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          <select
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm outline-none"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-input-bg)', color: 'var(--color-text)' }}
          >
            <option value="">All outcomes</option>
            <option value="success">Success</option>
            <option value="failure">Failure</option>
          </select>

          <input
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="User ID (UUID)"
            className="px-3 py-2 border rounded-md text-sm outline-none w-64 font-mono"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-input-bg)' }}
          />
        </div>

        <div className="flex gap-3 flex-wrap items-end">
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--color-text-secondary)' }}>From</label>
            <input
              type="datetime-local"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="px-3 py-2 border rounded-md text-sm outline-none"
              style={{ borderColor: 'var(--color-border)', background: 'var(--color-input-bg)', color: 'var(--color-text)' }}
            />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--color-text-secondary)' }}>To</label>
            <input
              type="datetime-local"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="px-3 py-2 border rounded-md text-sm outline-none"
              style={{ borderColor: 'var(--color-border)', background: 'var(--color-input-bg)', color: 'var(--color-text)' }}
            />
          </div>

          <button
            type="submit"
            className="px-4 py-2 rounded-md text-sm font-medium text-white"
            style={{ background: 'var(--color-accent)' }}
          >
            Apply Filters
          </button>
          <button
            type="button"
            onClick={resetFilters}
            className="px-4 py-2 rounded-md text-sm border"
            style={{ borderColor: 'var(--color-border)' }}
          >
            Reset
          </button>
        </div>
      </form>

      {/* Table */}
      <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--color-bg)' }}>
              <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--color-text-secondary)' }}>Time</th>
              <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--color-text-secondary)' }}>Event</th>
              <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--color-text-secondary)' }}>Outcome</th>
              <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--color-text-secondary)' }}>User</th>
              <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--color-text-secondary)' }}>IP</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center" style={{ color: 'var(--color-text-secondary)' }}>Loading...</td>
              </tr>
            ) : events.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center" style={{ color: 'var(--color-text-secondary)' }}>No audit events found.</td>
              </tr>
            ) : (
              events.map((ev) => (
                <EventRow
                  key={ev.id}
                  event={ev}
                  expanded={expandedId === ev.id}
                  expandedEvent={expandedId === ev.id ? expandedEvent : null}
                  loadingDetail={expandedId === ev.id && loadingDetail}
                  onToggle={() => handleExpand(ev.id)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex gap-3 mt-4">
        <button
          onClick={() => setOffset(Math.max(0, offset - limit))}
          disabled={offset === 0}
          className="px-3 py-1.5 rounded-md text-sm border disabled:opacity-30"
          style={{ borderColor: 'var(--color-border)' }}
        >
          ← Previous
        </button>
        <span className="px-3 py-1.5 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Showing {offset + 1}–{offset + events.length}
        </span>
        <button
          onClick={() => setOffset(offset + limit)}
          disabled={events.length < limit}
          className="px-3 py-1.5 rounded-md text-sm border disabled:opacity-30"
          style={{ borderColor: 'var(--color-border)' }}
        >
          Next →
        </button>
      </div>
    </div>
  )
}

function EventRow({
  event,
  expanded,
  expandedEvent,
  loadingDetail,
  onToggle,
}: {
  event: AuditEvent
  expanded: boolean
  expandedEvent: AuditEvent | null
  loadingDetail: boolean
  onToggle: () => void
}) {
  return (
    <>
      <tr
        className="border-t cursor-pointer"
        style={{ borderColor: 'var(--color-border)', background: expanded ? 'var(--color-bg)' : undefined }}
        onClick={onToggle}
      >
        <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: 'var(--color-text-secondary)' }}>
          {new Date(event.occurredAt).toLocaleString()}
        </td>
        <td className="px-4 py-2.5">
          <span className="font-mono text-xs">{event.type}</span>
        </td>
        <td className="px-4 py-2.5">
          <OutcomeBadge outcome={event.outcome} />
        </td>
        <td className="px-4 py-2.5 font-mono text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          {event.userId ? event.userId.substring(0, 8) + '...' : '—'}
        </td>
        <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          {event.ipAddress ?? '—'}
        </td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={5} className="px-4 py-4 border-t" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}>
            {loadingDetail ? (
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Loading details...</p>
            ) : expandedEvent ? (
              <EventDetail event={expandedEvent} />
            ) : (
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Failed to load event detail.</p>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

function EventDetail({ event }: { event: AuditEvent }) {
  const fields = [
    { label: 'Event ID', value: event.id },
    { label: 'Type', value: event.type },
    { label: 'Outcome', value: event.outcome },
    { label: 'User ID', value: event.userId ?? '—' },
    { label: 'App ID', value: event.appId ?? '—' },
    { label: 'Trace ID', value: event.traceId ?? '—' },
    { label: 'IP Address', value: event.ipAddress ?? '—' },
    { label: 'User Agent', value: event.userAgent ?? '—' },
    { label: 'Occurred At', value: new Date(event.occurredAt).toLocaleString() },
  ]

  const hasMetadata = event.metadata && Object.keys(event.metadata).length > 0

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
        {fields.map(({ label, value }) => (
          <div key={label} className="flex justify-between gap-2">
            <span style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
            <span className="font-mono text-xs text-right" style={{ wordBreak: 'break-all' }}>{value}</span>
          </div>
        ))}
      </div>

      {hasMetadata && (
        <div>
          <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>Metadata</p>
          <pre
            className="text-xs p-3 rounded-md overflow-x-auto font-mono"
            style={{
              background: 'var(--color-card)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
            }}
          >
            {JSON.stringify(event.metadata, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  const isSuccess = outcome === 'success'
  return (
    <span
      className="text-xs font-medium px-2 py-0.5 rounded"
      style={{
        background: isSuccess ? '#E1F5EE' : 'var(--color-error-bg)',
        color: isSuccess ? '#085041' : 'var(--color-error-text)',
      }}
    >
      {outcome}
    </span>
  )
}