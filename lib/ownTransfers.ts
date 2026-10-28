// Moves between your own accounts, sorted by themselves: when a statement
// shows money leaving one of your accounts as a plain transfer and the same
// amount arriving in another of yours within 3 days, both rows are marked as
// one move (lib/money pairOwnTransfers) — not spending, not income. The
// outgoing row points at the other account, so balances update once.
import { pairOwnTransfers } from './money'

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
  return n
}
