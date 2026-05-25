import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { message, history } = await req.json()

  // Fetch financial context for this user
  const [txnsRes, loansRes, cardsRes, insRes, goalsRes, budgetsRes] = await Promise.all([
    supabase.from('transactions').select('category,amount,currency,txn_date').eq('user_id', user.id).order('txn_date', { ascending: false }).limit(200),
    supabase.from('home_loans').select('*').eq('user_id', user.id).eq('is_active', true),
    supabase.from('accounts').select('*').eq('user_id', user.id).eq('account_type', 'credit_card'),
    supabase.from('insurance_policies').select('*').eq('user_id', user.id).eq('is_active', true),
    supabase.from('goals').select('*').eq('user_id', user.id),
    supabase.from('budgets').select('*').eq('user_id', user.id),
  ])

  const fxRate = 22.80
  const toINR = (amt: number, cur: string) => cur === 'AED' ? amt * fxRate : amt

  // Build context summary
  const txns = txnsRes.data ?? []
  const thisMonth = new Date().toISOString().slice(0, 7)
  const monthlyTxns = txns.filter(t => t.txn_date?.startsWith(thisMonth))
  const monthlySpend = monthlyTxns.reduce((a, t) => a + toINR(Number(t.amount), t.currency), 0)

  const catSpend: Record<string, number> = {}
  monthlyTxns.forEach(t => { catSpend[t.category] = (catSpend[t.category] ?? 0) + toINR(Number(t.amount), t.currency) })
  const topCats = Object.entries(catSpend).sort((a, b) => b[1] - a[1]).slice(0, 5)

  const cards = cardsRes.data ?? []
  const cardUtil = cards.map(c => ({
    name: c.name,
    utilization: c.credit_limit ? Math.round((Number(c.outstanding_bal) / Number(c.credit_limit)) * 100) : 0
  }))

  const loans = loansRes.data ?? []
  const insurance = insRes.data ?? []
  const goals = goalsRes.data ?? []
  const budgets = budgetsRes.data ?? []

  const budgetStatus = budgets.map(b => {
    const spent = catSpend[b.category] ?? 0
    return { category: b.category, spent: Math.round(spent), cap: Number(b.monthly_cap), pct: Math.round(spent / Number(b.monthly_cap) * 100) }
  })

  const context = `
FINANCIAL CONTEXT (read-only, current data):
User: ${user.email}
Month: ${thisMonth}

Monthly spending (INR normalized): ₹${Math.round(monthlySpend).toLocaleString('en-IN')}
Top expense categories:
${topCats.map(([cat, amt]) => `  - ${cat}: ₹${Math.round(amt).toLocaleString('en-IN')}`).join('\n')}

Credit cards:
${cardUtil.map(c => `  - ${c.name}: ${c.utilization}% utilized ${c.utilization > 30 ? '⚠️ HIGH' : '✅'}`).join('\n')}

Home loans:
${loans.map(l => `  - ${l.name}: Outstanding ${l.currency} ${Number(l.outstanding_amt).toLocaleString()} @ ${l.interest_rate}% | EMI: ${l.currency} ${Number(l.emi_amount).toLocaleString()}`).join('\n')}

Insurance policies:
${insurance.map(p => `  - ${p.policy_name} (${p.policy_type}): Expiry ${p.expiry_date} | Next due: ${p.next_premium_date}`).join('\n')}

Financial goals:
${goals.map(g => `  - ${g.name}: ${Math.round(Number(g.current_amount) / Number(g.target_amount) * 100)}% complete (${g.currency} ${Number(g.current_amount).toLocaleString()} of ${Number(g.target_amount).toLocaleString()})`).join('\n')}

Budget status:
${budgetStatus.map(b => `  - ${b.category}: ${b.pct}% used (₹${b.spent.toLocaleString()} of ₹${b.cap.toLocaleString()}) ${b.pct > 100 ? '🔴 OVER' : b.pct > 75 ? '🟡' : '🟢'}`).join('\n')}
`

  const systemPrompt = `You are WealthLens AI, a personal financial advisor with deep expertise in UAE and Indian financial systems.

You have READ-ONLY access to the user's financial data. Be specific, reference actual numbers from the context, and give actionable advice.

For UAE: know about DEWA, Etisalat/du, RTA, ENBD, ADCB, FAB, Mashreq; gratuity, DEWS pension, remittances
For India: know about 80C, ELSS, PPF, NPS, HRA, LTCG/STCG, SEBI regulations, SBI, HDFC, ICICI

Keep responses concise and formatted. Use bullet points for lists. Always note you're AI and not a SEBI/DFSA-registered advisor for major decisions.

${context}`

  const messages = [
    ...(history ?? []).map((m: any) => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: message }
  ]

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 800,
    system: systemPrompt,
    messages,
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : 'Unable to generate response.'
  return NextResponse.json({ response: text })
}
