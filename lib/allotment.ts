// SIP units, made exact. A SIP is first recorded on its day with units
// estimated at the latest NAV (migration 050: investment_transactions.estimated).
// The fund house allots units at the NAV of the day the money reaches it —
// often a day or two after the SIP date (the 6th, 7th or 8th), the next working
// day after a holiday — less 0.005% stamp duty. Once you say which day that
// was, the units are worked out from that day's NAV (or you type them from
// your statement), and the fund's units move by the difference.
export const STAMP_DUTY = 0.00005

export const unitsAt = (amount: number, nav: number) => nav > 0 ? Math.round(amount * (1 - STAMP_DUTY) / nav * 1000) / 1000 : 0

// Insert an investment history row marked estimated, or plain before 050
export async function insertEstimated(supabase: any, row: Record<string, any>, select = false): Promise<{ data: any; error: any }> {
  const run = (r: Record<string, any>) => { const q = supabase.from('investment_transactions').insert(r); return select ? q.select('id').single() : q }
  const res = await run({ ...row, estimated: true })
  if (res.error && /estimated/.test(res.error.message ?? '')) return run(row)
  return res
}

export async function confirmAllotment(supabase: any, txn: any, fund: any, got: { date: string; nav?: number; units?: number }): Promise<string | null> {
  const amount = Number(txn.amount) || 0
  const units = got.units && got.units > 0 ? got.units : got.nav && got.nav > 0 ? unitsAt(amount, got.nav) : 0
  if (!(units > 0)) return 'Enter the allotment day’s NAV or the units from your statement.'
  const nav = got.nav && got.nav > 0 ? got.nav : amount / units
  const was = Number(txn.units) || 0
  const { error } = await supabase.from('investment_transactions').update({ units, nav, txn_date: got.date, estimated: false }).eq('id', txn.id)
  if (error) return /estimated/.test(error.message ?? '') ? 'Confirming units needs migration 050 (supabase/migrations/050_allotment_paymonth.sql). Run it in Supabase, then try again.' : error.message
  const { data: f } = await supabase.from('mutual_funds').select('units').eq('id', fund.id).maybeSingle()
  await supabase.from('mutual_funds').update({ units: Math.max(0, (Number(f?.units ?? fund.units) || 0) + units - was) }).eq('id', fund.id)
  // The payment that recorded it keeps the right units, so undoing it takes off the right amount
  for (const col of ['auto_ref', 'link_ref']) {
    const { data: rows } = await supabase.from('transactions').select(`id,${col}`).eq(`${col}->>inv_txn_id`, txn.id)
    for (const r of rows ?? []) await supabase.from('transactions').update({ [col]: { ...r[col], units, nav } }).eq('id', r.id)
  }
  return null
}
