import { createClient, getSessionUser } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import LoanDetailClient from '@/components/dashboard/LoanDetailClient'
import { withPaidEmi } from '@/lib/loans'

export default async function LoanDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const user = await getSessionUser(supabase)
  if (!user) return null

  // Read together; a missing table (older migrations) just means none yet
  const [withEmi, txns, plan] = await Promise.all([
    // EMI shown = the last one actually paid (recorded or from a statement)
    supabase.from('home_loans').select('*').eq('id', params.id).eq('user_id', user.id).single()
      .then(async ({ data: loan }: { data: any }) => loan ? (await withPaidEmi(supabase, user.id, [loan]))[0] : null),
    supabase.from('loan_transactions').select('*').eq('loan_id', params.id).order('txn_date', { ascending: true })
      .then(({ data }: { data: any[] | null }) => data ?? [], () => []),
    supabase.from('loan_payment_plan').select('*').eq('loan_id', params.id).order('slab_no', { ascending: true })
      .then(({ data }: { data: any[] | null }) => data ?? [], () => []),
  ])
  if (!withEmi) return notFound()
  return <LoanDetailClient loan={withEmi} txns={txns} plan={plan} />
}
