// Festivals and occasions that come round every year — templates for
// recurring goals. Diwali (and Dhanteras, two days before) follow the Hindu
// calendar, so their dates are listed per year; fixed dates repeat; the rest
// (moon-based or personal) ask for the date. Dates are shown as editable.
import type { Kind, Cur } from './goals'

// Lakshmi Puja dates (they move each year)
export const DIWALI: Record<number, string> = {
  2025: '2025-10-20', 2026: '2026-11-08', 2027: '2027-10-29', 2028: '2028-10-17', 2029: '2029-11-05', 2030: '2030-10-26',
}
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10)

export interface Occasion {
  key: string; name: string; icon: string; kind: Kind; category: string; priority: number
  amount: Record<Cur, number>
  hint: string                                   // when it is, in words
  next: (after: string) => string | null         // next date on/after `after` (null = ask)
}
const fixed = (mmdd: string) => (after: string) => {
  const y = Number(after.slice(0, 4))
  return `${y}-${mmdd}` >= after ? `${y}-${mmdd}` : `${y + 1}-${mmdd}`
}
const fromTable = (offset = 0) => (after: string) =>
  Object.values(DIWALI).map(d => addDays(d, offset)).sort().find(d => d >= after) ?? null

export const OCCASIONS: Occasion[] = [
  { key: 'diwali', name: 'Diwali shopping & gifts', icon: '🪔', kind: 'celebration', category: 'Shopping', priority: 2, amount: { INR: 50000, AED: 3000 }, hint: 'Oct–Nov', next: fromTable() },
  { key: 'dhanteras', name: 'Gold on Dhanteras', icon: '🪙', kind: 'gold', category: 'Investment', priority: 3, amount: { INR: 50000, AED: 2500 }, hint: 'two days before Diwali', next: fromTable(-2) },
  { key: 'onam', name: 'Onam', icon: '🌼', kind: 'celebration', category: 'Shopping', priority: 2, amount: { INR: 30000, AED: 1500 }, hint: 'Aug–Sep — pick this year’s date', next: () => null },
  { key: 'raksha', name: 'Raksha Bandhan gifts', icon: '🧵', kind: 'celebration', category: 'Gifts', priority: 3, amount: { INR: 10000, AED: 500 }, hint: 'August — pick the date', next: () => null },
  { key: 'eid', name: 'Eid', icon: '🌙', kind: 'celebration', category: 'Shopping', priority: 2, amount: { INR: 20000, AED: 1500 }, hint: 'follows the moon — pick the date', next: () => null },
  { key: 'christmas', name: 'Christmas', icon: '🎄', kind: 'celebration', category: 'Shopping', priority: 2, amount: { INR: 20000, AED: 1500 }, hint: '25 December', next: fixed('12-25') },
  { key: 'new_year', name: 'New Year’s Eve', icon: '🎆', kind: 'celebration', category: 'Entertainment', priority: 3, amount: { INR: 15000, AED: 1000 }, hint: '31 December', next: fixed('12-31') },
  { key: 'birthday', name: 'Birthday party', icon: '🎂', kind: 'celebration', category: 'Entertainment', priority: 2, amount: { INR: 25000, AED: 1500 }, hint: 'pick the birthday', next: () => null },
  { key: 'anniversary', name: 'Anniversary', icon: '💐', kind: 'celebration', category: 'Entertainment', priority: 3, amount: { INR: 20000, AED: 1000 }, hint: 'pick the date', next: () => null },
  { key: 'school_fees', name: 'School fees', icon: '🎒', kind: 'payment', category: 'Education', priority: 1, amount: { INR: 100000, AED: 15000 }, hint: 'when the term fee is due', next: () => null },
  { key: 'lic', name: 'LIC / insurance premium', icon: '🛡️', kind: 'payment', category: 'Insurance', priority: 1, amount: { INR: 30000, AED: 1500 }, hint: 'the premium due date', next: () => null },
  { key: 'car_renewal', name: 'Car insurance & registration', icon: '🚗', kind: 'payment', category: 'Transport', priority: 1, amount: { INR: 25000, AED: 3000 }, hint: 'the renewal date', next: () => null },
  { key: 'trip_home', name: 'Trip home every year', icon: '✈️', kind: 'travel', category: 'Travel', priority: 2, amount: { INR: 150000, AED: 8000 }, hint: 'when you usually fly', next: () => null },
]
export const occasionOf = (key?: string | null) => OCCASIONS.find(o => o.key === key)

// The date after this one for a recurring goal: the occasion's own next date
// (Diwali moves) or the same day `repeat` months later
export function nextDueDate(g: { target_date: string; repeat_months?: number | null; occasion?: string | null }): string {
  const after = addDays(String(g.target_date).slice(0, 10), 1)
  const fromOcc = occasionOf(g.occasion)?.next(after)
  if (fromOcc) return fromOcc
  const [y, m, d] = String(g.target_date).slice(0, 10).split('-').map(Number)
  const months = Number(g.repeat_months) || 12
  const dt = new Date(Date.UTC(y, m - 1 + months, 1))
  const dim = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate()
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(d, dim)).padStart(2, '0')}`
}
