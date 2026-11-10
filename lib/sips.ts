// A mutual fund's SIPs — as many as you run (migration 047: mutual_funds.sips,
// a list, with sips_rev counting each change). Each SIP has its own amount,
// day, paying account, auto / review choice and the latest month recorded.
// The fund's older single-SIP fields (has_sip, sip_amount, sip_date…) are kept
// as a summary of the list — the total a month, the earliest day — so the
// screens that only need "how much goes into SIPs" read them as before.
// Before 047, or for a fund never given a list, its single SIP is the list.
export interface Sip {
  id: string; amount: number; day: number
  account_id: string | null; auto: boolean
  last_month: string | null       // latest month recorded or skipped (YYYY-MM)
  active: boolean; note?: string | null
}

export const hasSipList = (f: any) => !!f && 'sips' in f      // migration 047 is in
const legacyOf = (f: any): Sip[] => f?.has_sip && Number(f.sip_amount) > 0
  ? [{ id: 'legacy', amount: Number(f.sip_amount), day: Math.min(28, Math.max(1, Number(f.sip_date) || 5)), account_id: f.sip_account_id ?? null,
      auto: !!f.sip_auto, last_month: f.sip_last_month ?? null, active: true }] : []
// Every SIP the fund has (stopped ones too, with `all`)
export function sipsOf(f: any, all = false): Sip[] {
  const list: Sip[] = Array.isArray(f?.sips) ? f.sips : legacyOf(f)
  return list.filter(s => (all || s.active !== false) && Number(s.amount) > 0)
}
export const monthlySip = (f: any) => sipsOf(f).reduce((a, s) => a + Number(s.amount), 0)

// The fund's single-SIP fields, from the list
export function sipSummary(sips: Sip[]) {
  const on = sips.filter(s => s.active !== false && Number(s.amount) > 0)
  const months = on.map(s => s.last_month)
  return {
    has_sip: on.length > 0,
    sip_amount: on.length ? on.reduce((a, s) => a + Number(s.amount), 0) : null,
    sip_date: on.length ? Math.min(...on.map(s => s.day)) : null,
    sip_auto: on.length > 0 && on.every(s => s.auto),
    sip_account_id: on[0]?.account_id ?? null,
    // The month every SIP has reached (null while any hasn't started)
    sip_last_month: on.length && months.every(Boolean) ? (months as string[]).sort()[0] : null,
  }
}
export const newSipId = () => (globalThis.crypto?.randomUUID?.() ?? `sip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)

// Save a fund's SIP list. Only if no one changed it meanwhile (sips_rev), so
// two tabs never undo each other. Before 047 only one SIP can be kept, in the
// fund's own fields.
export async function saveSips(supabase: any, fund: any, list: Sip[]): Promise<string | null> {
  // The single SIP from before 047 gets an id of its own when it joins a list
  const sips = list.map(s => (s.id === 'legacy' ? { ...s, id: newSipId() } : s))
  const sum = sipSummary(sips)
  if (!hasSipList(fund)) {
    if (sips.filter(s => s.active !== false).length > 1) return 'More than one SIP on a fund needs migration 047 (supabase/migrations/047_multiple_sips.sql). Run it in Supabase, then try again.'
    const { error } = await supabase.from('mutual_funds').update(sum).eq('id', fund.id)
    if (!error) Object.assign(fund, sum)
    return error?.message ?? null
  }
  const rev = Number(fund.sips_rev) || 0
  const { data, error } = await supabase.from('mutual_funds').update({ sips, sips_rev: rev + 1, ...sum }).eq('id', fund.id).eq('sips_rev', rev).select('id')
  if (error) return error.message
  if (!data?.length) return 'This fund’s SIPs were just changed somewhere else. Reload and try again.'
  Object.assign(fund, { sips, sips_rev: rev + 1, ...sum })
  return null
}

// Mark one SIP's month done (recorded, or skipped) — only if it still isn't.
// Reads the fund fresh, so a stale page can't record a month twice.
export async function claimSip(supabase: any, fund: any, sipId: string, month: string): Promise<boolean> {
  if (!hasSipList(fund) || sipId === 'legacy' && !Array.isArray(fund.sips)) {
    let q = supabase.from('mutual_funds').update({ sip_last_month: month }).eq('id', fund.id)
    q = fund.sip_last_month ? q.eq('sip_last_month', fund.sip_last_month) : q.is('sip_last_month', null)
    const { data, error } = await q.select('id')
    if (!error && data?.length) { fund.sip_last_month = month; return true }
    return false
  }
  for (let tries = 0; tries < 3; tries++) {
    const { data: now } = await supabase.from('mutual_funds').select('sips,sips_rev').eq('id', fund.id).maybeSingle()
    if (!now) return false
    Object.assign(fund, now)
    const list: Sip[] = Array.isArray(now.sips) ? now.sips : []
    const s = list.find(x => x.id === sipId)
    if (!s || (s.last_month && s.last_month >= month)) return false
    const err = await saveSips(supabase, fund, list.map(x => (x.id === sipId ? { ...x, last_month: month } : x)))
    if (!err) return true
  }
  return false
}

// Put one SIP's month marker back (a payment that recorded it was deleted),
// only if nothing has moved it on since
export async function unclaimSip(supabase: any, fund: any, sipId: string, month: string, prev: string | null): Promise<void> {
  if (!hasSipList(fund) || !Array.isArray(fund.sips)) {
    await supabase.from('mutual_funds').update({ sip_last_month: prev }).eq('id', fund.id).eq('sip_last_month', month)
    return
  }
  const list: Sip[] = fund.sips
  if (!list.some(x => x.id === sipId && x.last_month === month)) return
  await saveSips(supabase, fund, list.map(x => (x.id === sipId ? { ...x, last_month: prev } : x)))
}

// The SIP a payment of this amount is (within 10%), not yet done for its month
export function sipForPayment(f: any, amount: number, month: string): Sip | null {
  const near = (s: Sip) => Math.abs(amount - Number(s.amount)) <= Number(s.amount) * 0.1
  return sipsOf(f).filter(near).sort((a, b) => Number(!!(a.last_month && a.last_month >= month)) - Number(!!(b.last_month && b.last_month >= month))
    || Math.abs(amount - a.amount) - Math.abs(amount - b.amount))[0] ?? null
}

// Which purchases are SIP instalments. Statements often call an instalment a
// plain "Purchase"; it's a SIP when its amount comes back (within 1%) in 3 or
// more different months, or is within 10% of one of the fund's SIPs.
export function sipInstalments(buys: { date: string; amount: number }[], sipAmounts: number[] = []): (amount: number) => boolean {
  const months = new Map<number, Set<string>>()
  for (const b of buys) {
    const a = Math.round(Number(b.amount) || 0)
    if (a > 0) (months.get(a) ?? months.set(a, new Set()).get(a)!).add(String(b.date).slice(0, 7))
  }
  const repeated: number[] = []
  months.forEach((ms, a) => {
    // Amounts within 1% of each other count together (stamp duty takes a few rupees off)
    let n = 0
    months.forEach((ms2, a2) => { if (Math.abs(a2 - a) <= a * 0.01) n += ms2.size })
    if (n >= 3) repeated.push(a)
  })
  return (amount: number) => repeated.some(c => Math.abs(amount - c) <= c * 0.01) || sipAmounts.some(s => s > 0 && Math.abs(amount - s) <= s * 0.1)
}
