'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Lock, Eye, EyeOff, CheckCircle, Loader2 } from 'lucide-react'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [done, setDone]         = useState(false)
  const [error, setError]       = useState('')
  const supabase = createClient()
  const router   = useRouter()

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match'); return }
    if (password.length < 8)  { setError('Password must be at least 8 characters'); return }
    setLoading(true); setError('')
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) { setError(error.message); return }
    setDone(true)
    setTimeout(() => router.push('/dashboard'), 2000)
  }

  const inputStyle = { background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)' }
  const inputClass = "w-full rounded-lg pl-9 pr-10 py-3 text-sm focus:outline-none transition-colors"

  if (done) return (
    <div className="text-center py-6">
      <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
        style={{ background: 'var(--income-bg)' }}>
        <CheckCircle size={32} style={{ color: 'var(--income)' }} />
      </div>
      <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text)' }}>Password updated!</h2>
      <p className="text-sm" style={{ color: 'var(--text3)' }}>Redirecting to your dashboard…</p>
    </div>
  )

  return (
    <>
      <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--text)' }}>Set new password</h1>
      <p className="text-sm mb-6" style={{ color: 'var(--text3)' }}>Choose a strong password for your account</p>

      {error && (
        <div className="rounded-lg p-3 text-sm mb-4"
          style={{ background: 'var(--rose-bg)', border: '1px solid var(--rose)', color: 'var(--rose)' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleReset} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text3)' }}>New Password</label>
          <div className="relative">
            <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text3)' }} />
            <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required
              placeholder="••••••••" className={inputClass} style={inputStyle}
              onFocus={e => (e.target.style.borderColor = 'var(--sage)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
            <button type="button" onClick={() => setShowPass(!showPass)}
              className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text3)' }}>
              {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text3)' }}>Confirm Password</label>
          <div className="relative">
            <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text3)' }} />
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required
              placeholder="••••••••" className="w-full rounded-lg pl-9 pr-4 py-3 text-sm focus:outline-none transition-colors"
              style={inputStyle}
              onFocus={e => (e.target.style.borderColor = 'var(--sage)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
          </div>
        </div>
        <button type="submit" disabled={loading}
          className="w-full py-3 rounded-lg font-bold text-sm text-white flex items-center justify-center gap-2 disabled:opacity-50"
          style={{ background: 'var(--sage)' }}>
          {loading ? <><Loader2 size={15} className="animate-spin" />Updating…</> : 'Update Password'}
        </button>
      </form>
    </>
  )
}
