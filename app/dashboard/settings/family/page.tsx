import { createClient, getRealSessionUser } from '@/lib/supabase/server'
import { isMissingTable } from '@/lib/supabase/missingTable'
import FamilyClient from '@/components/dashboard/FamilyClient'

// Settings › Family: an owner's members and invites, or a member's family and the way out
export default async function FamilyPage() {
  const supabase = createClient()
  const user = await getRealSessionUser(supabase)
  const uid = user!.id
  const { data, error } = await supabase.from('family_links').select('*').order('created_at')
  const rows = data ?? []
  const joined = rows.find((l: any) => l.member_id === uid && l.status === 'active') ?? null
  // Whose family (their first name comes with the invite details)
  let ownerName: string | null = null
  if (joined) {
    const { data: info } = await supabase.rpc('family_invite_info', { code: joined.invite_code })
    ownerName = info?.[0]?.owner_name ?? null
  }
  return (
    <FamilyClient ready={!isMissingTable(error)} viewing={!!(supabase as any).__viewAs} joined={joined} ownerName={ownerName}
      links={rows.filter((l: any) => l.owner_id === uid)} />
  )
}
