import { createClient } from '@/lib/supabase/server'
import AnalysisClient from '@/components/dashboard/AnalysisClient'

// PostgREST caps a response at 1000 rows — page through 13 months of spend
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

export default async function AnalysisPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const uid = user!.id
  // 13 months back covers "same month last year"
  const start = new Date(); start.setUTCMonth(start.getUTCMonth() - 13)
  const fromDate = `${start.toISOString().slice(0, 7)}-01`

  const [txns, budgetsRes] = await Promise.all([
    fetchAllRows((a, b) => supabase.from('transactions')
      .select('id,txn_date,merchant,category,sub_category,amount,currency,txn_type')
      .eq('user_id', uid).gte('txn_date', fromDate).in('txn_type', ['expense', 'transfer', 'loan'])
      .order('txn_date', { ascending: false }).range(a, b)),
    supabase.from('budgets').select('category,monthly_cap,currency,month_year').eq('user_id', uid).gte('month_year', fromDate.slice(0, 7)),
  ])

  return <AnalysisClient transactions={txns} budgets={budgetsRes.data ?? []} />
}
