// Investor profile: a few questions → how much risk suits you → a target mix
// of equity / debt / gold / cash. The mix is a starting point the user can
// change; every suggestion in the portfolio manager is measured against it.
import type { Cls } from './holdings'

export interface Question { key: string; q: string; why: string; multi?: boolean; options: { value: string; label: string; score?: number }[] }
export const QUESTIONS: Question[] = [
  { key: 'age', q: 'How old are you?', why: 'Younger money has longer to recover from a fall.', options: [
    { value: '25', label: 'Under 30', score: 4 }, { value: '35', label: '30–39', score: 3 }, { value: '45', label: '40–49', score: 2 }, { value: '55', label: '50–59', score: 1 }, { value: '65', label: '60 or more', score: 0 }] },
  { key: 'horizon', q: 'When will you need most of this money?', why: 'Money needed soon shouldn’t ride the stock market.', options: [
    { value: 'lt3', label: 'Within 3 years', score: 0 }, { value: '3to7', label: 'In 3–7 years', score: 2 }, { value: '7to15', label: 'In 7–15 years', score: 3 }, { value: 'gt15', label: '15+ years away', score: 4 }] },
  { key: 'drop', q: 'Your investments fall 20% in three months. You…', why: 'What you’d actually do matters more than what you hope to earn.', options: [
    { value: 'sell_all', label: 'Sell everything to stop the loss', score: 0 }, { value: 'sell_some', label: 'Sell some and wait', score: 1 }, { value: 'hold', label: 'Hold and wait it out', score: 3 }, { value: 'buy', label: 'Invest more while it’s cheap', score: 4 }] },
  { key: 'goal', q: 'What matters most for this money?', why: 'Protecting it and growing it pull in different directions.', options: [
    { value: 'protect', label: 'Keep it safe', score: 0 }, { value: 'steady', label: 'Steady growth, small ups and downs', score: 2 }, { value: 'grow', label: 'Grow it as much as possible', score: 4 }] },
  { key: 'income', q: 'How steady is your income?', why: 'Steady pay lets you take more risk with savings.', options: [
    { value: 'very', label: 'Very steady (large employer, government)', score: 3 }, { value: 'steady', label: 'Steady', score: 2 }, { value: 'variable', label: 'It varies (business, commission, contract)', score: 1 }, { value: 'none', label: 'No regular income now', score: 0 }] },
  { key: 'dependents', q: 'How many people depend on your income?', why: 'More people relying on you means a bigger safety cushion.', options: [
    { value: '0', label: 'No one', score: 3 }, { value: '1-2', label: '1–2', score: 2 }, { value: '3+', label: '3 or more', score: 1 }] },
  { key: 'experience', q: 'How much have you invested before?', why: 'Experience helps you sit through bad years.', options: [
    { value: 'new', label: 'New to it — mostly FDs and savings', score: 0 }, { value: 'some', label: 'Some funds or SIPs', score: 2 }, { value: 'expert', label: 'Years of stocks and funds', score: 3 }] },
  { key: 'return', q: 'Do you plan to move back to India?', why: 'Where you’ll spend the money decides which currency to hold it in.', options: [
    { value: 'soon', label: 'Within 3 years' }, { value: 'later', label: 'In 3–10 years' }, { value: 'no', label: 'Not planned' }, { value: 'india', label: 'I already live in India' }] },
  { key: 'avoid', q: 'Anything you’d rather not invest in?', why: 'Suggestions skip these.', multi: true, options: [
    { value: 'stocks', label: 'Single company shares' }, { value: 'crypto', label: 'Crypto' }, { value: 'global', label: 'Funds outside India' }, { value: 'gold', label: 'Gold' }, { value: 'none', label: 'Nothing' }] },
  { key: 'tax', q: 'Do you have taxable income in India (rent, interest, gains)?', why: 'Decides whether tax-saving investments are worth it for you.', options: [
    { value: 'yes', label: 'Yes, I file returns in India' }, { value: 'no', label: 'No' }, { value: 'unsure', label: 'Not sure' }] },
]
export type Answers = Record<string, string | string[]>
export const answered = (a: Answers | null | undefined) => !!a && QUESTIONS.filter(q => !q.multi).every(q => a[q.key] != null && a[q.key] !== '')

export const PROFILES = [
  { key: 'conservative', label: 'Conservative', blurb: 'Protecting what you have comes first; growth is a bonus.', mix: { equity: 20, debt: 60, gold: 10, cash: 10 } },
  { key: 'cautious', label: 'Moderately conservative', blurb: 'Mostly steady, with some equity for growth.', mix: { equity: 35, debt: 48, gold: 10, cash: 7 } },
  { key: 'balanced', label: 'Balanced', blurb: 'Equal weight to growth and stability.', mix: { equity: 50, debt: 35, gold: 10, cash: 5 } },
  { key: 'growth', label: 'Growth', blurb: 'Mostly equity; you can sit through bad years.', mix: { equity: 65, debt: 22, gold: 8, cash: 5 } },
  { key: 'aggressive', label: 'Aggressive', blurb: 'Long horizon, high tolerance — equity does the work.', mix: { equity: 80, debt: 10, gold: 5, cash: 5 } },
] as const
export type ProfileKey = typeof PROFILES[number]['key']

// Score 0–100 from the scored answers; the horizon and the "20% fall" answer
// count double (they matter most). Equity is capped at 110 − age.
export function riskProfile(a: Answers): { score: number; profile: typeof PROFILES[number]; mix: Record<Cls, number>; notes: string[] } {
  let got = 0, max = 0
  for (const q of QUESTIONS) {
    const scored = q.options.filter(o => o.score != null)
    if (!scored.length || q.multi) continue
    const w = q.key === 'horizon' || q.key === 'drop' ? 2 : 1
    const top = Math.max(...scored.map(o => o.score!))
    const pick = scored.find(o => o.value === a[q.key])
    max += top * w; got += (pick?.score ?? top / 2) * w
  }
  const score = max > 0 ? Math.round(got / max * 100) : 50
  const i = score < 25 ? 0 : score < 42 ? 1 : score < 60 ? 2 : score < 78 ? 3 : 4
  // Someone who'd sell everything in a fall shouldn't be above "cautious"
  const capped = a.drop === 'sell_all' ? Math.min(i, 1) : a.horizon === 'lt3' ? Math.min(i, 1) : i
  const profile = PROFILES[capped]
  const mix: Record<Cls, number> = { ...profile.mix }
  const notes: string[] = []
  const age = Number(a.age)
  if (age > 0 && mix.equity > 110 - age) {
    const cut = mix.equity - (110 - age)
    mix.equity -= cut; mix.debt += cut
    notes.push(`Equity kept to ${mix.equity}% (110 − your age).`)
  }
  if ((a.avoid as string[] | undefined)?.includes('gold') && mix.gold) { mix.debt += mix.gold; mix.gold = 0; notes.push('No gold, as you asked — that share goes to debt.') }
  if (capped !== i) notes.push(a.drop === 'sell_all' ? 'Kept cautious because you’d sell in a fall — a mix you can hold through bad years beats one you abandon.' : 'Kept cautious because you need the money within 3 years.')
  return { score, profile, mix, notes }
}

// The target used everywhere: what the user saved, else what the answers suggest, else Balanced
export function targetMix(saved: any, a: Answers | null | undefined): { mix: Record<Cls, number>; source: 'yours' | 'answers' | 'default' } {
  const t = saved && typeof saved === 'object' ? (saved.mix ?? saved) : null
  if (t && ['equity', 'debt', 'gold', 'cash'].every(k => Number.isFinite(Number(t[k])))) return { mix: { equity: Number(t.equity), debt: Number(t.debt), gold: Number(t.gold), cash: Number(t.cash) }, source: 'yours' }
  if (answered(a)) return { mix: riskProfile(a!).mix, source: 'answers' }
  return { mix: { ...PROFILES[2].mix }, source: 'default' }
}
