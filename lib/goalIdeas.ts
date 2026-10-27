// Goal ideas built from your own numbers (to encourage setting goals) and
// nudges for the goals you have. Every amount is a starting point to edit.
import { kindOf, KINDS, kindInfo, type Kind, type Cur } from './goals'

export interface Idea {
  id: string; kind: Kind; name: string; why: string
  target: number; currency: Cur; months: number
  track_cash?: boolean; holder_name?: string | null
}
export interface IdeaInput {
  goals: any[]; today: string; fx: number
  members: { name: string; relationship: string }[]
  // Averages of the last 3 complete months, per currency
  monthly: Record<Cur, { essentials: number; income: number; saved: number }>
  travel: Record<Cur, number>        // spent on travel in the last 12 months
  cash: Record<Cur, number>          // bank & cash balances
  loans: { name: string; currency: string; emi: number; monthsLeft: number | null; type?: string }[]
}
const round = (v: number, cur: Cur) => { const step = cur === 'AED' ? 500 : v >= 1e6 ? 50000 : 5000; return Math.max(step, Math.round(v / step) * step) }
const money = (v: number, cur: Cur) => `${cur === 'AED' ? 'AED ' : '₹'}${Math.round(v).toLocaleString(cur === 'AED' ? 'en-US' : 'en-IN')}`
const monthName = (today: string, add: number) => { const [y, m] = today.split('-').map(Number); return new Date(Date.UTC(y, m - 1 + add, 1)).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }) }

export function goalIdeas(p: IdeaInput): Idea[] {
  const has = (k: Kind, cur?: Cur, re?: RegExp) => p.goals.some(g => g.status !== 'cancelled' && kindOf(g) === k && (!cur || g.currency === cur) && (!re || re.test(String(g.name ?? '') + ' ' + String(g.holder_name ?? ''))))
  const out: Idea[] = []
  const main: Cur = p.monthly.AED.essentials * p.fx >= p.monthly.INR.essentials ? 'AED' : 'INR'

  // Emergency fund in the currency you live on
  if (!has('emergency', main) && p.monthly[main].essentials > 0) {
    const e = p.monthly[main].essentials
    const have = p.cash[main]
    out.push({ id: 'emergency', kind: 'emergency', name: 'Emergency fund', currency: main, months: 12, track_cash: true,
      target: round(e * 6, main),
      why: `6 months of your essentials (${money(e, main)} a month). ${have > 0 ? `Your ${money(have, main)} in the bank already counts towards it.` : ''}`.trim() })
  }
  // Retirement / return to India
  if (!has('retirement')) {
    const yearly = (p.monthly.INR.essentials || p.monthly.AED.essentials * p.fx) * 12
    if (yearly > 0) out.push({ id: 'retirement', kind: 'retirement', name: 'Retire in India', currency: 'INR', months: 240,
      target: round(yearly * 25, 'INR'),
      why: `About 25× a year of your spending (${money(yearly, 'INR')} today) lets you live off it. Set the year you want to stop.` })
  }
  // Each child's education
  for (const m of p.members.filter(m => /child|son|daughter|kid/i.test(m.relationship))) {
    if (has('education', undefined, new RegExp(m.name.split(' ')[0], 'i'))) continue
    out.push({ id: `edu-${m.name}`, kind: 'education', name: `${m.name.split(' ')[0]}'s education`, currency: 'INR', months: 180, target: 2500000, holder_name: m.name,
      why: 'Fees rise about 10% a year — starting early roughly halves the monthly amount. Change the year and amount to your plan.' })
  }
  // Parents' health
  if (p.members.some(m => /father|mother|parent|dad|mom|mum/i.test(m.relationship)) && !has('health') && !has('family')) {
    out.push({ id: 'parents-health', kind: 'health', name: "Parents' health fund", currency: 'INR', months: 24, target: 500000,
      why: 'Medical costs rise fast and senior cover has limits — a fund means no scramble for money.' })
  }
  // Trip home / travel, from what you actually spend on travel
  for (const cur of ['AED', 'INR'] as Cur[]) {
    if (p.travel[cur] > 0 && !has('travel', cur)) out.push({ id: `travel-${cur}`, kind: 'travel', name: cur === 'AED' ? 'Trip home' : 'Family holiday', currency: cur, months: 10,
      target: round(p.travel[cur], cur), why: `You spent ${money(p.travel[cur], cur)} on travel in the last 12 months. Put a little aside each month instead of paying it in one go.` })
  }
  // Home in India, if there's no home loan or home goal
  if (!has('home') && !p.loans.some(l => (l.type ?? 'home_loan') === 'home_loan')) {
    out.push({ id: 'home', kind: 'home', name: 'Home in India — down payment', currency: 'INR', months: 60, target: 2000000,
      why: 'A 20% down payment keeps the loan and the EMI smaller. Change it to the price you have in mind.' })
  }
  // A loan ending soon frees its EMI
  for (const l of p.loans.filter(l => l.monthsLeft != null && l.monthsLeft > 0 && l.monthsLeft <= 12 && l.emi > 0)) {
    const cur: Cur = l.currency === 'AED' ? 'AED' : 'INR'
    out.push({ id: `loan-${l.name}`, kind: (l.type === 'car_loan' ? 'car' : 'other'), name: l.type === 'car_loan' ? 'Next car — without a loan' : `After ${l.name}`, currency: cur, months: (l.monthsLeft ?? 0) + 36,
      target: round(l.emi * 36, cur), why: `${l.name} ends around ${monthName(p.today, l.monthsLeft ?? 0)}. Keep paying the same ${money(l.emi, cur)} a month — into this goal.` })
  }
  // Idle cash beyond a 6-month cushion
  for (const cur of ['AED', 'INR'] as Cur[]) {
    const e = p.monthly[cur].essentials, idle = p.cash[cur] - e * 6
    if (e > 0 && idle > e * 2) out.push({ id: `idle-${cur}`, kind: 'other', name: 'Grow my spare cash', currency: cur, months: 84, target: round(idle * 2, cur),
      why: `About ${money(idle, cur)} sits in the bank beyond a 6-month cushion. Giving it a long-term goal (and investing it) puts it to work.` })
  }
  return out
}

// Starter templates for every goal type (amounts are examples to edit)
export const TEMPLATES: { kind: Kind; name: string; INR: [number, number]; AED: [number, number] }[] = [
  { kind: 'emergency', name: 'Emergency fund', INR: [300000, 12], AED: [30000, 12] },
  { kind: 'travel', name: 'Trip home', INR: [150000, 10], AED: [8000, 10] },
  { kind: 'purchase', name: 'New phone or laptop', INR: [120000, 9], AED: [5000, 9] },
  { kind: 'car', name: 'New car', INR: [1000000, 36], AED: [80000, 36] },
  { kind: 'wedding', name: 'Wedding', INR: [1500000, 36], AED: [60000, 36] },
  { kind: 'home', name: 'Home down payment', INR: [2000000, 60], AED: [150000, 60] },
  { kind: 'education', name: "Child's education", INR: [2500000, 180], AED: [200000, 180] },
  { kind: 'health', name: 'Health fund', INR: [500000, 24], AED: [20000, 24] },
  { kind: 'family', name: 'Support for parents', INR: [600000, 36], AED: [25000, 36] },
  { kind: 'business', name: 'Start a business', INR: [1500000, 60], AED: [100000, 60] },
  { kind: 'retirement', name: 'Retire in India', INR: [30000000, 240], AED: [2000000, 240] },
  { kind: 'other', name: 'My goal', INR: [500000, 24], AED: [20000, 24] },
]
export const kindColor = (k: Kind) => kindInfo(k).color
export { KINDS }
