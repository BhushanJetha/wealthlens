// Assembles the portfolio manager from the loaded data: every holding, your
// target mix, a verdict on each holding, what to add, money by how fast you
// can reach it, the AED / ₹ split, protection checks, and the overview's
// "Needs you" list. Pure — the same function powers the pages and reviews.
import { portfolioHoldings, byAccess, byCurrency, toInr, type Cls } from './holdings'
import { answered, riskProfile, targetMix } from './profile'
import { reviewHoldings, whatToAdd, CLS_LABEL, type Perf } from './advice'
import { lifeCoverCheck, nomineeRows } from './protection'
import type { PortfolioData } from './data'

export interface Need { id: string; icon: string; tone: 'warn' | 'info' | 'good'; title: string; detail: string; href: string }

export function buildPortfolio(d: Pick<PortfolioData, 'today' | 'fx' | 'holdings' | 'links' | 'insurance' | 'members' | 'profile' | 'monthly' | 'reviews' | 'wealthReady'>, perf: Record<string, Perf> = {}) {
  const { fx, today } = d
  const hs = portfolioHoldings(d.holdings, d.links, today)
  const answers = (d.profile?.answers && Object.keys(d.profile.answers).length ? d.profile.answers : null) as Record<string, any> | null
  const rp = answered(answers) ? riskProfile(answers!) : null
  const target = targetMix(d.profile?.targets, answers)
  const essentials = { AED: d.monthly.AED.essentials, INR: d.monthly.INR.essentials }
  const saving = { AED: Math.max(0, d.monthly.AED.saved), INR: Math.max(0, d.monthly.INR.saved) }
  const add = whatToAdd(hs, { fx, target: target.mix, answers, profile: rp?.profile.key, essentials, saving })
  const fds = hs.filter(h => h.type === 'fd' && h.currency === 'INR' && Number(h.raw?.interest_rate) > 0)
  const fdRate = fds.length ? fds.reduce((s, h) => s + h.value * Number(h.raw.interest_rate), 0) / fds.reduce((s, h) => s + h.value, 0) : null
  const reviews = reviewHoldings(hs, perf, { fx, today, fdRate, age: Number(answers?.age) || undefined, profile: rp?.profile.key, targetGold: target.mix.gold })
  const access = byAccess(hs, fx), currency = byCurrency(hs, fx)
  const protection = lifeCoverCheck({ h: d.holdings, hs, insurance: d.insurance, members: d.members, answers, income: { AED: d.monthly.AED.income, INR: d.monthly.INR.income }, fx })
  const nominees = nomineeRows(d.holdings, d.insurance)
  const drift = (['equity', 'debt', 'gold', 'cash'] as Cls[]).map(c => ({ cls: c, now: add.mix.pct[c], target: target.mix[c], off: add.mix.pct[c] - target.mix[c] })).sort((a, b) => Math.abs(b.off) - Math.abs(a.off))

  // ── Needs you (overview) ──
  const needs: Need[] = []
  const inr = (v: number) => `₹${Math.round(v).toLocaleString('en-IN')}`
  const days = (dt?: string | null) => (dt ? Math.round((Date.parse(dt) - Date.parse(today)) / 864e5) : Infinity)
  const linked = new Set((d.holdings.otherAssets ?? []).map(a => a.loan_id).filter(Boolean))
  for (const l of (d.holdings.loans ?? []).filter(l => (l.loan_type ?? 'home_loan') === 'home_loan' && !linked.has(l.id)))
    needs.push({ id: `home-${l.id}`, icon: '🏠', tone: 'warn', title: `${l.name} counts as debt, but the home doesn’t`, detail: d.wealthReady ? 'Add the home it bought so your net worth is right.' : 'Run migration 032, then add the home it bought.', href: '/dashboard/assets' })
  for (const h of hs.filter(h => ['fd', 'bond', 'rd'].includes(h.type) && days(h.unlock) >= 0 && days(h.unlock) <= 30))
    needs.push({ id: `mat-${h.key}`, icon: '🏦', tone: 'info', title: `${h.name} matures ${h.unlock}`, detail: 'Decide now: renew it, or put it towards a gap in your mix or a goal.', href: '/dashboard/portfolio' })
  for (const p of d.insurance.filter(p => days(p.next_premium_date) >= 0 && days(p.next_premium_date) <= 30))
    needs.push({ id: `prem-${p.id}`, icon: '🛡️', tone: 'info', title: `${p.policy_name} premium due ${p.next_premium_date}`, detail: `${p.currency === 'AED' ? 'AED ' : '₹'}${Math.round(Number(p.annual_premium) || 0).toLocaleString('en-IN')} a year.`, href: '/dashboard/insurance' })
  if (protection.gap > 0 && protection.dependents > 0) needs.push({ id: 'life', icon: '☂️', tone: 'warn', title: `Life cover looks ${inr(protection.gap)} short`, detail: `${protection.dependents} ${protection.dependents === 1 ? 'person depends' : 'people depend'} on you; a term plan is the cheapest way to close it.`, href: '/dashboard/insurance' })
  if (nominees.ready && nominees.missing > 0) needs.push({ id: 'nominees', icon: '📝', tone: 'warn', title: `${nominees.missing} account${nominees.missing === 1 ? '' : 's'} and policies without a nominee`, detail: 'Without one, family has to prove their claim — hard from India.', href: '/dashboard/nominees' })
  const big = drift[0]
  if (big && Math.abs(big.off) >= 10 && add.mix.total > 0) needs.push({ id: 'drift', icon: '⚖️', tone: 'info', title: `${CLS_LABEL[big.cls]} is ${Math.round(big.now)}% of your investments — target ${big.target}%`, detail: 'Point new money at what’s under target rather than selling.', href: '/dashboard/portfolio' })
  const idle = add.adds.find(a => a.id.startsWith('gap-') && /idle cash/.test(a.how))
  if (idle) needs.push({ id: 'idle', icon: '💤', tone: 'info', title: 'Cash is sitting idle beyond your emergency fund', detail: idle.how, href: '/dashboard/portfolio' })
  if (!rp) needs.push({ id: 'profile', icon: '🧭', tone: 'info', title: 'Answer 10 quick questions', detail: 'So keep / sell and what-to-add suggestions fit you, not a default.', href: '/dashboard/portfolio/profile' })
  const latest = d.reviews[0]
  if (latest && !latest.seen_at) needs.push({ id: 'review', icon: '📊', tone: 'good', title: `Your ${latest.label} portfolio review is ready`, detail: `${latest.data?.actions?.length ?? 0} things to look at.`, href: `/dashboard/portfolio/reviews/${latest.id}` })
  for (const a of (d.holdings.otherAssets ?? []).filter(a => ['property', 'land'].includes(a.kind) && a.value_as_of && days(a.value_as_of) < -366))
    needs.push({ id: `stale-${a.id}`, icon: '🗓️', tone: 'info', title: `Update what ${a.name} is worth`, detail: `Last set ${a.value_as_of}.`, href: '/dashboard/assets' })

  const investedInr = hs.filter(h => h.investable && h.type !== 'bank').reduce((s, h) => s + toInr(h.value, h.currency, fx), 0)
  return { hs, answers, rp, target, add, reviews, access, currency, protection, nominees, drift, needs, essentials, saving, fdRate, investedInr }
}
export type Portfolio = ReturnType<typeof buildPortfolio>
