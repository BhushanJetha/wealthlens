'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, Lock, Mail, Shield, AlertCircle, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    router.push('/dashboard')
    router.refresh()
  }

  async function handleGoogle() {
    setGoogleLoading(true)
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/api/auth/callback` }
    })
  }

  return (
    <>
      <h1 className="text-xl font-bold text-white mb-1">Welcome back</h1>
      <p className="text-sm text-slate-400 mb-6">Sign in to your financial dashboard</p>

      {error && (
        <div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 rounded-lg p-3 mb-4 text-rose-400 text-sm">
          <AlertCircle size={15} className="flex-shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Email</label>
          <div className="relative">
            <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)} required
              placeholder="you@example.com"
              className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg pl-9 pr-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#00C9A7] transition-colors"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Password</label>
          <div className="relative">
            <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required
              placeholder="••••••••"
              className="w-full bg-[#0D1B2A] border border-white/10 rounded-lg pl-9 pr-10 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#00C9A7] transition-colors"
            />
            <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
              {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        <div className="flex justify-end">
          <Link href="/auth/forgot-password" className="text-xs text-[#00C9A7] hover:text-[#00A88A]">Forgot password?</Link>
        </div>

        <button type="submit" disabled={loading}
          className="w-full py-3 rounded-lg font-bold text-sm text-black transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ background: loading ? '#00A88A' : 'linear-gradient(135deg, #00C9A7, #4A90D9)' }}>
          {loading ? <><Loader2 size={15} className="animate-spin" /> Signing in…</> : 'Sign In'}
        </button>
      </form>

      <div className="relative my-5">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/8" /></div>
        <div className="relative text-center text-xs text-slate-500 bg-[#162032] px-3 mx-auto w-fit">or continue with</div>
      </div>

      <button onClick={handleGoogle} disabled={googleLoading}
        className="w-full py-3 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-sm text-white font-medium transition-all flex items-center justify-center gap-3 disabled:opacity-50">
        {googleLoading ? <Loader2 size={15} className="animate-spin" /> : (
          <svg width="16" height="16" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
        )}
        Continue with Google
      </button>

      <div className="mt-6 text-center text-sm text-slate-500">
        No account?{' '}
        <Link href="/auth/signup" className="text-[#00C9A7] hover:text-[#00A88A] font-semibold">Create one free</Link>
      </div>

      <div className="mt-5 flex items-center justify-center gap-2 text-xs text-slate-600">
        <Shield size={11} /> AES-256 encrypted · Zero-knowledge storage
      </div>
    </>
  )
}
