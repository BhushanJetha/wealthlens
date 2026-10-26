import { createClient } from '@/lib/supabase/server'
import { activeLoansWithEmi } from '@/lib/loans'
import BillsClient from '@/components/dashboard/BillsClient'

// PostgREST caps a response at 1000 rows — page through the last 5 months
async function fetchAllRows(page: (from: number, to: number) => any): Promise<any[]> {
  const out: any[] = []
  for (let i = 0; i < 5; i++) {
    const { data, error } = await page(i * 1000, i * 1000 + 999)
    if (error || !data) break
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

export default async function BillsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const uid = user!.id
  // This month + the 4 complete months the recurring rule looks at
  const start = new Date(); start.setUTCMonth(start.getUTCMonth() - 5)
  const fromDate = `${start.toISOString().slice(0, 7)}-01`

  const [txns, accsRes, loansRes, insRes] = await Promise.all([
    fetchAllRows((a, b) => supabase.from('transactions')
      .select('id,txn_date,merchant,category,sub_category,amount,currency,txn_type')
      .eq('user_id', uid).eq('txn_type', 'expense').gte('txn_date', fromDate)
      .order('txn_date', { ascending: false }).range(a, b)),
    supabase.from('accounts').select('*').eq('user_id', uid).eq('is_active', true).eq('account_type', 'credit_card'),
    activeLoansWithEmi(supabase, uid),
    supabase.from('insurance_policies').select('*').eq('user_id', uid).eq('is_active', true),
  ])

  return <BillsClient transactions={txns} cards={accsRes.data ?? []} loans={loansRes.data ?? []} insurance={insRes.data ?? []} />
}
