'use client'
import { useState } from 'react'
import Link from 'next/link'
import { AlertCircle, Loader2 } from 'lucide-react'
import type { SupabaseClient } from '@supabase/supabase-js'

// Shared pieces for the sign-in, register, forgot, reset and onboarding screens.

export const inputCls =
  'w-full h-[46px] rounded-[10px] px-3.5 text-[14px] outline-none transition-[border-color,box-shadow] ' +
  'border border-[var(--border)] bg-[var(--bg2)] text-[var(--text)] placeholder:text-[var(--text4)] ' +
  'focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-bg)]'

export type Region = 'UAE' | 'India' | 'Both'
export const REGIONS: Region[] = ['UAE', 'India', 'Both']
export const REGION_VIEW: Record<Region, 'uae' | 'india' | 'consolidated'> = { UAE: 'uae', India: 'india', Both: 'consolidated' }

export function AuthTitle({ title, sub }: { title: string; sub: React.ReactNode }) {
  return (
    <>
      <h1 className="text-[24px] md:text-[26px] font-bold tracking-[-0.01em]" style={{ color: 'var(--text)' }}>{title}</h1>
      <p className="text-[14px] leading-normal mt-1 mb-[22px]" style={{ color: 'var(--text3)' }}>{sub}</p>
    </>
  )
}

export function Field({ id, label, className = '', children }: { id: string; label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-[11px] font-semibold uppercase tracking-[0.05em] mb-1.5" style={{ color: 'var(--text3)' }}>{label}</label>
      {children}
    </div>
  )
}

export function PasswordInput({ id, value, onChange, autoComplete, placeholder = '••••••••', invalid }: {
  id: string; value: string; onChange: (v: string) => void; autoComplete: string; placeholder?: string; invalid?: boolean
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input id={id} type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)} required
        autoComplete={autoComplete} placeholder={placeholder} aria-invalid={invalid || undefined}
        className={`${inputCls} pr-16`} style={invalid ? { borderColor: 'var(--rose)' } : undefined} />
      <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 h-8 px-2.5 rounded-md text-[12px] font-medium hover:bg-white transition-colors"
        style={{ color: 'var(--text3)' }}>
        {show ? 'Hide' : 'Show'}
      </button>
    </div>
  )
}

// Same scale as the design: length 8 / 12, mixed case, number + symbol.
export function passwordScore(p: string) {
  let s = 0
  if (p.length >= 8) s++
  if (p.length >= 12) s++
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++
  if (/\d/.test(p) && /[^A-Za-z0-9]/.test(p)) s++
  return s
}
// "Good" or better (implies at least 8 characters)
export const MIN_PASSWORD_SCORE = 3

function strengthHint(p: string) {
  if (!p) return 'Use 12+ characters with a number and symbol.'
  if (p.length < 8) return 'Too short — use at least 8 characters'
  const s = passwordScore(p)
  const label = ['', 'Weak', 'Fair', 'Good', 'Strong'][s]
  const missing = p.length < 12 ? 'add length'
    : !(/[A-Z]/.test(p) && /[a-z]/.test(p)) ? 'mix upper and lower case'
    : !(/\d/.test(p) && /[^A-Za-z0-9]/.test(p)) ? 'add a number and a symbol' : ''
  return s === 4 ? label : `${label} — ${missing}`
}

export function StrengthMeter({ password }: { password: string }) {
  const s = passwordScore(password)
  const color = ['#DC2626', '#D97706', '#16A34A', '#16A34A'][s - 1]
  return (
    <div>
      <div className="flex gap-[5px] mt-[9px]" aria-hidden>
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="flex-1 h-1 rounded-sm transition-colors" style={{ background: i < s ? color : 'var(--border)' }} />
        ))}
      </div>
      <div className="text-[12px] mt-1.5" style={{ color: 'var(--text3)' }} aria-live="polite">{strengthHint(password)}</div>
    </div>
  )
}

export function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-[10px] p-3 mb-4 text-[13px] leading-snug"
      style={{ background: 'var(--rose-bg)', border: '1px solid #FECDD3', color: 'var(--rose)' }}>
      <AlertCircle size={15} className="flex-shrink-0 mt-px" /><span>{children}</span>
    </div>
  )
}

export function SuccessBox({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" className="rounded-xl p-4 text-[13.5px] leading-normal"
      style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', color: '#15803D' }}>
      {children}
    </div>
  )
}

export function PrimaryButton({ loading, loadingText, children, className = '', ...rest }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean; loadingText?: string }) {
  return (
    <button {...rest} disabled={loading || rest.disabled}
      className={`w-full h-12 rounded-[10px] text-[15px] font-semibold text-white flex items-center justify-center gap-2 transition-colors bg-[var(--accent)] hover:bg-[var(--accent2)] disabled:opacity-60 ${className}`}>
      {loading ? <><Loader2 size={16} className="animate-spin" />{loadingText}</> : children}
    </button>
  )
}

export function OrDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2.5 my-[18px] text-[12px]" style={{ color: 'var(--text4)' }}>
      <span className="flex-1 h-px" style={{ background: 'var(--border)' }} />{label}<span className="flex-1 h-px" style={{ background: 'var(--border)' }} />
    </div>
  )
}

export function GoogleButton({ supabase }: { supabase: SupabaseClient }) {
  const [loading, setLoading] = useState(false)
  async function go() {
    setLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/api/auth/callback` },
    })
    if (error) setLoading(false)
  }
  return (
    <button type="button" onClick={go} disabled={loading}
      className="w-full h-[46px] rounded-[10px] flex items-center justify-center gap-2.5 text-[14px] font-medium transition-colors hover:bg-white disabled:opacity-60"
      style={{ border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text2)' }}>
      {loading ? <Loader2 size={16} className="animate-spin" /> : (
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
      )}
      Continue with Google
    </button>
  )
}

export function BackToSignIn() {
  return (
    <div className="text-center mt-5">
      <Link href="/auth/login" className="text-[13.5px] font-semibold" style={{ color: 'var(--accent)' }}>← Back to sign in</Link>
    </div>
  )
}

export function AuthFooter() {
  return (
    <p className="text-center mt-[18px] text-[11.5px]" style={{ color: 'var(--text4)' }}>
      AES-256 encrypted · Row-level security · Your data stays yours
    </p>
  )
}
