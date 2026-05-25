'use client'
import { useState, useEffect } from 'react'
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

  if (done) return (
    <div className="text-center py-6">
      <div className="w-16 h-16 rounded-full bg-[#00C9A7]/10 flex items-center justify-center mx-auto mb-4">
        <CheckCircle size={32} className="text-[#00C9A7]" />
      </div>
      <h2 className="text-xl font-bold text-white mb-2">Password updated!</h2>
      <p className="text-sm text-slate-400">Redirecting to your dashboard…</p>
    </div>
  )

  return (
    <>
      <h1 className="text-xl font-bold text-white mb-1">Set new password</h1>
      <p className="text-sm text-slate-400 mb-6">Choose a strong password for your account</p>

      {error && <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-3 text-rose-400 text-sm mb-4">{error}</div>}

      <form onSubmit={handleReset} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">New Password</label>
          <div className="relative">
            <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required
              placeholder="••••••••"
              className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg pl-9 pr-10 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#00C9A7] transition-colors" />
            <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
              {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Confirm Password</label>
          <div className="relative">
            <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required
              placeholder="••••••••"
              className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg pl-9 pr-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#00C9A7] transition-colors" />
          </div>
        </div>
        <button type="submit" disabled={loading}
          className="w-full py-3 rounded-lg font-bold text-sm text-black flex items-center justify-center gap-2 disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg,#00C9A7,#4A90D9)' }}>
          {loading ? <><Loader2 size={15} className="animate-spin" />Updating…</> : 'Update Password'}
        </button>
      </form>
    </>
  )
}
