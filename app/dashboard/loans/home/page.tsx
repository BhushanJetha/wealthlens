import { createClient, getSessionUser } from '@/lib/supabase/server'
import { activeLoansWithEmi } from '@/lib/loans'
import LoanCategoryClient from '@/components/dashboard/LoanCategoryClient'

export default async function HomeLoanPage() {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  const { data } = await activeLoansWithEmi(supabase, user!.id, q => q.in('loan_type', ['home_loan']))
  return <LoanCategoryClient loans={data ?? []} title="Home Loans" loanType="home_loan" />
}
