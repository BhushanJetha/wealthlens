import { notFound } from 'next/navigation'
import { createClient, getSessionUser } from '@/lib/supabase/server'
import { HTYPES, isHType } from '@/lib/holding'
import { holdingValue } from '@/lib/netWorth'
import HoldingClient from '@/components/dashboard/HoldingClient'

// One holding of any kind: its own page (lib/holding), opened from its list
export default async function HoldingPage({ params }: { params: { type: string; id: string } }) {
  if (!isHType(params.type)) return notFound()
  const type = params.type, meta = HTYPES[type]
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  const uid = user!.id
  const [rowRes, peersRes, txnRes] = await Promise.all([
    supabase.from(type).select('*').eq('user_id', uid).eq('id', params.id).maybeSingle(),
    supabase.from(type).select('*').eq('user_id', uid),
    meta.asset
      ? supabase.from('investment_transactions').select('*').eq('user_id', uid).eq('asset_id', params.id).order('txn_date', { ascending: true })
      : Promise.resolve({ data: [] as any[] }),
  ])
  const row = rowRes.data
  if (!row) return notFound()
  // Share of what you hold of this kind, in this currency
  const peers = (peersRes.data ?? []).filter((r: any) => (r.currency === 'AED') === (row.currency === 'AED') && r.is_active !== false)
  const kindTotal = peers.reduce((s: number, r: any) => s + holdingValue[meta.key](r), 0)
  return <HoldingClient type={type} row={row} txns={txnRes.data ?? []} kindTotal={kindTotal} />
}
