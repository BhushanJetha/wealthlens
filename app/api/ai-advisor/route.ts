import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json({
        error: 'AI service not configured',
        details: 'GEMINI_API_KEY is missing from .env.local. Restart the dev server after adding it.',
      }, { status: 503 })
    }

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { message, history } = await req.json()
    if (!message) return NextResponse.json({ error: 'No message' }, { status: 400 })

    // Fetch financial context in parallel
    const [txnsRes, loansRes, cardsRes, insRes, goalsRes, budgetsRes] = await Promise.all([
      supabase.from('transactions').select('category,amount,currency,txn_date').eq('user_id', user.id).order('txn_date', { ascending: false }).limit(200),
      supabase.from('home_loans').select('*').eq('user_id', user.id).eq('is_active', true),
      supabase.from('accounts').select('*').eq('user_id', user.id).eq('account_type', 'credit_card'),
      supabase.from('insurance_policies').select('*').eq('user_id', user.id).eq('is_active', true),
      supabase.from('goals').select('*').eq('user_id', user.id),
      supabase.from('budgets').select('*').eq('user_id', user.id),
    ])

    const fxRate    = 22.80
    const toINR     = (amt: number, cur: string) => cur === 'AED' ? amt * fxRate : amt
    const txns      = txnsRes.data ?? []
    const thisMonth = new Date().toISOString().slice(0, 7)

    const monthlyTxns  = txns.filter(t => t.txn_date?.startsWith(thisMonth))
    const monthlySpend = monthlyTxns.reduce((a, t) => a + toINR(Number(t.amount), t.currency), 0)

    const catSpend: Record<string, number> = {}
    monthlyTxns.forEach(t => { catSpend[t.category] = (catSpend[t.category] ?? 0) + toINR(Number(t.amount), t.currency) })
    const topCats = Object.entries(catSpend).sort((a, b) => b[1] - a[1]).slice(0, 5)

    const cards      = cardsRes.data ?? []
    const loans      = loansRes.data ?? []
    const insurance  = insRes.data ?? []
    const goals      = goalsRes.data ?? []
    const budgets    = budgetsRes.data ?? []

    const cardUtil = cards.map(c => ({
      name: c.name,
      utilization: c.credit_limit ? Math.round((Number(c.outstanding_bal) / Number(c.credit_limit)) * 100) : 0,
    }))

    const budgetStatus = budgets.map(b => {
      const spent = catSpend[b.category] ?? 0
      return { category: b.category, spent: Math.round(spent), cap: Number(b.monthly_cap), pct: Math.round(spent / Number(b.monthly_cap) * 100) }
    })

    const financialContext = `
FINANCIAL CONTEXT (read-only snapshot):
User: ${user.email}
Month: ${thisMonth}

Monthly spending: ₹${Math.round(monthlySpend).toLocaleString('en-IN')}
Top categories:
${topCats.map(([cat, amt]) => `  - ${cat}: ₹${Math.round(amt).toLocaleString('en-IN')}`).join('\n') || '  (no transactions this month)'}

Credit cards:
${cardUtil.length ? cardUtil.map(c => `  - ${c.name}: ${c.utilization}% utilized ${c.utilization > 30 ? '⚠️' : '✅'}`).join('\n') : '  (none)'}

Loans:
${loans.length ? loans.map(l => `  - ${l.name} (${l.loan_type ?? 'loan'}): Outstanding ${l.currency} ${Number(l.outstanding_amt).toLocaleString()} @ ${l.interest_rate}% | EMI: ${l.currency} ${Number(l.emi_amount).toLocaleString()}`).join('\n') : '  (none)'}

Insurance:
${insurance.length ? insurance.map(p => `  - ${p.policy_name} (${p.policy_type}): Expiry ${p.expiry_date}`).join('\n') : '  (none)'}

Goals:
${goals.length ? goals.map(g => `  - ${g.name}: ${Math.round(Number(g.current_amount) / Number(g.target_amount) * 100)}% complete`).join('\n') : '  (none)'}

Budget status:
${budgetStatus.length ? budgetStatus.map(b => `  - ${b.category}: ${b.pct}% used ${b.pct > 100 ? '🔴 OVER' : b.pct > 75 ? '🟡' : '🟢'}`).join('\n') : '  (none set)'}
`

    const systemInstruction = `You are WealthLens AI, a personal financial advisor specializing in UAE and Indian finance. You are powered by Google Gemini.

You have READ-ONLY access to the user's financial data provided in the context. Be specific, reference actual numbers, and give actionable advice. Keep responses concise with bullet points where helpful. Do not make up numbers not present in the context.

UAE expertise: DEWA, Etisalat/du, ENBD, ADCB, FAB, Mashreq, gratuity, DEWS pension, free zone rules
India expertise: Section 80C, ELSS, PPF, NPS, HRA, LTCG/STCG, SBI, HDFC, ICICI, EPF

Disclaimer: You are an AI assistant, not a SEBI/DFSA-registered advisor. Recommend consulting a certified professional for major financial decisions.

${financialContext}`

    // Build Gemini chat history (role must be 'user' | 'model')
    const chatHistory = (history ?? [])
      .slice(-10)
      .map((m: any) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }))

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction,
    })

    const chat   = model.startChat({ history: chatHistory })
    const result = await chat.sendMessage(message)
    const text   = result.response.text()

    return NextResponse.json({ response: text })
  } catch (err: any) {
    console.error('AI advisor error:', err)
    return NextResponse.json({ error: 'AI service error', details: err.message }, { status: 500 })
  }
}
