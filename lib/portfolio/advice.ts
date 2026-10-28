// The portfolio manager's rules: a verdict on every holding (keep, watch,
// consider switching, trim, check) with the numbers behind it, and what to
// add — sized from the gap between your mix and your target. Rules only; an
// AI market view (when a key is set) is added on top, separately.
import { type PHolding, type Cls, toInr, mixNow } from './holdings'
import { EXAMPLES, examplesFor, type Example } from './catalog'

export type Verdict = 'keep' | 'watch' | 'switch' | 'trim' | 'check'
export const VERDICT: Record<Verdict, { label: string; bg: string; c: string; rank: number }> = {
  switch: { label: 'Consider switching', bg: '#FDECE8', c: '#B4231A', rank: 0 },
  trim:   { label: 'Trim',               bg: 'var(--amber-bg)', c: 'var(--amber-text)', rank: 1 },
  check:  { label: 'Check',              bg: 'var(--amber-bg)', c: 'var(--amber-text)', rank: 2 },
  watch:  { label: 'Watch',              bg: '#F1F5F9', c: 'var(--text2)', rank: 3 },
  keep:   { label: 'Keep',               bg: 'var(--pos-bg)', c: 'var(--pos-text)', rank: 4 },
}
// Performance from live data (lib/portfolio/perf): yearly returns in %
export interface Perf { r1y?: number | null; r3y?: number | null; bench?: { name: string; r1y?: number | null; r3y?: number | null } }
export interface HoldingReview { h: PHolding; verdict: Verdict; reasons: string[]; action?: string; gainPct: number | null; perf?: Perf }

const money = (n: number, c: 'AED' | 'INR') => (c === 'AED' ? `AED ${Math.round(n).toLocaleString('en-US')}` : `₹${Math.round(n).toLocaleString('en-IN')}`)
const pct = (n: number) => `${n >= 0 ? '' : '−'}${Math.abs(Math.round(n * 10) / 10)}%`
const CAT = (n: string) => { const s = n.toLowerCase(); return /small ?cap/.test(s) ? 'small-cap' : /mid ?cap/.test(s) ? 'mid-cap' : /large ?& ?mid|large and mid/.test(s) ? 'large & mid-cap' : /flexi|multi ?cap|focused/.test(s) ? 'flexi-cap' : /nifty|sensex|index/.test(s) ? 'index' : /large ?cap|bluechip|top 100/.test(s) ? 'large-cap' : /elss|tax saver/.test(s) ? 'ELSS' : /nasdaq|us |global|international|world/.test(s) ? 'international' : null }
const THEMATIC = /banking|financial services|pharma|healthcare|technology|digital|infra|psu|consumption|thematic|manufacturing|defence|energy|auto|realty|commodit/i

export function reviewHoldings(hs: PHolding[], perf: Record<string, Perf>, ctx: { fx: number; today: string; fdRate?: number | null; age?: number; profile?: string; targetGold?: number }): HoldingReview[] {
  const inv = hs.filter(h => h.investable && h.type !== 'bank')
  const total = inv.reduce((s, h) => s + toInr(h.value, h.currency, ctx.fx), 0)
  const equityTotal = inv.reduce((s, h) => s + toInr(h.value, h.currency, ctx.fx) * h.mix.equity, 0)
  const share = (h: PHolding) => (total > 0 ? toInr(h.value, h.currency, ctx.fx) / total * 100 : 0)
  const eqShare = (h: PHolding) => (equityTotal > 0 ? toInr(h.value, h.currency, ctx.fx) * h.mix.equity / equityTotal * 100 : 0)
  const days = (d?: string | null) => (d ? (Date.parse(d) - Date.parse(ctx.today)) / 864e5 : Infinity)
  const goldPct = inv.reduce((s, h) => s + toInr(h.value, h.currency, ctx.fx) * h.mix.gold, 0) / (total || 1) * 100

  // Equity funds in the same category: 3 or more overlap heavily
  const cats: Record<string, PHolding[]> = {}
  for (const h of inv.filter(h => h.type === 'mf' && h.mix.equity > 0)) { const c = CAT(h.name); if (c && c !== 'index') (cats[c] ??= []).push(h) }

  return inv.map(h => {
    const p = perf[h.key], reasons: string[] = []
    let verdict: Verdict = 'keep', action: string | undefined
    const gainPct = h.cost > 0 && h.cost !== h.value ? (h.value - h.cost) / h.cost * 100 : null
    const worse = (v: Verdict) => { if (VERDICT[v].rank < VERDICT[verdict].rank) verdict = v }

    if (h.type === 'mf') {
      const debt = h.mix.debt >= 0.9 || h.mix.cash >= 0.9
      if (p?.r3y != null && p.bench?.r3y != null && !debt) {
        const d = p.r3y - p.bench.r3y
        if (d < -2) { worse('switch'); reasons.push(`Returned ${pct(p.r3y)} a year over 3 years vs ${pct(p.bench.r3y)} for the ${p.bench.name} — ${pct(-d)} a year behind.`); action = 'Compare it with a low-cost index fund in the same category before adding more.' }
        else if (d < 0) { worse('watch'); reasons.push(`${pct(p.r3y)} a year over 3 years — just behind the ${p.bench.name} (${pct(p.bench.r3y)}).`) }
        else reasons.push(`${pct(p.r3y)} a year over 3 years — ahead of the ${p.bench.name} (${pct(p.bench.r3y)}).`)
      } else if (p?.r1y != null && p.bench?.r1y != null && !debt) {
        const d = p.r1y - p.bench.r1y
        if (d < -5) { worse('watch'); reasons.push(`${pct(p.r1y)} over the last year vs ${pct(p.bench.r1y)} for the ${p.bench.name}. One year is too short to judge — look again next review.`) }
        else reasons.push(`${pct(p.r1y)} over the last year (${p.bench.name}: ${pct(p.bench.r1y)}).`)
      } else if (debt && (p?.r3y ?? p?.r1y) != null) {
        const r = (p!.r3y ?? p!.r1y)!, ref = ctx.fdRate
        if (ref && r < ref - 1) { worse('watch'); reasons.push(`Earned ${pct(r)} a year — less than your FDs (${pct(ref)}).`) }
        else reasons.push(`Earned ${pct(r)} a year${ref ? ` (your FDs: ${pct(ref)})` : ''}.`)
      } else { worse('watch'); reasons.push('No NAV history to compare yet — refresh prices on Mutual funds so it links to its live NAV, and the next review can judge it.') }
      if (/\bregular\b/i.test(h.name)) {
        worse('switch'); reasons.push('Regular plan: the Direct plan of the same fund costs about 0.5–1% a year less.')
        action = 'Move to the Direct plan — note that switching counts as selling, so check the tax and exit load first.'
      }
      if (THEMATIC.test(h.name) && eqShare(h) > 10) { worse('trim'); reasons.push(`A sector/theme fund making up ${Math.round(eqShare(h))}% of your equity — one industry having a bad patch hits hard.`) }
      const c = CAT(h.name)
      if (c && cats[c]?.length >= 3) {
        const smallest = [...cats[c]].sort((a, b) => a.value - b.value).slice(0, cats[c].length - 2)
        if (smallest.some(x => x.key === h.key)) { worse('trim'); reasons.push(`You hold ${cats[c].length} ${c} funds — they own much the same shares. One or two is enough; stop SIPs into the smaller ones.`) }
      }
    } else if (h.type === 'stock') {
      if (p?.r1y != null && p.bench?.r1y != null && p.r1y - p.bench.r1y < -20 && (gainPct ?? 0) < -20) {
        worse('check'); reasons.push(`Down ${pct(-p.r1y)} over a year while the ${p.bench.name} moved ${pct(p.bench.r1y)}.`); action = 'Check whether the business has changed before adding more — don’t average down by habit.'
      } else if (p?.r1y != null) reasons.push(`${pct(p.r1y)} over the last year${p.bench?.r1y != null ? ` (${p.bench.name}: ${pct(p.bench.r1y)})` : ''}.`)
      if (eqShare(h) > 10) { worse('trim'); reasons.push(`One company is ${Math.round(eqShare(h))}% of your equity — keep any single share under about 10%.`) }
      if ((gainPct ?? 0) < -30) reasons.push('A loss this size can be booked to cut tax on other gains (and bought back later if you still believe in it).')
    } else if (h.type === 'etf') {
      if (p?.r1y != null && p.bench?.r1y != null && h.mix.equity > 0 && p.r1y - p.bench.r1y < -2) { worse('watch'); reasons.push(`Lagged its index by ${pct(p.bench.r1y - p.r1y)} last year — more than an index ETF should.`) }
      else reasons.push(h.mix.gold ? 'Gold ETF — a simple, low-cost way to hold gold.' : 'Low-cost and diversified.')
    } else if (h.type === 'fd') {
      const rate = Number(h.raw?.interest_rate) || 0, d = days(h.unlock)
      if (d >= 0 && d <= 30) { worse('check'); reasons.push(`Matures ${h.unlock} — decide now: renew, or put it towards a gap in your mix or a goal.`) }
      if (h.currency === 'INR' && rate > 0 && rate < 6.5) { worse('watch'); reasons.push(`${rate}% a year. If it’s from an NRO account, 30% tax leaves about ${(rate * 0.7).toFixed(1)}% — below inflation. NRE FDs are tax-free in India.`) }
      else if (rate) reasons.push(`${rate}% a year, fixed.`)
    } else if (h.type === 'ppf') {
      reasons.push(h.raw?.kind === 'epf' ? 'Steady, tax-free and safe — keep it.' : 'Tax-free and safe. As an NRI you can keep it until it matures.')
    } else if (h.type === 'nps') {
      const eq = Number(h.raw?.equity_allocation) || 0
      if ((ctx.age ?? 99) < 45 && eq < 50 && (ctx.profile === 'growth' || ctx.profile === 'aggressive')) { worse('watch'); reasons.push(`Only ${eq}% in equity with many years to 60 — you can choose up to 75%.`) }
      else reasons.push('Locked for retirement; low cost. Keep.')
    } else if (h.type === 'gold') {
      if (goldPct > (ctx.targetGold ?? 10) + 7) { worse('trim'); reasons.push(`Gold is ${Math.round(goldPct)}% of your investments — above your ${ctx.targetGold ?? 10}% target. It protects; it doesn’t grow much.`) }
      else reasons.push(/sgb|sovereign/i.test(h.sub + h.name) ? 'Sovereign gold bond: 2.5% interest and no tax on gains if held to maturity.' : 'Gold as a hedge — fine at around 5–10%.')
    } else if (h.type === 'bond') {
      const d = days(h.unlock)
      if (d >= 0 && d <= 60) { worse('check'); reasons.push(`Matures ${h.unlock} — plan where the money goes.`) } else reasons.push('Fixed income until maturity.')
    } else if (h.type === 'lic') {
      worse('watch'); reasons.push('Endowment and money-back plans usually return about 4–6% a year. Surrendering early returns less than you paid, so compare its surrender value with a term plan + investing the premium before deciding.')
    } else if (h.type === 'other') {
      const k = h.raw?.kind
      if (k === 'crypto' && share(h) > 5) { worse('trim'); reasons.push(`Crypto is ${Math.round(share(h))}% of your investments — most planners keep it under 5%.`) }
      else if (k === 'esop' && share(h) > 15) { worse('trim'); reasons.push(`${Math.round(share(h))}% in your employer’s shares — your job and savings shouldn’t ride on one company. Sell some as they vest.`) }
      else reasons.push(k === 'crypto' ? 'Very volatile — keep it small.' : 'Held abroad; counts in your equity.')
    }
    if (h.goalIds.length) reasons.push(`Linked to ${h.goalIds.length} goal${h.goalIds.length === 1 ? '' : 's'}.`)
    return { h, verdict, reasons, action, gainPct, perf: p }
  }).sort((a, b) => VERDICT[a.verdict].rank - VERDICT[b.verdict].rank || toInr(b.h.value, b.h.currency, ctx.fx) - toInr(a.h.value, a.h.currency, ctx.fx))
}

// ── What to add ──────────────────────────────────────────────────────────────
export interface AddIdea { id: string; cls: Cls | 'emergency' | 'tax'; title: string; amount: number; currency: 'AED' | 'INR'; why: string; how: string; examples: Example[] }
// "Debt" the asset class (FDs, PPF, bonds, debt funds) is called fixed income in
// the app, so it's never confused with loans
export const CLS_LABEL: Record<Cls, string> = { equity: 'Equity', debt: 'Fixed income', gold: 'Gold', cash: 'Cash' }

export function whatToAdd(hs: PHolding[], o: {
  fx: number; target: Record<Cls, number>; answers: Record<string, any> | null; profile?: string
  essentials: { AED: number; INR: number }; saving: { AED: number; INR: number }
}): { adds: AddIdea[]; over: { cls: Cls; pct: number; target: number }[]; mix: ReturnType<typeof mixNow>; keep: number; home: 'AED' | 'INR' } {
  const home: 'AED' | 'INR' = o.essentials.AED * o.fx >= o.essentials.INR ? 'AED' : 'INR'
  const cashIn = (c: 'AED' | 'INR') => hs.filter(h => h.type === 'bank' && h.currency === c).reduce((s, h) => s + h.value, 0)
  const keep = { AED: o.essentials.AED * 6, INR: o.essentials.INR * 6 }
  const keepInr = keep.AED * o.fx + keep.INR
  const mix = mixNow(hs, o.fx, Math.min(keepInr, cashIn('AED') * o.fx + cashIn('INR')))
  const a = { return: o.answers?.return, avoid: (o.answers?.avoid ?? []) as string[], profile: o.profile }
  const adds: AddIdea[] = []
  const fmtTo = (inr: number, c: 'AED' | 'INR') => (c === 'AED' ? inr / o.fx : inr)

  // 1. Emergency fund first, in the currency you live on
  const short = keep[home] - cashIn(home)
  if (keep[home] > 0 && short > keep[home] * 0.1) adds.push({ id: 'emergency', cls: 'emergency', title: 'Finish your emergency fund first', amount: short, currency: home,
    why: `Six months of essentials is about ${money(keep[home], home)}; you have ${money(cashIn(home), home)} in the bank. Investing before this is done means selling in a hurry when something goes wrong.`,
    how: 'Keep it where you can reach it the same day.', examples: home === 'AED' ? EXAMPLES.uae_cash : [{ name: 'A sweep-in FD or liquid fund', kind: 'Near-cash', where: 'India', note: 'Earns more than savings, reachable in a day' }] })

  // 2. Gaps against the target mix, biggest first; funded from idle cash, then monthly saving
  const idle = Math.max(0, mix.by.cash - mix.total * (o.target.cash / 100))
  let fromIdle = idle
  const gaps = (['equity', 'debt', 'gold'] as Cls[]).map(cls => ({ cls, gap: o.target[cls] / 100 * mix.total - mix.by[cls] })).filter(g => g.gap > mix.total * 0.03).sort((x, y) => y.gap - x.gap)
  for (const g of gaps) {
    const groups = examplesFor(g.cls, a)
    if (!groups.length) continue
    const cur: 'AED' | 'INR' = g.cls === 'equity' && groups.includes('global') && home === 'AED' && a.return !== 'soon' ? 'AED' : 'INR'
    const now = Math.min(fromIdle, g.gap); fromIdle -= now
    const monthly = (g.gap - now) / 12
    const save = cur === 'AED' ? o.saving.AED : o.saving.INR
    adds.push({ id: `gap-${g.cls}`, cls: g.cls, title: `Add ${CLS_LABEL[g.cls].toLowerCase()} — ${Math.round(mix.pct[g.cls])}% now, ${o.target[g.cls]}% target`, amount: fmtTo(g.gap, cur), currency: cur,
      why: g.cls === 'equity' ? 'Equity is what grows faster than inflation over the long run; you hold less than your profile suits.'
        : g.cls === 'debt' ? 'Fixed income (FDs, bonds, debt funds) steadies the whole portfolio and is what you sell first when you need money.'
        : 'A little gold cushions the portfolio when markets fall.',
      how: [now > 0 && `${money(fmtTo(now, cur), cur)} from idle cash now`, monthly > 0 && `${money(fmtTo(monthly, cur), cur)} a month for a year${save > 0 && fmtTo(monthly, cur) > save ? ' (more than you save now — spread it longer)' : ''}`].filter(Boolean).join(', then ') || 'Through your monthly saving.',
      // Two from each group, the dirham option first when the money is in dirhams
      examples: (cur === 'AED' ? [...groups].sort((x, y) => Number(y === 'global') - Number(x === 'global')) : groups).flatMap(k => EXAMPLES[k].slice(0, 2)).slice(0, 6) })
  }
  // 3. Tax saving, for those with taxable Indian income
  if (o.answers?.tax === 'yes' && !hs.some(h => h.type === 'mf' && /elss|tax saver/i.test(h.name)))
    adds.push({ id: 'elss', cls: 'tax', title: 'Cut your Indian tax with ELSS', amount: 150000, currency: 'INR', why: 'Up to ₹1.5 lakh a year counts under section 80C — only if you’ve chosen the old tax regime.', how: 'A monthly SIP of ₹12,500 fills the limit.', examples: EXAMPLES.elss })

  const over = (['equity', 'debt', 'gold', 'cash'] as Cls[]).filter(c => mix.pct[c] > o.target[c] + 7).map(c => ({ cls: c, pct: mix.pct[c], target: o.target[c] }))
  return { adds, over, mix, keep: keepInr, home }
}
