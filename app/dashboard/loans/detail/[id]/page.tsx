import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import LoanDetailClient from '@/components/dashboard/LoanDetailClient'

export default async function LoanDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: loan } = await supabase
    .from('home_loans').select('*')
    .eq('id', params.id).eq('user_id', user.id).single()
  if (!loan) return notFound()

  let txns: any[] = []
  try {
    const { data } = await supabase
      .from('loan_transactions').select('*')
      .eq('loan_id', params.id).order('txn_date', { ascending: true })
    txns = data ?? []
  } catch { txns = [] }

  return <LoanDetailClient loan={loan} txns={txns} />
}
