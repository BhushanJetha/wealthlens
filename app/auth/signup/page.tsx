'use client'
import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, Lock, Mail, User, Shield, AlertCircle, CheckCircle, Loader2 } from 'lucide-react'

const PASSWORD_RULES = [
  { label: 'At least 8 characters',  test: (p: string) => p.length >= 8 },
  { label: 'One uppercase letter',    test: (p: string) => /[A-Z]/.test(p) },
  { label: 'One number',             test: (p: string) => /\d/.test(p) },
  { label: 'One special character',  test: (p: string) => /[!@#$%^&*]/.test(p) },
]

export default function SignupPage() {
  const supabase = createClient()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const passStrength = PASSWORD_RULES.filter(r => r.test(password)).length

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password !== confirm) { setError('Passwords do not match'); return }
    if (passStrength < 4) { setError('Please meet all password requirements'); return }
    setLoading(true)
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName }, emailRedirectTo: `${window.location.origin}/api/auth/callback` },
    })
    setLoading(false)
    if (error) { setError(error.message); return }
    // When email confirmation is disabled, signUp returns an active session —
    // send the user straight into the app instead of "check your email".
    if (data.session) { window.location.href = '/dashboard'; return }
    setSuccess(true)
  }

  async function handleGoogle() {
    setGoogleLoading(true)
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/api/auth/callback` },
    })
  }

  const inputClass = "w-full rounded-lg pl-9 pr-4 py-3 text-sm focus:outline-none transition-colors"
  const inputStyle = { background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)' }

  if (success) return (
    <div className="text-center py-4">
      <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
        style={{ background: 'var(--income-bg)' }}>
        <CheckCircle size={32} style={{ color: 'var(--income)' }} />
      </div>
      <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text)' }}>Check your email</h2>
      <p className="text-sm mb-4" style={{ color: 'var(--text3)' }}>
        We sent a verification link to <strong style={{ color: 'var(--text)' }}>{email}</strong>
      </p>
      <p className="text-xs" style={{ color: 'var(--text3)' }}>Click the link to activate your account.</p>
      <Link href="/auth/login" className="mt-6 inline-block text-sm font-semibold" style={{ color: 'var(--sage)' }}>
        ← Back to sign in
      </Link>
    </div>
  )

  return (
    <>
      <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--text)' }}>Create your account</h1>
      <p className="text-sm mb-6" style={{ color: 'var(--text3)' }}>Start tracking your UAE &amp; India finances</p>

      {error && (
        <div className="flex items-center gap-2 rounded-lg p-3 mb-4 text-sm"
          style={{ background: 'var(--rose-bg)', border: '1px solid var(--rose)', color: 'var(--rose)' }}>
          <AlertCircle size={15} className="flex-shrink-0" />{error}
        </div>
      )}

      <form onSubmit={handleSignup} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text3)' }}>Full Name</label>
          <div className="relative">
            <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text3)' }} />
            <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} required
              placeholder="Your full name" className={inputClass} style={inputStyle}
              onFocus={e => (e.target.style.borderColor = 'var(--sage)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text3)' }}>Email</label>
          <div className="relative">
            <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text3)' }} />
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              placeholder="you@example.com" className={inputClass} style={inputStyle}
              onFocus={e => (e.target.style.borderColor = 'var(--sage)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text3)' }}>Password</label>
          <div className="relative">
            <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text3)' }} />
            <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required
              placeholder="••••••••" className={`${inputClass} pr-10`} style={inputStyle}
              onFocus={e => (e.target.style.borderColor = 'var(--sage)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')} />
            <button type="button" onClick={() => setShowPass(!showPass)}
              className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text3)' }}>
              {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>

          {password && (
            <div className="mt-2 space-y-1">
              <div className="flex gap-1 mb-2">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="h-1 flex-1 rounded-full transition-all"
                    style={{ background: passStrength >= i ? (passStrength >= 3 ? 'var(--income)' : 'var(--gold)') : 'var(--border2)' }} />
                ))}
              </div>
              {PASSWORD_RULES.map(r => (
                <div key={r.label} className="flex items-center gap-2 text-xs"
                  style={{ color: r.test(password) ? 'var(--income)' : 'var(--text3)' }}>
                  <CheckCircle size={10} /> {r.label}
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text3)' }}>Confirm Password</label>
          <div className="relative">
            <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text3)' }} />
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required
              placeholder="••••••••"
              className={inputClass}
              style={{ ...inputStyle, borderColor: confirm && confirm !== password ? 'var(--rose)' : 'var(--border)' }}
              onFocus={e => (e.target.style.borderColor = confirm !== password ? 'var(--rose)' : 'var(--sage)')}
              onBlur={e => (e.target.style.borderColor = confirm && confirm !== password ? 'var(--rose)' : 'var(--border)')} />
          </div>
          {confirm && confirm !== password && (
            <p className="text-xs mt-1" style={{ color: 'var(--rose)' }}>Passwords do not match</p>
          )}
        </div>

        <button type="submit" disabled={loading}
          className="w-full py-3 rounded-lg font-bold text-sm text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ background: 'var(--sage)' }}>
          {loading ? <><Loader2 size={15} className="animate-spin" /> Creating account…</> : 'Create Account'}
        </button>
      </form>

      <div className="relative my-5">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t" style={{ borderColor: 'var(--border)' }} />
        </div>
        <div className="relative text-center text-xs px-3 mx-auto w-fit"
          style={{ background: '#fff', color: 'var(--text3)' }}>or</div>
      </div>

      <button onClick={handleGoogle} disabled={googleLoading}
        className="w-full py-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-3 disabled:opacity-50"
        style={{ border: '1px solid var(--border)', color: 'var(--text2)', background: 'var(--bg2)' }}>
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

      <div className="mt-6 text-center text-sm" style={{ color: 'var(--text3)' }}>
        Already have an account?{' '}
        <Link href="/auth/login" className="font-semibold" style={{ color: 'var(--sage)' }}>Sign in</Link>
      </div>

      <div className="mt-5 flex items-center justify-center gap-2 text-xs" style={{ color: 'var(--text3)' }}>
        <Shield size={11} /> End-to-end encrypted · GDPR compliant
      </div>
    </>
  )
}
