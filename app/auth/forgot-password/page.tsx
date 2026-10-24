'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AuthTitle, Field, ErrorBox, SuccessBox, PrimaryButton, BackToSignIn, inputCls } from '@/components/auth/AuthUI'

export default function ForgotPasswordPage() {
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  async function sendLink(e?: React.FormEvent) {
    e?.preventDefault()
    setLoading(true); setError('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })
    setLoading(false)
    if (error) { setError(error.message); return }
    setSent(true)
  }

  return (
    <>
      <AuthTitle title="Reset your password" sub="Enter the email you signed up with and we will send you a link to choose a new one." />
      {error && <ErrorBox>{error}</ErrorBox>}

      {sent ? (
        <>
          <SuccessBox>
            <b>Check your inbox.</b> A reset link is on its way to {email}. Open it in this browser.
          </SuccessBox>
          <button type="button" onClick={() => sendLink()} disabled={loading}
            className="w-full h-12 mt-4 rounded-[10px] text-[14px] font-semibold transition-colors hover:bg-slate-50 disabled:opacity-60"
            style={{ border: '1px solid var(--border)', color: 'var(--text2)' }}>
            {loading ? 'Sending…' : 'Didn’t get it? Send again'}
          </button>
        </>
      ) : (
        <form onSubmit={sendLink}>
          <Field id="email" label="Email">
            <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus
              autoComplete="email" inputMode="email" placeholder="you@example.com" className={inputCls} />
          </Field>
          <PrimaryButton type="submit" loading={loading} loadingText="Sending…" className="mt-[18px]">Send reset link</PrimaryButton>
        </form>
      )}

      <BackToSignIn />
    </>
  )
}
