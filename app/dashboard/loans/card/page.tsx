import { createClient } from '@/lib/supabase/server'
import { activeLoansWithEmi } from '@/lib/loans'
import LoanCategoryClient from '@/components/dashboard/LoanCategoryClient'
import { activeAccountsWithLedger } from '@/lib/ledger'
import { getAedInr } from '@/lib/fx'

export default async function CardLoanPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const [{ data }, { rate }] = await Promise.all([activeLoansWithEmi(supabase, user!.id, q => q.eq('loan_type', 'loan_on_card')), getAedInr()])
  // Cards (to take the loan on) and banks (where cash on card lands)
  const { data: accounts } = await activeAccountsWithLedger(supabase, user!.id, rate)
  return <LoanCategoryClient loans={data ?? []} title="Loan on Card" loanType="loan_on_card"
    cards={(accounts ?? []).filter(a => a.account_type === 'credit_card')} banks={(accounts ?? []).filter(a => a.account_type !== 'credit_card')} />
}
