'use client'
import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  AuthTitle, Field, PasswordInput, StrengthMeter, ErrorBox, SuccessBox, PrimaryButton, OrDivider, GoogleButton,
  BackToSignIn, inputCls, passwordScore, MIN_PASSWORD_SCORE, REGIONS, type Region,
} from '@/components/auth/AuthUI'

export default function SignupPage() {
  const supabase = createClient()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [region, setRegion] = useState<Region>('Both')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (passwordScore(password) < MIN_PASSWORD_SCORE) {
      setError('Pick a stronger password — at least “Good” on the meter.'); return
    }
    setLoading(true)
    // Region rides along in user metadata; onboarding pre-selects it.
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName, region }, emailRedirectTo: `${window.location.origin}/api/auth/callback` },
    })
    setLoading(false)
    if (error) { setError(error.message); return }
    // When email confirmation is disabled, signUp returns an active session —
    // go straight to setup instead of "check your email".
    if (data.session) { window.location.href = '/onboarding'; return }
    setSent(true)
  }

  if (sent) return (
    <>
      <AuthTitle title="Confirm your email" sub="One last step before your dashboard." />
      <SuccessBox>
        <b>Check your inbox.</b> We sent a confirmation link to {email}. Open it in this browser to finish setting up.
      </SuccessBox>
      <BackToSignIn />
    </>
  )

  return (
    <>
      <AuthTitle title="Create your account" sub="Free. Takes under a minute." />
      {error && <ErrorBox>{error}</ErrorBox>}

      <GoogleButton supabase={supabase} />
      <OrDivider label="or with email" />

      <form onSubmit={handleSignup}>
        <Field id="name" label="Full name">
          <input id="name" type="text" value={fullName} onChange={e => setFullName(e.target.value)} required
            autoComplete="name" placeholder="Your full name" className={inputCls} />
        </Field>
        <Field id="email" label="Email" className="mt-3.5">
          <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required
            autoComplete="email" inputMode="email" placeholder="you@example.com" className={inputCls} />
        </Field>
        <Field id="password" label="Password" className="mt-3.5">
          <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="new-password" placeholder="At least 8 characters" />
          <StrengthMeter password={password} />
        </Field>

        <fieldset className="mt-4">
          <legend className="block text-[11px] font-semibold uppercase tracking-[0.05em] mb-2" style={{ color: 'var(--text3)' }}>I manage money in</legend>
          <div className="flex gap-2">
            {REGIONS.map(r => {
              const on = region === r
              return (
                <button key={r} type="button" onClick={() => setRegion(r)} aria-pressed={on}
                  className="flex-1 h-[42px] rounded-[9px] text-[13.5px] font-semibold transition-colors"
                  style={on
                    ? { background: 'var(--accent-bg)', border: '1px solid var(--accent)', color: 'var(--accent2)' }
                    : { border: '1px solid var(--border)', color: 'var(--text2)' }}>
                  {r}
                </button>
              )
            })}
          </div>
        </fieldset>

        <PrimaryButton type="submit" loading={loading} loadingText="Creating account…" className="mt-[22px]">Create account</PrimaryButton>
      </form>

      <p className="text-center mt-[18px] text-[13.5px]" style={{ color: 'var(--text3)' }}>
        Already registered? <Link href="/auth/login" className="font-semibold" style={{ color: 'var(--accent)' }}>Sign in</Link>
      </p>
    </>
  )
}
