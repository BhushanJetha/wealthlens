import { NextResponse } from 'next/server'
import type Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetchAll'
import { askClaude, aiErrorResponse } from '@/lib/ai/claude'
import { computeNetWorth, type Holdings } from '@/lib/netWorth'
import { buildHomeInsights } from '@/lib/insights'
import { investmentValue } from '@/lib/goals'
import { getAedInr } from '@/lib/fx'
import { fmtCompact } from '@/lib/format'
import { loadWealthExtras } from '@/lib/wealthExtras'
import { AI_OFF, PRIVACY_RULES, Vault, aiSettingsOf, mask, namesToHide } from '@/lib/ai/privacy'

// AI advisor (docked panel + every "Explain this page" / AI action button).
// What Claude gets is built from the signed-in user's own records with the same
// engine as Home, but as shares, percentages, months and trends. Every amount is
// a placeholder the server fills back in, and names and numbers that identify
// you are hidden (lib/ai/privacy). Nothing is sent while AI is off.

const INSTRUCTIONS = `You are the WealthLens AI advisor for one household that manages money in the UAE and India.

How to answer:
- Plain language, no jargon without a short explanation, no markdown headings or tables.
- Keep it under about 90 words unless the user asks for a plan, a comparison or detail (then up to about 200).
- Use only the FINANCIAL CONTEXT below, the user's message and, for markets, funds or rules, a web search. If something isn't there, say what's missing instead of guessing.
- End with one concrete next step the user can take in WealthLens or with their bank.
- You give educational guidance, not regulated financial advice; for large or irreversible decisions suggest a licensed adviser. Never tip individual company shares to buy.

UAE knowledge: end-of-service gratuity, no personal income tax.
India knowledge: Section 80C/80D/80CCD(1B), ELSS, PPF, NPS, EPF, HRA, LTCG/STCG, NRE/NRO accounts, repatriation.`

async function setup(supabase: ReturnType<typeof createClient>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!aiSettingsOf(user.user_metadata).on) return { error: NextResponse.json(AI_OFF, { status: 403 }) }
  const vault = new Vault()
  const { context, names } = await buildContext(supabase, user.id, vault)
  return { user, vault, context, names }
}

// "What gets shared": exactly the text Claude would receive, nothing sent
export async function GET() {
  const supabase = createClient()
  const s = await setup(supabase)
  if ('error' in s) return s.error
  return NextResponse.json({ context: s.context })
}

export async function POST(req: Request) {
  const supabase = createClient()
  const { message, history } = await req.json()
  if (!message?.trim()) return NextResponse.json({ error: 'No message' }, { status: 400 })

  try {
    const s = await setup(supabase)
    if ('error' in s) return s.error
    const { vault, context, names } = s
    // Your messages (and earlier answers, which carry real figures) are masked too
    const prior: Anthropic.Beta.BetaMessageParam[] = (Array.isArray(history) ? history : [])
      .filter((m: any) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .slice(-10)
      .map((m: any) => ({ role: m.role, content: mask(m.content, vault, names) }))
    while (prior.length && prior[0].role !== 'user') prior.shift()

    const reply = await askClaude({
      system: `${INSTRUCTIONS}\n\n${PRIVACY_RULES}\n\n${context}`,
      messages: [...prior, { role: 'user', content: mask(message, vault, names) }],
      effort: 'medium',
      webSearch: 3,
    })
    // The real figures go back in here, on your server
    return NextResponse.json({ response: vault.restore(reply) || 'I could not form an answer — try rephrasing the question.' })
  } catch (err) {
    console.error('AI advisor error:', err)
    const { body, status } = aiErrorResponse(err)
    return NextResponse.json(body, { status })
  }
}

const pct = (a: number, b: number) => (b > 0 ? Math.round(a / b * 100) : null)

async function buildContext(supabase: ReturnType<typeof createClient>, uid: string, vault: Vault) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' })
  const start = new Date(); start.setUTCMonth(start.getUTCMonth() - 13)
  const fromDate = `${start.toISOString().slice(0, 7)}-01`

  const q = (table: string, active = false) => {
    const b = supabase.from(table).select('*').eq('user_id', uid)
    return active ? b.eq('is_active', true) : b
  }
  const [txnsRes, loans, accs, stocks, mfs, fds, policies, goals, budgets, rds, nps, lic, gold, bonds, etf, ppf, profile, members, fx] = await Promise.all([
    fetchAll((a, b) => supabase.from('transactions').select('id,account_id,txn_date,merchant,category,sub_category,amount,currency,txn_type')
      .eq('user_id', uid).gte('txn_date', fromDate).order('txn_date', { ascending: false }).order('id').range(a, b)),
    q('home_loans', true), q('accounts', true), q('stocks'), q('mutual_funds'), q('fixed_deposits', true),
    q('insurance_policies', true), q('goals'), supabase.from('budgets').select('*').eq('user_id', uid).gte('month_year', fromDate.slice(0, 7)),
    q('recurring_deposits', true), q('nps_accounts'), q('lic_policies', true), q('gold_investments'),
    q('bond_investments'), q('etf_investments'), q('ppf_epf_accounts'),
    supabase.from('profiles').select('full_name').eq('id', uid).single(),
    supabase.from('family_members').select('name').eq('user_id', uid),
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
  const names = namesToHide({ fullName: profile.data?.full_name, members: members.data ?? [], accounts: holdings.accounts, loans: holdings.loans,
    holders: [...holdings.stocks, ...holdings.mutualFunds].map((r: any) => r.holder_name) })

  // Amounts appear only as placeholders
  const amt = (n: number, c = 'INR') => vault.amount(fmtCompact(Number(n) || 0, c === 'AED' ? 'AED' : 'INR'), Number(n) || 0)
  const toInr = (n: number, c: string) => (c === 'AED' ? n * rate : n)
  const lines: string[] = []
  const add = (title: string, rows: string[]) => { if (rows.length) lines.push(`${title}:\n${rows.map(r => `  - ${r}`).join('\n')}`) }

  lines.push(`FINANCIAL CONTEXT (today ${today}; amounts are placeholders, worked out in ₹ at today's AED rate)`)
  lines.push(`Net worth ${amt(nw.netWorth)}. Debts are ${pct(nw.totalLiab, nw.totalAssets) ?? '—'}% of what's owned. Bank & cash is ${pct(nw.cash, nw.totalAssets) ?? '—'}% of assets.`)
  const spendShare = pct(ins.spend.value, ins.income.value), usualShare = pct(ins.trend.avgSpend, ins.trend.avgIncome)
  lines.push(`This month so far: spending is ${spendShare ?? '—'}% of income${usualShare != null ? ` (usually ${usualShare}%)` : ''}${ins.spend.baseline ? `; spending vs usual by this date: ${Math.round((ins.spend.value / ins.spend.baseline - 1) * 100)}%` : ''}.`)
  lines.push(`Last 3 months: savings rate ${ins.trend.savingsRate ?? '—'}% (target 20%). Bank & cash would cover ${ins.runway.months ?? '—'} months of spending.`)
  const spendTotal = ins.categories.reduce((s, c) => s + c.value, 0)
  add('Spending by category this month (share of spending, vs usual)', ins.categories.slice(0, 8).map(c => `${c.label}: ${pct(c.value, spendTotal) ?? 0}%${c.baseline ? ` (${c.value >= c.baseline ? '+' : ''}${Math.round((c.value / c.baseline - 1) * 100)}% vs usual)` : ''}`))
  // Per-card, per-loan and per-account lines would show how many you have, so
  // those are told once, without a count
  const perItem = /^(card|emi|quiet)-/
  add('Needs attention', [
    ...ins.attention.filter(a => !perItem.test(a.id)).slice(0, 8).map(a => `${a.title} — ${a.detail}`),
    ...ins.attention.some(a => a.id.startsWith('card-')) ? ['A credit card bill is due within 10 days'] : [],
    ...ins.attention.some(a => a.id.startsWith('emi-')) ? ['A loan EMI is due within a week'] : [],
    ...ins.attention.some(a => a.id.startsWith('quiet-')) ? ['An account has had no transactions recorded for a while'] : [],
  ])
  const KIND: Record<string, string> = { card: 'card bills', emi: 'loan EMIs', premium: 'insurance premiums', fd: 'FDs maturing', sip: 'SIPs' }
  const due = new Map<string, { first: string; total: number }>()
  for (const u of ins.upcoming) {
    const k = KIND[u.kind] ?? 'other'
    const g = due.get(k) ?? { first: u.date, total: 0 }
    g.total += toInr(Number(u.amount) || 0, u.currency); if (u.date < g.first) g.first = u.date
    due.set(k, g)
  }
  add('Coming up in the next 30 days (totals by kind)', Array.from(due, ([k, g]) => `${k}: ${amt(g.total)} in all, the first on ${g.first}`))
  // Investments: the mix and each fund or share as a share of its kind, with its return
  const assetTotal = nw.assetRows.reduce((s, r) => s + Math.max(0, r.value), 0)
  add('What you own (share of assets, return on cost)', nw.assetRows.filter(r => r.value > 0).map(r => `${r.label}: ${pct(r.value, assetTotal)}%${r.invested && r.invested > 0 && r.invested !== r.value ? `, ${r.value >= r.invested ? '+' : ''}${Math.round((r.value / r.invested - 1) * 100)}%` : ''}`))
  const held = (type: string, rows: any[], nameOf: (r: any) => string) => {
    const vals = rows.map(r => ({ r, v: toInr(investmentValue(type, r), r.currency), cost: toInr(Number(r.invested_amount ?? (Number(r.quantity) || 0) * (Number(r.avg_buy_price) || 0)) || 0, r.currency) })).filter(x => x.v > 0)
    const tot = vals.reduce((s, x) => s + x.v, 0)
    return vals.sort((a, b) => b.v - a.v).slice(0, 15).map(x => `${nameOf(x.r)}${x.r.fund_type ? ` (${x.r.fund_type})` : x.r.sector ? ` (${x.r.sector})` : ''}: ${pct(x.v, tot)}% of this kind${x.cost > 0 ? `, ${x.v >= x.cost ? '+' : ''}${Math.round((x.v / x.cost - 1) * 100)}% on cost` : ''}`)
  }
  add('Mutual funds held', held('mutual_funds', holdings.mutualFunds, r => r.fund_name))
  add('Shares held', held('stocks', holdings.stocks, r => `${r.name} (${r.symbol})`))
  add('ETFs held', held('etf_investments', holdings.etf, r => r.name ?? r.etf_name ?? 'ETF'))
  const income = ins.trend.avgIncome
  // Loans, cards and insurance only as totals: no names, no counts
  const emis = holdings.loans.reduce((s, l) => s + toInr(Number(l.emi_amount) || 0, l.currency || 'INR'), 0)
  const rates = holdings.loans.map(l => Number(l.interest_rate)).filter(n => n > 0)
  if (holdings.loans.length) lines.push(`Loans: EMIs take ${pct(emis, income) ?? '—'}% of income; interest ${rates.length ? `${Math.min(...rates)}–${Math.max(...rates)}%` : 'not recorded'}.`)
  const cards = holdings.accounts.filter(a => a.account_type === 'credit_card')
  const owed = cards.reduce((s, c) => s + toInr(Number(c.outstanding_bal) || 0, c.currency), 0), limit = cards.reduce((s, c) => s + toInr(Number(c.credit_limit) || 0, c.currency), 0)
  if (cards.length) lines.push(`Credit cards: ${pct(owed, limit) ?? '—'}% of the total limit used.`)
  const types = Array.from(new Set((policies.data ?? []).map((p: any) => String(p.policy_type ?? "other"))))
  const life = (policies.data ?? []).filter((p: any) => /life|term/i.test(String(p.policy_type))).reduce((s: number, p: any) => s + toInr(Number(p.sum_assured) || 0, p.currency), 0)
  if (types.length) lines.push(`Insurance held: ${types.join(', ')}${life > 0 && income > 0 ? `; life cover is about ${Math.round(life / (income * 12) * 10) / 10} years of income` : ''}.`)
  add('Goals (progress, time left)', (goals.data ?? []).filter((g: any) => g.status !== 'cancelled').map((g: any) => {
    const months = Math.max(0, Math.round((Date.parse(g.target_date) - Date.parse(today)) / (30.44 * 864e5)))
    return `${g.name}: due ${String(g.target_date).slice(0, 7)} (${months} months)${g.status && g.status !== 'active' ? `, ${g.status}` : ''}, target ${amt(Number(g.target_amount), g.currency)}`
  }))
  const sips = holdings.mutualFunds.filter(m => m.has_sip && Number(m.sip_amount) > 0)
  if (sips.length) lines.push(`SIPs: ${sips.map(m => m.fund_name).join(', ')}; together ${pct(sips.reduce((s, m) => s + toInr(Number(m.sip_amount), m.currency ?? 'INR'), 0), income) ?? '—'}% of income.`)
  // A last pass catches any name or number that slipped into a detail line
  return { context: mask(lines.join('\n'), vault, names), names }
}
