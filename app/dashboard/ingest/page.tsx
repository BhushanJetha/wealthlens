import { createClient } from '@/lib/supabase/server'
import IngestClient from '@/components/dashboard/IngestClient'

export default async function IngestPage({ searchParams }: { searchParams: { m?: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const uid = user!.id
  const since = new Date(Date.now() - 90 * 86400000).toISOString()

  const [recent, latest, accounts] = await Promise.all([
    supabase.from('transactions').select('account_id,created_at,source,txn_date')
      .eq('user_id', uid).gte('created_at', since).order('created_at', { ascending: false }).limit(5000),
    supabase.from('transactions').select('txn_date').eq('user_id', uid).order('txn_date', { ascending: false }).limit(1),
    supabase.from('accounts').select('id,name,account_type').eq('user_id', uid).eq('is_active', true),
  ])

  return <IngestClient recent={recent.data ?? []} latestTxn={latest.data?.[0]?.txn_date ?? null}
    accounts={accounts.data ?? []} initialModal={searchParams.m ?? null} />
}
