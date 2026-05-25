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
      redirectTo: `${window.location.origin}/auth/reset-password`
    })
    setLoading(false)
    if (error) { setError(error.message); return }
    setSent(true)
  }

  if (sent) return (
    <div className="text-center py-4">
      <div className="w-16 h-16 rounded-full bg-[#00C9A7]/10 flex items-center justify-center mx-auto mb-4">
        <CheckCircle size={32} className="text-[#00C9A7]" />
      </div>
      <h2 className="text-xl font-bold text-white mb-2">Reset link sent</h2>
      <p className="text-sm text-slate-400 mb-4">Check your inbox at <strong className="text-white">{email}</strong></p>
      <Link href="/login" className="text-sm text-[#00C9A7] hover:text-[#00A88A] flex items-center justify-center gap-1">
        <ArrowLeft size={14} /> Back to sign in
      </Link>
    </div>
  )

  return (
    <>
      <Link href="/login" className="flex items-center gap-1 text-sm text-slate-400 hover:text-white mb-6 transition-colors">
        <ArrowLeft size={14} /> Back to sign in
      </Link>
      <h1 className="text-xl font-bold text-white mb-1">Reset password</h1>
      <p className="text-sm text-slate-400 mb-6">Enter your email and we'll send a reset link</p>

      {error && (
        <div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 rounded-lg p-3 mb-4 text-rose-400 text-sm">
          <AlertCircle size={15} className="flex-shrink-0" />{error}
        </div>
      )}

      <form onSubmit={handleReset} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Email</label>
          <div className="relative">
            <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              placeholder="you@example.com"
              className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg pl-9 pr-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#00C9A7] transition-colors" />
          </div>
        </div>
        <button type="submit" disabled={loading}
          className="w-full py-3 rounded-lg font-bold text-sm text-black flex items-center justify-center gap-2"
          style={{ background: 'linear-gradient(135deg, #00C9A7, #4A90D9)' }}>
          {loading ? <><Loader2 size={15} className="animate-spin" /> Sending…</> : 'Send Reset Link'}
        </button>
      </form>
    </>
  )
}
