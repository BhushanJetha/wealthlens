import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const FX = 22.80
function toINR(amt: number, cur: string) { return cur === 'AED' ? amt * FX : amt }

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const today = new Date()

  const [loansRes, insRes, txnsRes, cardsRes] = await Promise.all([
    supabase.from('home_loans').select('*').eq('user_id', user.id).eq('is_active', true),
    supabase.from('insurance_policies').select('*').eq('user_id', user.id).eq('is_active', true),
    supabase.from('transactions').select('amount,currency,txn_date,category').eq('user_id', user.id)
      .gte('txn_date', new Date(Date.now() - 90*24*60*60*1000).toISOString().slice(0,10))
      .eq('txn_type', 'expense'),
    supabase.from('accounts').select('*').eq('user_id', user.id).eq('account_type', 'credit_card').eq('is_active', true),
  ])

  const loans   = loansRes.data ?? []
  const ins     = insRes.data ?? []
  const txns    = txnsRes.data ?? []
  const cards   = cardsRes.data ?? []

  // — Fixed upcoming obligations —
  const obligations: Array<{ name: string; amount_inr: number; due_date: string; type: string }> = []

  loans.forEach(l => {
    if (l.next_emi_date) {
      obligations.push({ name: `${l.name} EMI`, amount_inr: toINR(Number(l.emi_amount), l.currency), due_date: l.next_emi_date, type: 'emi' })
    }
  })

  ins.forEach(p => {
    if (p.next_premium_date) {
      const freq = p.premium_frequency
      const annualAmt = toINR(Number(p.annual_premium), p.currency)
      const amt = freq === 'monthly' ? annualAmt/12 : freq === 'quarterly' ? annualAmt/4 : freq === 'semi_annual' ? annualAmt/2 : annualAmt
      obligations.push({ name: `${p.policy_name} Premium`, amount_inr: amt, due_date: p.next_premium_date, type: 'insurance' })
    }
  })

  cards.forEach(c => {
    if (c.due_date && c.minimum_due) {
      obligations.push({ name: `${c.name} Min Due`, amount_inr: toINR(Number(c.minimum_due), c.currency), due_date: c.due_date, type: 'credit_card' })
    }
  })

  // — Variable spending estimate from last 90 days —
  const dailyAvg = txns.reduce((a, t) => a + toINR(Number(t.amount), t.currency), 0) / 90

  // — Bucket into 7d and 30d —
  const next7  = obligations.filter(o => {
    const d = Math.ceil((new Date(o.due_date).getTime() - today.getTime()) / 86400000)
    return d >= 0 && d <= 7
  })
  const next30 = obligations.filter(o => {
    const d = Math.ceil((new Date(o.due_date).getTime() - today.getTime()) / 86400000)
    return d >= 0 && d <= 30
  })

  const variable7  = Math.round(dailyAvg * 7)
  const variable30 = Math.round(dailyAvg * 30)

  const fixed7  = Math.round(next7.reduce((a, o)  => a + o.amount_inr, 0))
  const fixed30 = Math.round(next30.reduce((a, o) => a + o.amount_inr, 0))

  // Category breakdown for variable
  const catAvg: Record<string, number> = {}
  txns.forEach(t => { catAvg[t.category] = (catAvg[t.category] ?? 0) + toINR(Number(t.amount), t.currency) / 90 })

  return NextResponse.json({
    next7: {
      fixed:    fixed7,
      variable: variable7,
      total:    fixed7 + variable7,
      items:    next7.map(o => ({ name: o.name, amount: Math.round(o.amount_inr), type: o.type, due: o.due_date })),
    },
    next30: {
      fixed:    fixed30,
      variable: variable30,
      total:    fixed30 + variable30,
      items:    next30.map(o => ({ name: o.name, amount: Math.round(o.amount_inr), type: o.type, due: o.due_date })),
    },
    daily_avg_spend: Math.round(dailyAvg),
    category_avg: Object.fromEntries(
      Object.entries(catAvg).map(([k, v]) => [k, Math.round(v * 30)])
    ),
  })
}
