import { createClient, getSessionUser } from '@/lib/supabase/server'
import { activeLoansWithEmi } from '@/lib/loans'
import LoanCategoryClient from '@/components/dashboard/LoanCategoryClient'

export default async function OtherLoanPage() {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  const { data } = await activeLoansWithEmi(supabase, user!.id, q => q.eq('loan_type', 'other_loan'))
  return <LoanCategoryClient loans={data ?? []} title="Other Loans" loanType="other_loan" />
}
