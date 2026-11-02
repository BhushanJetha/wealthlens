import { redirect } from 'next/navigation'
import { createClient, getRealSessionUser } from '@/lib/supabase/server'
import JoinClient from '@/components/dashboard/JoinClient'

// A family invite. Nothing is shared until the person reads this and agrees.
export default async function JoinPage({ params }: { params: { code: string } }) {
  const supabase = createClient()
  const user = await getRealSessionUser(supabase)
  if (!user) redirect('/auth/signup')
  const { data, error } = await supabase.rpc('family_invite_info', { code: params.code })
  const info = data?.[0]
  return <JoinClient code={params.code} email={user.email} state={error ? 'not_found' : info?.state ?? 'not_found'} ownerName={info?.owner_name ?? null} />
}
