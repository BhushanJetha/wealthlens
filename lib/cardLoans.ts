// Card balances and card loans, counted once (migration 035).
//
// A loan on a card (cash on card, a purchase turned into EMIs) is a loan:
// it's counted in Loans and holds that much of the card's limit. Some banks
// also show it inside the card's outstanding. For those cards
// (accounts.balance_includes_loans) the loan is taken out of the card's saved
// balance — once, when you say so, and from each statement imported after —
// so the card's balance is only what's billed and nothing counts twice.
import { loansInCardBalance } from './loans'

const MIGRATION = 'Run migration 035 in Supabase first.'
const asOfOf = (a: any) => String(a.balance_as_of ?? a.updated_at ?? a.created_at ?? '').slice(0, 10)

async function cardLoansWithTxns(supabase: any, cardId: string) {
  const { data: loans } = await supabase.from('home_loans').select('*').eq('pay_from_account_id', cardId).eq('loan_type', 'loan_on_card').eq('is_active', true)
  const ids = (loans ?? []).map((l: any) => l.id)
  const { data: lt } = ids.length
    ? await supabase.from('loan_transactions').select('loan_id,kind,txn_date,amount,principal,interest').in('loan_id', ids)
    : { data: [] }
  return { loans: loans ?? [], lt: lt ?? [] }
}

// Answer "does this card's balance include its loans?" — yes takes them out
// of its saved balance (at what they owed on that balance's date), no puts
// them back if they'd been taken out
export async function setCardIncludesLoans(supabase: any, cardId: string, included: boolean): Promise<string | null> {
  const { data: card, error } = await supabase.from('accounts')
    .select('id,outstanding_bal,balance_as_of,updated_at,created_at,balance_includes_loans').eq('id', cardId).single()
  if (error) return /balance_includes_loans/.test(error.message) ? MIGRATION : error.message
  const was = card.balance_includes_loans === true
  const asOf = asOfOf(card)
  let next = Number(card.outstanding_bal) || 0
  if (was !== included) {
    const { loans, lt } = await cardLoansWithTxns(supabase, cardId)
    const inside = loansInCardBalance(cardId, asOf, loans, lt)
    next = included ? Math.max(0, next - inside) : next + inside
  }
  // The balance date stays put (so later transactions still count from it)
  const { error: upErr } = await supabase.from('accounts')
    .update({ balance_includes_loans: included, outstanding_bal: Math.round(next * 100) / 100, ...(asOf ? { balance_as_of: asOf } : {}) }).eq('id', cardId)
  return upErr ? (/balance_includes_loans/.test(upErr.message) ? MIGRATION : upErr.message) : null
}

// A statement's outstanding for a card whose balance includes its loans: the
// card part only (the loans are counted in Loans)
export async function cardPartOfStatement(supabase: any, cardId: string, outstanding: number, date: string): Promise<number> {
  const { data: card, error } = await supabase.from('accounts').select('balance_includes_loans').eq('id', cardId).single()
  if (error || card?.balance_includes_loans !== true) return outstanding
  const { loans, lt } = await cardLoansWithTxns(supabase, cardId)
  return Math.max(0, outstanding - loansInCardBalance(cardId, date, loans, lt))
}

// A loan just added to a card whose balance includes its loans, taken on or
// before that balance's date: it's inside that balance too, so take it out
export async function takeNewLoanOutOfCard(supabase: any, card: any, owedThen: number, taken: string): Promise<void> {
  if (card?.balance_includes_loans !== true || !(owedThen > 0)) return
  const { data: raw } = await supabase.from('accounts').select('outstanding_bal,balance_as_of,updated_at,created_at').eq('id', card.id).single()
  if (!raw || taken > asOfOf(raw)) return
  await supabase.from('accounts').update({ outstanding_bal: Math.max(0, Math.round(((Number(raw.outstanding_bal) || 0) - owedThen) * 100) / 100), balance_as_of: asOfOf(raw) }).eq('id', card.id)
}
