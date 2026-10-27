import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetchAll'
import { activeLoansWithEmi } from '@/lib/loans'
import { runRecurring } from '@/lib/recurring'
import BillsClient from '@/components/dashboard/BillsClient'

export default async function BillsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const uid = user!.id
  // This month + the 4 complete months the recurring rule looks at
  const start = new Date(); start.setUTCMonth(start.getUTCMonth() - 5)
  const fromDate = `${start.toISOString().slice(0, 7)}-01`

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' })

  // All kinds: bills come from expenses; repeating-entry suggestions also
  // look at transfers (money home) and income
  const [txns, accsRes, loansRes, insRes] = await Promise.all([
    fetchAllRows((a, b) => supabase.from('transactions').select('*')
      .eq('user_id', uid).gte('txn_date', fromDate)
      .order('txn_date', { ascending: false }).order('id').range(a, b)),
    supabase.from('accounts').select('*').eq('user_id', uid).eq('is_active', true),
    activeLoansWithEmi(supabase, uid),
    supabase.from('insurance_policies').select('*').eq('user_id', uid).eq('is_active', true),
  ])

  const rec = await runRecurring(supabase, uid, today, txns)
  const accounts = accsRes.data ?? []

  return <BillsClient transactions={rec.inserted.length ? [...rec.inserted, ...txns] : txns}
    cards={accounts.filter(a => a.account_type === 'credit_card')} accounts={accounts}
    loans={loansRes.data ?? []} insurance={insRes.data ?? []} recurring={rec.list} recurringReady={rec.ready} />
}
