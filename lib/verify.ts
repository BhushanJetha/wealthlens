// "Verified with your app": you compared a fund or share with your broker /
// fund app (units and what you put in) and they matched — or you corrected
// WealthLens to match. The check is saved as a snapshot (migration 049,
// `verified`); while nothing has changed since, it stays verified. Anything
// that moves it — new units, a different amount invested, an old check, a
// fund not matched to its exact scheme, a price not refreshed — asks for a review.
export type VerifyType = 'mutual_funds' | 'stocks' | 'etf_investments'
export interface VerifySnap { units: number; invested: number; at: string; price?: number | null }
export interface VerifyState { state: 'verified' | 'review' | 'never'; at: string | null; reasons: string[] }

export const unitsOf = (type: VerifyType, r: any) => Number(type === 'stocks' ? r.quantity : r.units) || 0
export const investedOf = (type: VerifyType, r: any) => type === 'mutual_funds'
  ? Number(r.invested_amount) || (Number(r.units) || 0) * (Number(r.avg_nav) || 0)
  : unitsOf(type, r) * (Number(r.avg_buy_price) || 0)
export const priceOf = (type: VerifyType, r: any) => type === 'mutual_funds'
  ? Number(r.current_nav) || Number(r.avg_nav) || 0 : Number(r.current_price) || Number(r.avg_buy_price) || 0

const STALE_DAYS = 45
const days = (from: string, to: string) => Math.floor((Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) / 864e5)
const fmtN = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 3 })

export function verifyState(type: VerifyType, r: any, today: string): VerifyState {
  const snap: VerifySnap | null = r?.verified && typeof r.verified === 'object' ? r.verified : null
  const reasons: string[] = []
  const units = unitsOf(type, r), invested = investedOf(type, r)
  if (snap) {
    if (Math.abs(units - Number(snap.units)) > (type === 'mutual_funds' ? 0.001 : 0.0001)) reasons.push(`Units changed since you checked (${fmtN(Number(snap.units))} → ${fmtN(units)})`)
    if (Math.abs(invested - Number(snap.invested)) > Math.max(1, Number(snap.invested) * 0.001)) reasons.push('What you put in changed since you checked')
    const age = days(snap.at, today)
    if (age > STALE_DAYS) reasons.push(`Last checked ${age} days ago`)
  }
  // What the value depends on
  if (type === 'mutual_funds' && !r.scheme_code) reasons.push('Its exact scheme isn’t matched yet, so its NAV may be off')
  const priced = r.last_updated ? days(String(r.last_updated), today) : null
  if (priced != null && priced > 4) reasons.push(`Its ${type === 'mutual_funds' ? 'NAV' : 'price'} was last updated ${priced} days ago`)
  if (!snap) return { state: 'never', at: null, reasons: ['Not checked against your app yet', ...reasons] }
  return { state: reasons.length ? 'review' : 'verified', at: snap.at, reasons }
}

// Save a check. When your app's units / amount invested differ, WealthLens
// takes yours (the average price follows); then the snapshot is saved.
export async function saveVerified(supabase: any, type: VerifyType, r: any, mine: { units: number; invested: number }): Promise<string | null> {
  const units = mine.units, invested = mine.invested
  if (!(units >= 0) || !(invested >= 0)) return 'Enter the units and the amount invested.'
  const fix: Record<string, number> = {}
  if (Math.abs(units - unitsOf(type, r)) > 1e-6 || Math.abs(invested - investedOf(type, r)) > 0.005) {
    if (type === 'mutual_funds') Object.assign(fix, { units, invested_amount: invested, ...(units > 0 ? { avg_nav: invested / units } : {}) })
    else if (type === 'stocks') Object.assign(fix, { quantity: units, ...(units > 0 ? { avg_buy_price: invested / units } : {}) })
    else Object.assign(fix, { units, ...(units > 0 ? { avg_buy_price: invested / units } : {}) })
  }
  const verified: VerifySnap = { units, invested: Math.round(invested * 100) / 100, at: new Date().toISOString(), price: priceOf(type, { ...r, ...fix }) || null }
  const { error } = await supabase.from(type).update({ ...fix, verified }).eq('id', r.id)
  if (error && /verified/.test(error.message ?? '')) return 'Saving a check needs migration 049 (supabase/migrations/049_verified.sql). Run it in Supabase, then try again.'
  return error?.message ?? null
}
