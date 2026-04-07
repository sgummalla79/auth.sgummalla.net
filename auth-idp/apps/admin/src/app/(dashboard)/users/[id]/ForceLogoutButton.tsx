'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { forceLogout } from '../actions'

export function ForceLogoutButton({ userId }: { userId: string }) {
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const router = useRouter()

  async function handleLogout() {
    setLoading(true)
    setResult(null)
    const res = await forceLogout(userId)
    setResult(res)
    setLoading(false)
    setConfirming(false)
    if (res.ok) router.refresh()
  }

  return (
    <div className="relative">
      {result && (
        <div
          className="absolute right-0 -top-10 text-xs px-3 py-1.5 rounded-md whitespace-nowrap"
          style={{
            background: result.ok ? '#E1F5EE' : 'var(--color-error-bg)',
            color: result.ok ? '#085041' : 'var(--color-error-text)',
          }}
        >
          {result.message}
        </div>
      )}

      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          className="px-3 py-1.5 rounded-md text-sm font-medium text-white"
          style={{ background: 'var(--color-danger)' }}
        >
          Force Logout
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Revoke all sessions?</span>
          <button
            onClick={handleLogout}
            disabled={loading}
            className="px-3 py-1.5 rounded-md text-sm font-medium text-white disabled:opacity-50"
            style={{ background: 'var(--color-danger)' }}
          >
            {loading ? 'Revoking...' : 'Confirm'}
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="px-3 py-1.5 rounded-md text-sm border"
            style={{ borderColor: 'var(--color-border)' }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}