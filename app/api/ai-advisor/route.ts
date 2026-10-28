import { NextResponse } from 'next/server'
import type Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetchAll'
import { askClaude, aiErrorResponse } from '@/lib/ai/claude'
import { computeNetWorth, type Holdings } from '@/lib/netWorth'
import { buildHomeInsights } from '@/lib/insights'
import { getAedInr } from '@/lib/fx'
import { fmtCompact } from '@/lib/format'
import { loadWealthExtras } from '@/lib/wealthExtras'

// AI advisor (docked panel + every "Explain this page" / AI action button).
// Context is built from the signed-in user's own records with the same
// engine as Home, so the advisor quotes the numbers the user sees.

const INSTRUCTIONS = `You are the WealthLens AI advisor for one household that manages money in the UAE and India.

How to answer:
- Plain language, no jargon without a short explanation, no markdown headings or tables.
- Keep it under about 90 words unless the user asks for a plan, a comparison or detail (then up to about 200).
- Use only the figures in the FINANCIAL CONTEXT below or in the user's message. If something isn't there, say what's missing instead of guessing.
- Amounts in ₹ use lakh/crore (₹2.4L, ₹1.2Cr); AED amounts stay in AED.
- End with one concrete next step the user can take in WealthLens or with their bank.
- You give educational guidance, not regulated financial advice; for large or irreversible decisions suggest a licensed adviser.

UAE knowledge: ENBD, ADCB, FAB, Mashreq, DEWA, Etisalat/du, end-of-service gratuity, no personal income tax.
India knowledge: Section 80C/80D/80CCD(1B), ELSS, PPF, NPS, EPF, HRA, LTCG/STCG, NRE/NRO accounts, repatriation.`

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { message, history } = await req.json()
  if (!message?.trim()) return NextResponse.json({ error: 'No message' }, { status: 400 })

  try {
    const context = await buildContext(supabase, user.id)

    // Prior turns from the panel (last 10), starting with a user turn
    const prior: Anthropic.Beta.BetaMessageParam[] = (Array.isArray(history) ? history : [])
      .filter((m: any) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .slice(-10)
      .map((m: any) => ({ role: m.role, content: m.content }))
    while (prior.length && prior[0].role !== 'user') prior.shift()

    const reply = await askClaude({
      system: `${INSTRUCTIONS}\n\n${context}`,
      messages: [...prior, { role: 'user', content: message }],
      effort: 'medium',
    })
    return NextResponse.json({ response: reply || 'I could not form an answer — try rephrasing the question.' })
  } catch (err) {
    console.error('AI advisor error:', err)
    const { body, status } = aiErrorResponse(err)
    return NextResponse.json(body, { status })
  }
}

async function buildContext(supabase: ReturnType<typeof createClient>, uid: string) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' })
  const start = new Date(); start.setUTCMonth(start.getUTCMonth() - 13)
  const fromDate = `${start.toISOString().slice(0, 7)}-01`

  const q = (table: string, active = false) => {
    const b = supabase.from(table).select('*').eq('user_id', uid)
    return active ? b.eq('is_active', true) : b
  }
  const [txnsRes, loans, accs, stocks, mfs, fds, policies, goals, budgets, rds, nps, lic, gold, bonds, etf, ppf, profile, fx] = await Promise.all([
    fetchAll((a, b) => supabase.from('transactions').select('id,account_id,txn_date,merchant,category,sub_category,amount,currency,txn_type')
      .eq('user_id', uid).gte('txn_date', fromDate).order('txn_date', { ascending: false }).order('id').range(a, b)),
    q('home_loans', true), q('accounts', true), q('stocks'), q('mutual_funds'), q('fixed_deposits', true),
    q('insurance_policies', true), q('goals'), supabase.from('budgets').select('*').eq('user_id', uid).gte('month_year', fromDate.slice(0, 7)),
    q('recurring_deposits', true), q('nps_accounts'), q('lic_policies', true), q('gold_investments'),
    q('bond_investments'), q('etf_investments'), q('ppf_epf_accounts'),
    supabase.from('profiles').select('full_name').eq('id', uid).single(),
    getAedInr(),
  ])

  const holdings: Holdings = {
    accounts: accs.data ?? [], stocks: stocks.data ?? [], mutualFunds: mfs.data ?? [], etf: etf.data ?? [],
    nps: nps.data ?? [], fixedDeposits: fds.data ?? [], recurringDeposits: rds.data ?? [], ppfEpf: ppf.data ?? [],
    gold: gold.data ?? [], bonds: bonds.data ?? [], lic: lic.data ?? [], loans: loans.data ?? [],
    ...await loadWealthExtras(supabase, uid).then(x => ({ otherAssets: x.otherAssets, gratuity: x.gratuity })), today,
  }
  const rate = fx.rate
  const nw = computeNetWorth(holdings, 'consolidated', rate)
  const ins = buildHomeInsights({
    view: 'consolidated', fx: rate, today, focusMonth: today.slice(0, 7),
    txns: txnsRes.data ?? [], accounts: holdings.accounts, loans: holdings.loans, insurance: policies.data ?? [],
    fixedDeposits: holdings.fixedDeposits, budgets: budgets.data ?? [], mutualFunds: holdings.mutualFunds, stocks: holdings.stocks,
    cash: nw.cash, invested: nw.investments,
  })

  const inr = (n: number) => fmtCompact(n, 'INR')
  const cur = (n: number, c: string) => fmtCompact(Number(n) || 0, c === 'AED' ? 'AED' : 'INR')
  const lines: string[] = []
  const add = (title: string, rows: string[]) => { if (rows.length) lines.push(`${title}:\n${rows.map(r => `  - ${r}`).join('\n')}`) }

  lines.push(`FINANCIAL CONTEXT (consolidated in INR at 1 AED = ₹${rate.toFixed(2)}; today ${today})`)
  lines.push(`Name: ${(profile.data?.full_name ?? '').split(' ')[0] || 'the user'}`)
  lines.push(`Net worth ${inr(nw.netWorth)} = assets ${inr(nw.totalAssets)} − liabilities ${inr(nw.totalLiab)}; bank & cash ${inr(nw.cash)}.`)
  lines.push(`This month so far: income ${inr(ins.income.value)}, spending ${inr(ins.spend.value)}${ins.spend.baseline ? ` (usual by this point ${inr(ins.spend.baseline)})` : ''}, saved ${inr(ins.saved.value)}.`)
  lines.push(`Last 3 complete months: average income ${inr(ins.trend.avgIncome)}, average spending ${inr(ins.trend.avgSpend)}, savings rate ${ins.trend.savingsRate ?? '—'}% (target 20%). Emergency fund covers ${ins.runway.months ?? '—'} months.`)
  add('Spending by category this month (vs usual)', ins.categories.slice(0, 8).map(c => `${c.label}: ${inr(c.value)}${c.baseline != null ? ` (usual ${inr(c.baseline)})` : ''}`))
  add('Needs attention', ins.attention.slice(0, 8).map(a => `${a.title} — ${a.detail}`))
  add('Observations', ins.insights.slice(0, 6).map(i => `${i.title}${i.detail ? ` — ${i.detail}` : ''}`))
  add('Coming up (next 30 days)', ins.upcoming.slice(0, 8).map(u => `${u.date} ${u.label}: ${cur(u.amount, u.currency)}`))
  if (ins.forecast) lines.push(`30-day cash forecast: lowest ${inr(ins.forecast.low.value)} on ${ins.forecast.low.date}${ins.forecast.lowAfter ? ` after ${ins.forecast.lowAfter}` : ''}; ends near ${inr(ins.forecast.end)}.`)
  add('Holdings by type', nw.assetRows.filter(r => r.value > 0).map(r => `${r.label}: ${inr(r.value)}${r.invested && r.invested !== r.value ? ` (cost ${inr(r.invested)})` : ''}`))
  add('Loans', holdings.loans.map(l => `${l.name}: outstanding ${cur(l.outstanding_amt, l.currency)} at ${l.interest_rate}%, EMI ${cur(l.emi_amount, l.currency)}`))
  add('Credit cards', holdings.accounts.filter(a => a.account_type === 'credit_card').map(c =>
    `${c.name}: ${cur(c.outstanding_bal, c.currency)} of ${cur(c.credit_limit, c.currency)} limit${c.due_date ? `, due ${c.due_date}` : ''}`))
  add('Insurance', (policies.data ?? []).map(p => `${p.policy_name} (${p.policy_type}): cover ${cur(p.sum_assured, p.currency)}${p.expiry_date ? `, renews ${p.expiry_date}` : ''}`))
  add('Goals', (goals.data ?? []).map(g => `${g.name}: target ${cur(g.target_amount, g.currency)} by ${g.target_date}${g.status && g.status !== 'active' ? ` (${g.status})` : ''}`))
  add('SIPs', holdings.mutualFunds.filter(m => m.has_sip && Number(m.sip_amount) > 0).map(m => `${m.fund_name}: ₹${Number(m.sip_amount).toLocaleString('en-IN')} on day ${m.sip_date ?? '?'}`))
  return lines.join('\n')
}
