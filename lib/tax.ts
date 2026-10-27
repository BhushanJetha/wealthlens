// India tax-saving planner (old regime). Built only from the holdings you've
// added, so every figure is an estimate. From tax year 2026-27 the Income-tax
// Act, 2025 renumbers these sections (80C is now section 123); the app keeps
// the familiar names, and the caps below are the published limits.
import { daysBetween } from './insights'

export const LIMITS = { c80: 150000, ccd1b: 50000, d80: 25000, d80Senior: 50000, b24: 200000 }

export type Section = '80C' | '80CCD(1B)' | '80D' | '80D parents' | '24(b)'
export interface TaxLine { key: string; name: string; section: Section; amount: number; basis: string; href: string }
export interface Suggestion { key: string; title: string; detail: string; section: string; saves: number | null; href?: string }

export interface TaxInput {
  ppfEpf: any[]; mutualFunds: any[]; invTxns: any[]
  nps: any[]; npsContrib: any[]; lic: any[]; insurance: any[]; loans: any[]
  tagged?: any[]       // expenses you tagged with a section (transactions.tax_tag)
}

// Indian financial year containing `today` (1 April – 31 March)
export function fyOf(today: string) {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7))
  const s = m >= 4 ? y : y - 1
  return { start: `${s}-04-01`, end: `${s + 1}-03-31`, label: `FY ${s}–${String(s + 1).slice(2)}` }
}

const isInr = (c?: string | null) => (c ?? 'INR') === 'INR'
const sum = (xs: number[]) => xs.reduce((a, v) => a + v, 0)
const shortName = (s: string) => String(s).split(/\s[–-]\s/)[0].replace(/\s+(Direct|Regular).*$/i, '').trim()
// "PPF · SBI", not "PPF · PPF – SBI"
const tagged = (tag: string, name: string) => {
  const n = String(name ?? '').trim()
  return n.toUpperCase().startsWith(tag) ? n : `${tag} · ${n}`
}

export function planTax(inp: TaxInput, today: string) {
  const fy = fyOf(today)
  const inFy = (d?: string | null) => !!d && d >= fy.start && d <= fy.end
  const lines: TaxLine[] = []

  for (const a of inp.ppfEpf.filter(a => isInr(a.currency) && Number(a.annual_contribution) > 0))
    lines.push({ key: `pf-${a.id}`, name: tagged(a.kind === 'epf' ? 'EPF' : 'PPF', a.name), section: '80C', amount: Number(a.annual_contribution), basis: 'Yearly contribution you entered', href: '/dashboard/investments/ppf-epf' })

  // ELSS: a running SIP counts as 12 instalments; plus lump sums bought this FY
  const elss = inp.mutualFunds.filter(f => f.fund_type === 'elss' && isInr(f.currency))
  for (const f of elss) {
    const fyTx = inp.invTxns.filter(t => t.asset_id === f.id && inFy(t.txn_date))
    const lump = sum(fyTx.filter(t => t.txn_type === 'purchase' || t.txn_type === 'switch_in').map(t => Number(t.amount) || 0))
    const sip = f.has_sip && Number(f.sip_amount) > 0
    const sipFy = sip ? Number(f.sip_amount) * 12 : sum(fyTx.filter(t => t.txn_type === 'sip').map(t => Number(t.amount) || 0))
    if (lump + sipFy > 0) lines.push({
      key: `elss-${f.id}`, name: `ELSS · ${shortName(f.fund_name)}`, section: '80C', amount: lump + sipFy,
      basis: sip ? `SIP × 12 months${lump ? ' + lump sums this FY' : ''}` : 'Bought this FY', href: '/dashboard/investments/mutual-funds',
    })
  }

  for (const p of inp.lic.filter(p => p.is_active !== false && isInr(p.currency) && Number(p.annual_premium) > 0))
    lines.push({ key: `lic-${p.id}`, name: tagged('LIC', p.name), section: '80C', amount: Number(p.annual_premium), basis: 'Yearly premium', href: '/dashboard/investments/lic' })

  for (const p of inp.insurance.filter(p => p.is_active !== false && isInr(p.currency) && Number(p.annual_premium) > 0)) {
    if (p.policy_type === 'term_life')
      lines.push({ key: `ins-${p.id}`, name: p.policy_name, section: '80C', amount: Number(p.annual_premium), basis: 'Life cover premium', href: '/dashboard/insurance' })
    else if (p.policy_type === 'health') {
      const parents = (p.insured_members ?? []).some((m: string) => /father|mother|parent/i.test(m))
      lines.push({ key: `ins-${p.id}`, name: p.policy_name, section: parents ? '80D parents' : '80D', amount: Number(p.annual_premium), basis: parents ? "Parents' health premium" : 'Health premium', href: '/dashboard/insurance' })
    }
  }

  // NPS Tier I paid this FY: the first ₹50K goes to 80CCD(1B), the rest to 80C
  const tier1 = new Set(inp.nps.filter(a => isInr(a.currency) && !/II/.test(String(a.tier ?? 'Tier I'))).map(a => a.id))
  const npsPaid = sum(inp.npsContrib.filter(c => tier1.has(c.nps_account_id) && inFy(c.contribution_date)).map(c => Number(c.amount) || 0))
  if (npsPaid > 0) {
    lines.push({ key: 'nps-1b', name: 'NPS Tier I', section: '80CCD(1B)', amount: Math.min(npsPaid, LIMITS.ccd1b), basis: 'Contributions this FY', href: '/dashboard/investments/nps' })
    if (npsPaid > LIMITS.ccd1b) lines.push({ key: 'nps-c', name: 'NPS Tier I (beyond ₹50K)', section: '80C', amount: npsPaid - LIMITS.ccd1b, basis: 'Contributions this FY', href: '/dashboard/investments/nps' })
  }

  // Home loan: 12 months of EMIs from today's balance, split into principal
  // (80C) and interest (24(b), self-occupied)
  for (const l of inp.loans.filter(l => (l.loan_type ?? 'home_loan') === 'home_loan' && isInr(l.currency) && l.is_active !== false)) {
    let bal = Number(l.outstanding_amt) || 0, interest = 0, principal = 0
    const r = (Number(l.interest_rate) || 0) / 1200, emi = Number(l.emi_amount) || 0
    for (let i = 0; i < 12 && bal > 0 && emi > 0; i++) {
      const it = bal * r, pr = Math.min(Math.max(emi - it, 0), bal)
      interest += it; principal += pr; bal -= pr
    }
    if (principal > 0) lines.push({ key: `hl-p-${l.id}`, name: `${l.name} · principal`, section: '80C', amount: Math.round(principal), basis: 'Estimated from 12 EMIs', href: '/dashboard/loans/home' })
    if (interest > 0) lines.push({ key: `hl-i-${l.id}`, name: `${l.name} · interest`, section: '24(b)', amount: Math.round(interest), basis: 'Estimated from 12 EMIs', href: '/dashboard/loans/home' })
  }

  // Expenses you tagged (tuition fees, a parent's check-up…), per merchant
  const TAGS: Section[] = ['80C', '80D', '80D parents']
  const byTag: Record<string, { section: Section; name: string; amount: number; n: number }> = {}
  for (const t of (inp.tagged ?? []).filter(t => isInr(t.currency) && inFy(t.txn_date) && TAGS.includes(t.tax_tag))) {
    const name = String(t.merchant ?? 'Expense').trim(), k = `${t.tax_tag}|${name.toLowerCase()}`
    const e = byTag[k] ??= { section: t.tax_tag, name, amount: 0, n: 0 }
    e.amount += Number(t.amount) || 0; e.n++
  }
  for (const [k, e] of Object.entries(byTag)) if (e.amount > 0) lines.push({
    key: `tag-${k}`, name: e.name, section: e.section, amount: Math.round(e.amount),
    basis: `${e.n} tagged expense${e.n === 1 ? '' : 's'} this FY`, href: '/dashboard/expenses',
  })

  const total = (s: Section) => sum(lines.filter(l => l.section === s).map(l => l.amount))
  const raw = { c80: total('80C'), ccd1b: total('80CCD(1B)'), d80: total('80D'), d80p: total('80D parents'), b24: total('24(b)') }
  const claim = {
    c80: Math.min(raw.c80, LIMITS.c80), ccd1b: Math.min(raw.ccd1b, LIMITS.ccd1b),
    d80: Math.min(raw.d80, LIMITS.d80), d80p: Math.min(raw.d80p, LIMITS.d80), b24: Math.min(raw.b24, LIMITS.b24),
  }
  const deductions = claim.c80 + claim.ccd1b + claim.d80 + claim.d80p + claim.b24
  const daysLeft = Math.max(daysBetween(today, fy.end), 0)
  const [ey] = fy.end.split('-').map(Number)
  const monthsLeft = Math.max((ey * 12 + 3) - (Number(today.slice(0, 4)) * 12 + Number(today.slice(5, 7))) + 1, 1)

  return { fy, lines, raw, claim, deductions, daysLeft, monthsLeft, hasElss: elss.length > 0, hasNps: tier1.size > 0 }
}

// Suggestions in rough order of tax saved; `rate` is the marginal slab incl. cess
export function taxSuggestions(p: ReturnType<typeof planTax>, rate: number, fmt: (n: number) => string): Suggestion[] {
  const out: Suggestion[] = []
  const c80Room = LIMITS.c80 - p.claim.c80
  if (c80Room > 0) out.push({
    key: 'c80', section: '80C', saves: Math.round(c80Room * rate), href: '/dashboard/investments/mutual-funds',
    title: `Fill ${fmt(c80Room)} of 80C room`,
    detail: p.hasElss
      ? `About ${fmt(Math.ceil(c80Room / p.monthsLeft / 100) * 100)} a month into your ELSS fund until March fills it.`
      : `ELSS funds have the shortest lock-in (3 years). About ${fmt(Math.ceil(c80Room / p.monthsLeft / 100) * 100)} a month until March fills it.`,
  })
  const npsRoom = LIMITS.ccd1b - p.claim.ccd1b
  if (npsRoom > 0) out.push({
    key: 'nps', section: '80CCD(1B)', saves: Math.round(npsRoom * rate), href: '/dashboard/investments/nps',
    title: `Add ${fmt(npsRoom)} to NPS Tier I`,
    detail: p.hasNps ? 'This deduction sits on top of the ₹1.5L 80C limit.' : 'An extra ₹50K deduction on top of 80C. NRIs can open NPS too.',
  })
  if (p.raw.d80 === 0) out.push({
    key: 'd80', section: '80D', saves: Math.round(LIMITS.d80 * rate), href: '/dashboard/insurance',
    title: 'Health cover in India for you or your family', detail: 'Premiums up to ₹25K a year are deductible.',
  })
  if (p.raw.d80p === 0) out.push({
    key: 'd80p', section: '80D', saves: Math.round(LIMITS.d80 * rate), href: '/dashboard/insurance',
    title: "Your parents' health premium", detail: "Up to ₹25K more (₹50K if a parent is 60 or older). Tag the policy's members as Father or Mother so it's counted.",
  })
  if (p.raw.b24 > LIMITS.b24) out.push({
    key: 'b24', section: '24(b)', saves: null,
    title: `${fmt(p.raw.b24 - LIMITS.b24)} of home-loan interest is above the cap`,
    detail: 'Self-occupied homes allow ₹2L of interest a year. A prepayment lowers interest you can no longer deduct.',
    href: '/dashboard/loans/home',
  })
  return out
}
