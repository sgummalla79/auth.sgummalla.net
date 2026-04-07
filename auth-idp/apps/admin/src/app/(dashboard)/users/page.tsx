'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { searchUsers } from './actions'

interface User {
  id: string
  email: string
  emailVerified: boolean
  status: string
  mfaEnabled?: boolean
  lastLoginAt: string | null
  createdAt: string
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('')
  const [offset, setOffset] = useState(0)
  const limit = 20

  const load = useCallback(async () => {
    setLoading(true)
    const res = await searchUsers({ email, status, limit, offset })
    setUsers(res.users)
    setLoading(false)
  }, [email, status, offset])

  useEffect(() => { load() }, [load])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setOffset(0)
    load()
  }

  return (
    <div>
      <h1 className="text-lg font-semibold mb-6">Users</h1>

      {/* Search bar */}
      <form onSubmit={handleSearch} className="flex gap-3 mb-6 flex-wrap">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Search by email..."
          className="px-3 py-2 border rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500 w-64"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-input-bg)' }}
        />
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setOffset(0) }}
          className="px-3 py-2 border rounded-md text-sm outline-none"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-input-bg)', color: 'var(--color-text)' }}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="pending_verification">Pending</option>
          <option value="locked">Locked</option>
          <option value="disabled">Disabled</option>
        </select>
        <button
          type="submit"
          className="px-4 py-2 rounded-md text-sm font-medium text-white"
          style={{ background: 'var(--color-accent)' }}
        >
          Search
        </button>
      </form>

      {/* Table */}
      <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--color-bg)' }}>
              <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--color-text-secondary)' }}>Email</th>
              <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--color-text-secondary)' }}>Status</th>
              <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--color-text-secondary)' }}>MFA</th>
              <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--color-text-secondary)' }}>Last Login</th>
              <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--color-text-secondary)' }}>Created</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center" style={{ color: 'var(--color-text-secondary)' }}>Loading...</td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center" style={{ color: 'var(--color-text-secondary)' }}>No users found.</td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="border-t" style={{ borderColor: 'var(--color-border)' }}>
                  <td className="px-4 py-2.5">
                    <Link href={`/users/${u.id}`} className="font-medium hover:underline" style={{ color: 'var(--color-accent)' }}>
                      {u.email}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={u.status} />
                  </td>
                  <td className="px-4 py-2.5">
                    {u.mfaEnabled ? (
                      <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ background: '#E1F5EE', color: '#085041' }}>Enabled</span>
                    ) : (
                      <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Off</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5" style={{ color: 'var(--color-text-secondary)' }}>
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-2.5" style={{ color: 'var(--color-text-secondary)' }}>
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                </tr>
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
          Showing {offset + 1}–{offset + users.length}
        </span>
        <button
          onClick={() => setOffset(offset + limit)}
          disabled={users.length < limit}
          className="px-3 py-1.5 rounded-md text-sm border disabled:opacity-30"
          style={{ borderColor: 'var(--color-border)' }}
        >
          Next →
        </button>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; color: string }> = {
    active: { bg: '#E1F5EE', color: '#085041' },
    pending_verification: { bg: '#FEF3C7', color: '#92400E' },
    locked: { bg: 'var(--color-error-bg)', color: 'var(--color-error-text)' },
    disabled: { bg: '#F1EFE8', color: '#5F5E5A' },
  }
  const s = styles[status] || styles.disabled
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ background: s.bg, color: s.color }}>
      {status.replace('_', ' ')}
    </span>
  )
}