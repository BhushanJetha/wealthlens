import { createClient } from '@/lib/supabase/server'
import ReportClient from '@/components/dashboard/ReportClient'

// PostgREST caps a response at 1000 rows — page through the whole window
async function fetchAllRows(page: (from: number, to: number) => any): Promise<any[]> {
  const out: any[] = []
  for (let i = 0; i < 20; i++) {
    const { data, error } = await page(i * 1000, i * 1000 + 999)
    if (error || !data) break
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

export default async function ReportsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const uid = user!.id
  // This year and the two before it: enough for yearly views and "vs last year"
  const fromDate = `${new Date().getFullYear() - 2}-01-01`

  const txns = await fetchAllRows((a, b) => supabase.from('transactions')
    .select('id,txn_date,amount,currency,category,sub_category,txn_type,merchant,account_id')
    .eq('user_id', uid).gte('txn_date', fromDate)
    .order('txn_date', { ascending: false }).range(a, b))

  // Card accounts: a card bill counts only when that month's card purchases
  // weren't imported (lib/money markUnitemisedCardBills)
  const { data: cards } = await supabase.from('accounts').select('id').eq('user_id', uid).eq('account_type', 'credit_card')

  return <ReportClient transactions={txns} cardIds={(cards ?? []).map(c => c.id)} />
}
