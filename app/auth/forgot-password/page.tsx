'use client'
import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Mail, AlertCircle, CheckCircle, Loader2, ArrowLeft } from 'lucide-react'

export default function ForgotPasswordPage() {
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })
    setLoading(false)
    if (error) { setError(error.message); return }
    setSent(true)
  }

  if (sent) return (
    <div className="text-center py-4">
      <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
        style={{ background: 'var(--income-bg)' }}>
        <CheckCircle size={32} style={{ color: 'var(--income)' }} />
      </div>
      <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text)' }}>Reset link sent</h2>
      <p className="text-sm mb-4" style={{ color: 'var(--text3)' }}>
        Check your inbox at <strong style={{ color: 'var(--text)' }}>{email}</strong>
      </p>
      <Link href="/auth/login" className="text-sm font-semibold flex items-center justify-center gap-1"
        style={{ color: 'var(--sage)' }}>
        <ArrowLeft size={14} /> Back to sign in
      </Link>
    </div>
  )

  return (
    <>
      <Link href="/auth/login" className="flex items-center gap-1 text-sm mb-6 font-semibold"
        style={{ color: 'var(--text3)' }}>
        <ArrowLeft size={14} /> Back to sign in
      </Link>
      <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--text)' }}>Reset password</h1>
      <p className="text-sm mb-6" style={{ color: 'var(--text3)' }}>Enter your email and we'll send a reset link</p>

      {error && (
        <div className="flex items-center gap-2 rounded-lg p-3 mb-4 text-sm"
          style={{ background: 'var(--rose-bg)', border: '1px solid var(--rose)', color: 'var(--rose)' }}>
          <AlertCircle size={15} className="flex-shrink-0" />{error}
        </div>
      )}

      <form onSubmit={handleReset} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text3)' }}>Email</label>
          <div className="relative">
            <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text3)' }} />
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              placeholder="you@example.com"
              className="w-full rounded-lg pl-9 pr-4 py-3 text-sm focus:outline-none transition-colors"
              style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)' }}
              onFocus={e => (e.target.style.borderColor = 'var(--sage)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
          </div>
        </div>
        <button type="submit" disabled={loading}
          className="w-full py-3 rounded-lg font-bold text-sm text-white flex items-center justify-center gap-2 disabled:opacity-50"
          style={{ background: 'var(--sage)' }}>
          {loading ? <><Loader2 size={15} className="animate-spin" /> Sending…</> : 'Send Reset Link'}
        </button>
      </form>
    </>
  )
}
