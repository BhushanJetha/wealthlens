// Moves between your own accounts, sorted by themselves: when a statement
// shows money leaving one of your accounts as a plain transfer and the same
// amount arriving in another of yours within 3 days, both rows are marked as
// one move (lib/money pairOwnTransfers) — not spending, not income. The
// outgoing row points at the other account, so balances update once.
//
// The arriving side of a move you've already marked (UAE → India, NRE → NRO,
// to your other account) is labelled too: a statement saves it as plain
// "Other" income, which would count the same money twice.
import { pairOwnTransfers, pairRemittances, ownCredits, isNreToNro } from './money'

export async function matchOwnTransfers(supabase: any, txns: any[]): Promise<number> {
  let n = 0
  for (const { out, in: inn } of pairOwnTransfers(txns)) {
    let r = await supabase.from('transactions').update({ sub_category: 'Own', counter_account_id: inn.account_id }).eq('id', out.id)
    // Before migration 026 there's no counter_account_id column
    if (r.error && /counter_account_id/.test(r.error.message)) r = await supabase.from('transactions').update({ sub_category: 'Own' }).eq('id', out.id)
    if (r.error) continue
    await supabase.from('transactions').update({ category: 'Self Transfer' }).eq('id', inn.id)
    out.sub_category = 'Own'; inn.category = 'Self Transfer'
    n++
  }

  const plain = (t: any) => t.txn_type === 'income' && ['Other', 'Transfer', ''].includes(String(t.category ?? '').trim())
  const link = async (out: any, to: string | null) => {
    if (!to || out.counter_account_id || !out.account_id || out.account_id === to) return
    const { error } = await supabase.from('transactions').update({ counter_account_id: to }).eq('id', out.id)
    if (!error) out.counter_account_id = to
  }
  // Money sent home that landed as a plain ₹ credit (rate 15–35 ₹/AED, within a week)
  const landed = new Set<any>()
  for (const r of pairRemittances(txns, 0)) {
    if (r.source !== 'matched' || !r.in || !r.out) continue
    landed.add(r.in)
    if (!plain(r.in)) continue
    const { error } = await supabase.from('transactions').update({ category: 'NRE Received' }).eq('id', r.in.id)
    if (error) continue
    r.in.category = 'NRE Received'
    await link(r.out, r.in.account_id)
    n++
  }
  // NRE → NRO (or to your other account) that landed as a plain credit
  for (const [inn, out] of Array.from(ownCredits(txns.filter(t => !landed.has(t))))) {
    const label = isNreToNro(out) ? 'Received from NRE' : 'Self Transfer'
    const { error } = await supabase.from('transactions').update({ category: label }).eq('id', inn.id)
    if (error) continue
    inn.category = label
    await link(out, inn.account_id)
    n++
  }
  return n
}
