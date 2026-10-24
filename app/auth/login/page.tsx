'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { AuthTitle, Field, PasswordInput, ErrorBox, PrimaryButton, OrDivider, GoogleButton, AuthFooter, inputCls } from '@/components/auth/AuthUI'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // /api/auth/callback sends failed email / Google links back here with ?error=
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('error'))
      setError('That sign-in link has expired or was already used. Please sign in again.')
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <>
      <AuthTitle title="Welcome back" sub="Sign in to your financial dashboard" />
      {error && <ErrorBox>{error}</ErrorBox>}

      <GoogleButton supabase={supabase} />
      <OrDivider label="or with email" />

      <form onSubmit={handleLogin}>
        <Field id="email" label="Email">
          <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required
            autoComplete="email" inputMode="email" placeholder="you@example.com" className={inputCls} />
        </Field>
        <Field id="password" label="Password" className="mt-4">
          <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="current-password" />
        </Field>
        <div className="text-right mt-2.5 mb-[18px]">
          <Link href="/auth/forgot-password" className="text-[12.5px] font-semibold" style={{ color: 'var(--accent)' }}>Forgot password?</Link>
        </div>
        <PrimaryButton type="submit" loading={loading} loadingText="Signing in…">Sign in</PrimaryButton>
      </form>

      <p className="text-center mt-[22px] text-[13.5px]" style={{ color: 'var(--text3)' }}>
        No account? <Link href="/auth/signup" className="font-semibold" style={{ color: 'var(--accent)' }}>Create one free</Link>
      </p>
      <AuthFooter />
    </>
  )
}
