import { createClient, getSessionUser } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetchAll'
import { activeAccountsWithLedger } from '@/lib/ledger'
import { activeLoansWithEmi } from '@/lib/loans'
import { getAedInr } from '@/lib/fx'
import CardsReportClient from '@/components/dashboard/CardsReportClient'

// Card spending: what you bought on each credit card in a period, by card
// and by category, and every charge
export default async function CardSpendingPage() {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  const uid = user!.id
  // Two years back, enough for any period picked at the top
  const from = new Date(); from.setUTCMonth(from.getUTCMonth() - 24)
  const fromDate = `${from.toISOString().slice(0, 7)}-01`

  const [txns, { data: live }, { data: all }, { data: loans }, { rate }] = await Promise.all([
    fetchAllRows((a, b) => supabase.from('transactions').select('*')
      .eq('user_id', uid).gte('txn_date', fromDate)
      .order('txn_date', { ascending: false }).order('id').range(a, b)),
    // Live balances (starting balance + transactions since) for the active accounts
    getAedInr().then(({ rate }) => activeAccountsWithLedger(supabase, uid, rate)),
    // Every account, so rows on a closed one still show under its name
    supabase.from('accounts').select('*').eq('user_id', uid),
    // Loans on cards hold part of the limit
    activeLoansWithEmi(supabase, uid, q => q.eq('loan_type', 'loan_on_card')),
    getAedInr(),
  ])
  const liveById = new Map((live ?? []).map(a => [a.id, a]))
  const accounts = (all ?? []).map(a => liveById.get(a.id) ?? a)

  return <CardsReportClient transactions={txns} accounts={accounts} loans={loans ?? []} fx={rate} />
}
