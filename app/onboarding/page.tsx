import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AuthShell from '@/components/auth/AuthShell'
import OnboardingClient from '@/components/onboarding/OnboardingClient'
import { goalInterestsOf } from '@/lib/goalInterests'
import type { Region } from '@/components/auth/AuthUI'

export const metadata = { title: 'Get started — WealthLens' }

export default async function OnboardingPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('profiles').select('full_name,default_view').eq('id', user.id).single()
  const meta = user.user_metadata ?? {}
  // Region picked at sign-up wins; otherwise fall back to the saved view
  const region: Region = ['UAE', 'India', 'Both'].includes(meta.region) ? meta.region
    : profile?.default_view === 'uae' ? 'UAE' : profile?.default_view === 'india' ? 'India' : 'Both'
  const firstName = String(profile?.full_name || meta.full_name || meta.name || '').split(' ')[0] || null

  return (
    <AuthShell>
      <OnboardingClient userId={user.id} firstName={firstName} initialRegion={region} initialGoals={goalInterestsOf(meta)} />
    </AuthShell>
  )
}
