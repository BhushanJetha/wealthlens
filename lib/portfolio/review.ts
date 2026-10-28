// Portfolio reviews: one after every quarter of India's financial year —
// quarterly (June, December), half-yearly (September, Apr–Sep) and yearly
// (March, the full year) — made the first time you open the app after it
// ends, or any time on request. Each saves a report: values, what changed
// since the last one, the mix against your target, a verdict on every
// holding, what to add, protection and the actions, with its assumptions.
import { computeNetWorth } from '../netWorth'
import { VERDICT, CLS_LABEL } from './advice'
import type { Portfolio } from './build'
import type { PortfolioData } from './data'
import type { Cls } from './holdings'

export type ReviewKind = 'quarter' | 'half' | 'year' | 'now'
export const KIND_LABEL: Record<ReviewKind, string> = { quarter: 'Quarterly review', half: 'Half-yearly review', year: 'Yearly review', now: 'Review' }

const pad = (n: number) => String(n).padStart(2, '0')
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
// The last quarter end (31 Mar, 30 Jun, 30 Sep, 31 Dec) before today
export function lastPeriod(today: string): { kind: Exclude<ReviewKind, 'now'>; label: string; start: string; end: string } {
  const [y, m] = today.split('-').map(Number)
  const ends = [[y, 3, 31], [y, 6, 30], [y, 9, 30], [y, 12, 31], [y - 1, 12, 31], [y - 1, 9, 30]].map(([yy, mm, dd]) => `${yy}-${pad(mm)}-${pad(dd)}`)
  const end = ends.filter(e => e < today).sort().pop()!
  const ey = Number(end.slice(0, 4)), em = Number(end.slice(5, 7))
  const fy = em >= 4 ? ey : ey - 1, fyl = `${fy}-${String((fy + 1) % 100).padStart(2, '0')}`
  const kind = em === 9 ? 'half' : em === 3 ? 'year' : 'quarter'
  const months = kind === 'year' ? 12 : kind === 'half' ? 6 : 3
  const s = new Date(Date.UTC(ey, em - months, 1))
  const start = `${s.getUTCFullYear()}-${pad(s.getUTCMonth() + 1)}-01`
  const q = em === 6 ? 1 : em === 9 ? 2 : em === 12 ? 3 : 4
  const label = kind === 'year' ? `FY ${fyl}` : kind === 'half' ? `H1 ${fyl} (Apr–Sep)` : `Q${q} ${fyl}`
  return { kind, label, start, end }
}
// A review run on request covers the time since the last one (or 3 months)
export function nowPeriod(today: string, lastEnd?: string | null) {
  const [y, m, d] = today.split('-').map(Number)
  const start = lastEnd ?? new Date(Date.UTC(y, m - 4, d)).toISOString().slice(0, 10)
  return { kind: 'now' as const, label: `${d} ${MON[m - 1]} ${y}`, start, end: today }
}

export interface ReviewData {
  v: 1; generatedAt: string; kind: ReviewKind; label: string; start: string; end: string
  totals: { netWorth: number; invested: number; cost: number; gain: number; gainPct: number | null }
  change: { since: string; netWorthBefore: number | null; investedBefore: number | null; contributions: number; growth: number | null; growthPct: number | null } | null
  mix: { now: Record<Cls, number>; target: Record<Cls, number>; source: string; profile: string | null }
  counts: Record<string, number>
  holdings: { key: string; name: string; sub: string; currency: string; value: number; gainPct: number | null; verdict: string; reasons: string[]; action?: string; r1y?: number | null; r3y?: number | null; bench?: string | null; benchR?: number | null }[]
  adds: Portfolio['add']['adds']
  actions: { text: string; href: string }[]
  protection: { gap: number; need: number; cover: number; dependents: number; health: number; nomineesMissing: number | null }
  access: Record<string, number>; currency: { aedPct: number; inrPct: number }
  deep: string[]                    // half-yearly / yearly extras: rebalancing, tax
  notes: string[]                   // assumptions
}

export function buildReview(d: PortfolioData, p: Portfolio, period: { kind: ReviewKind; label: string; start: string; end: string },
  ctx: { prev?: { period_end: string; data: any } | null; snapAtStart?: { value: number; date: string } | null; contributions: number }): ReviewData {
  const nw = computeNetWorth(d.holdings, 'consolidated', d.fx)
  const invested = p.investedInr
  const cost = p.reviews.reduce((s, r) => s + (r.h.currency === 'AED' ? r.h.cost * d.fx : r.h.cost), 0)
  const prevInvested = ctx.prev?.data?.totals?.invested ?? null
  const growth = prevInvested != null ? invested - prevInvested - ctx.contributions : null
  const base = prevInvested != null ? prevInvested + ctx.contributions / 2 : null
  const counts = Object.fromEntries(Object.keys(VERDICT).map(k => [k, p.reviews.filter(r => r.verdict === k).length]))
  const actions: { text: string; href: string }[] = [
    ...p.reviews.filter(r => ['switch', 'trim', 'check'].includes(r.verdict)).slice(0, 6).map(r => ({ text: `${VERDICT[r.verdict].label}: ${r.h.name} — ${r.action ?? r.reasons[0]}`, href: '/dashboard/portfolio' })),
    ...p.add.adds.slice(0, 3).map(a => ({ text: `${a.title}. ${a.how}`, href: '/dashboard/portfolio' })),
    ...(p.protection.gap > 0 && p.protection.dependents > 0 ? [{ text: `Life cover about ₹${Math.round(p.protection.gap / 1e5)}L short — a term plan closes it cheapest.`, href: '/dashboard/insurance' }] : []),
    ...(p.nominees.ready && p.nominees.missing ? [{ text: `Record nominees on ${p.nominees.missing} accounts and policies.`, href: '/dashboard/nominees' }] : []),
  ]
  const deep: string[] = []
  if (period.kind === 'half' || period.kind === 'year') {
    for (const dr of p.drift.filter(x => Math.abs(x.off) >= 5))
      deep.push(`${CLS_LABEL[dr.cls]} is ${Math.round(dr.now)}% vs your ${dr.target}% target — ${dr.off > 0 ? 'send new money elsewhere until it drifts back' : 'point new SIPs here'}${Math.abs(dr.off) >= 15 ? '; the gap is big enough to consider moving some across (mind the tax)' : ''}.`)
    if (!deep.length) deep.push('Your mix is within 5 points of target on every class — no rebalancing needed.')
  }
  if (period.kind === 'year') {
    const losers = p.reviews.filter(r => r.h.currency === 'INR' && (r.gainPct ?? 0) < -10 && ['stock', 'mf', 'etf'].includes(r.h.type))
    deep.push(`New financial year: up to ₹1.25 lakh of long-term equity gains is tax-free each year. Selling and buying back winners up to that limit raises their cost and cuts future tax.`)
    if (losers.length) deep.push(`${losers.length} holding${losers.length === 1 ? ' is' : 's are'} at a loss (${losers.slice(0, 3).map(r => r.h.name).join(', ')}) — booking a loss can offset gains this year.`)
    deep.push('Once a year: check nominees, update property values, and confirm your profile answers still fit.')
  }
  return {
    v: 1, generatedAt: new Date().toISOString(), kind: period.kind, label: period.label, start: period.start, end: period.end,
    totals: { netWorth: nw.netWorth, invested, cost, gain: invested - cost, gainPct: cost > 0 ? (invested - cost) / cost * 100 : null },
    change: ctx.prev || ctx.snapAtStart ? {
      since: ctx.prev?.period_end ?? ctx.snapAtStart!.date, netWorthBefore: ctx.snapAtStart?.value ?? ctx.prev?.data?.totals?.netWorth ?? null,
      investedBefore: prevInvested, contributions: ctx.contributions, growth, growthPct: growth != null && base && base > 0 ? growth / base * 100 : null,
    } : null,
    mix: { now: p.add.mix.pct, target: p.target.mix, source: p.target.source, profile: p.rp?.profile.label ?? null },
    counts,
    holdings: p.reviews.slice(0, 60).map(r => ({ key: r.h.key, name: r.h.name, sub: r.h.sub, currency: r.h.currency, value: r.h.value, gainPct: r.gainPct, verdict: r.verdict, reasons: r.reasons, action: r.action,
      r1y: r.perf?.r1y ?? null, r3y: r.perf?.r3y ?? null, bench: r.perf?.bench?.name ?? null, benchR: (r.perf?.r3y != null ? r.perf?.bench?.r3y : r.perf?.bench?.r1y) ?? null })),
    adds: p.add.adds, actions,
    protection: { gap: p.protection.gap, need: p.protection.need, cover: p.protection.cover, dependents: p.protection.dependents, health: p.protection.health.amount, nomineesMissing: p.nominees.ready ? p.nominees.missing : null },
    access: Object.fromEntries(Object.entries(p.access).map(([k, v]) => [k, v.value])), currency: { aedPct: p.currency.aedPct, inrPct: p.currency.inrPct },
    deep,
    notes: [
      `Values as of ${new Date().toISOString().slice(0, 10)}, in ₹ (AED at ${d.fx.toFixed(2)}).`,
      'Fund and share returns come from live NAVs and prices (mfapi.in, Yahoo Finance) and are compared with an index; property and other estimates are your own.',
      ctx.prev ? `Growth = change in invested value since the last review minus money put in (${ctx.contributions >= 0 ? '+' : ''}₹${Math.round(ctx.contributions).toLocaleString('en-IN')}) — SIPs and buys recorded in the app.` : 'First review — what changed is measured from the next one.',
      'Suggestions, not licensed financial advice.',
    ],
  }
}
