'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  AuthTitle, Field, PasswordInput, StrengthMeter, ErrorBox, SuccessBox, PrimaryButton, passwordScore, MIN_PASSWORD_SCORE,
} from '@/components/auth/AuthUI'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [done, setDone]         = useState(false)
  const [error, setError]       = useState('')
  const supabase = createClient()
  const router   = useRouter()
  const mismatch = confirm.length > 0 && confirm !== password

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    if (passwordScore(password) < MIN_PASSWORD_SCORE) { setError('Pick a stronger password — at least “Good” on the meter.'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setLoading(true); setError('')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setLoading(false); setError(error.message); return }
    // Anyone holding an old session elsewhere has to sign in again
    await supabase.auth.signOut({ scope: 'others' })
    setLoading(false)
    setDone(true)
    setTimeout(() => router.push('/dashboard'), 2000)
  }

  if (done) return (
    <>
      <AuthTitle title="Password updated" sub="Taking you to your dashboard…" />
      <SuccessBox><b>All set.</b> Other devices have been signed out.</SuccessBox>
    </>
  )

  return (
    <>
      <AuthTitle title="Choose a new password" sub="You will be signed out on other devices." />
      {error && <ErrorBox>{error}</ErrorBox>}

      <form onSubmit={handleReset}>
        <Field id="password" label="New password">
          <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="new-password" placeholder="At least 8 characters" />
          <StrengthMeter password={password} />
        </Field>
        <Field id="confirm" label="Confirm password" className="mt-3.5">
          <PasswordInput id="confirm" value={confirm} onChange={setConfirm} autoComplete="new-password" placeholder="Repeat it" invalid={mismatch} />
          {mismatch && <p className="text-[12px] mt-1.5" style={{ color: 'var(--rose)' }}>Passwords do not match</p>}
        </Field>
        <PrimaryButton type="submit" loading={loading} loadingText="Updating…" className="mt-5">Update password</PrimaryButton>
      </form>
    </>
  )
}
