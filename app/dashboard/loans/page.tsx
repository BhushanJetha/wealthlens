import { createClient, getSessionUser } from '@/lib/supabase/server'
import { activeLoansWithEmi } from '@/lib/loans'
import { withAutomation } from '@/lib/automation'
import LoansClient from '@/components/dashboard/LoansClient'

export default async function LoansPage() {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' })
  // EMIs whose day has come are recorded alongside these reads (from your
  // statement, or "record it for me"); the rest are asked on this page
  const [auto, [{ data: loans }, lt]] = await withAutomation(supabase, user!.id, today, () => Promise.all([
    activeLoansWithEmi(supabase, user!.id),
    supabase.from('loan_transactions').select('loan_id,kind,txn_date,amount,principal,interest').eq('user_id', user!.id),
  ]))
  return <LoansClient loans={loans ?? []} pendingEmis={auto.pending.emis} loanTxns={lt.data ?? []} today={today} />
}
