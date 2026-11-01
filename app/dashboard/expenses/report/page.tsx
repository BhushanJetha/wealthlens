import { createClient, getSessionUser } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetchAll'
import { activeAccountsWithLedger } from '@/lib/ledger'
import { getAedInr } from '@/lib/fx'
import ExpensesReportClient from '@/components/dashboard/ExpensesReportClient'

export default async function ExpensesReportPage() {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  const uid = user!.id
  const thisMonth = new Date().toISOString().slice(0, 7)

  // accounts!account_id: transactions link to accounts twice (account_id and,
  // since migration 026, counter_account_id) — a bare accounts(...) embed is
  // ambiguous and PostgREST returns an error instead of rows
  const [txnsRes, incomeRes, budgetsRes, { data: all }, { data: live }] = await Promise.all([
    fetchAll((a, b) => supabase.from('transactions').select('*, accounts!account_id(name,bank_name,account_type,last_four)')
      .eq('user_id', uid).in('txn_type', ['expense', 'transfer', 'loan'])
      .order('txn_date', { ascending: true }).order('id').range(a, b)),
    fetchAll((a, b) => supabase.from('transactions').select('*, accounts!account_id(name,bank_name)')
      .eq('user_id', uid).eq('txn_type', 'income')
      .order('txn_date', { ascending: true }).order('id').range(a, b)),
    supabase.from('budgets').select('*').eq('user_id', uid).eq('month_year', thisMonth),
    // Every account (rows on a closed one still show under its name), with
    // live balances for the active ones — the table groups by account
    supabase.from('accounts').select('*').eq('user_id', uid),
    getAedInr().then(({ rate }) => activeAccountsWithLedger(supabase, uid, rate)),
  ])
  const liveById = new Map((live ?? []).map((a: any) => [a.id, a]))
  const accounts = (all ?? []).map((a: any) => liveById.get(a.id) ?? a)

  const txns = txnsRes.data ?? []
  // Income rows only; the client pairs UAE → India remittances from `txns`
  // into "Received from UAE" India income (lib/money)
  const income = incomeRes.data ?? []

  return (
    <ExpensesReportClient
      transactions={txns}
      incomeTransactions={income}
      budgets={budgetsRes.data ?? []}
      accounts={accounts}
    />
  )
}
