import { createClient, getSessionUser } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetchAll'
import { activeAccountsWithLedger } from '@/lib/ledger'
import { activeLoansWithEmi } from '@/lib/loans'
import { getAedInr } from '@/lib/fx'
import AccountsReportClient from '@/components/dashboard/AccountsReportClient'

// Accounts report: each bank account, cash wallet and card on its own — what
// came in, where it went, and what was charged to each card
export default async function AccountsReportPage() {
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

  return <AccountsReportClient transactions={txns} accounts={accounts} loans={loans ?? []} fx={rate} />
}
