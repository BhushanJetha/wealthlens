// Single source of truth for "what counts as spend" — shared by the Expense
// Report and the Home dashboard so both always show the same totals.

// Money coming in or moving between your own accounts — shown in the report but
// never summed as spend (the same money is counted when it's actually spent).
// Money SENT out (Transfer / International Transfer / Family Transfer) is spend.
export const MOVEMENT_CATS = new Set([
  'NRE Received', 'Received from NRE', 'Received from UAE', 'NRI Transfer',
  'NRE to NRO', 'NRE → NRO', 'NRO Settled', 'NRO to NRE', 'Self Transfer', 'Internal Transfer',
  'Loan Received', 'Loan Taken', 'Loan Disbursement', 'ATM Withdrawal',
])

// Card bill payments settle spend already counted on the card (and loan-on-card
// EMIs likewise), so they're shown but excluded from the total.
export const CC_BILL = 'Credit Card Payment'

export type SpendClass = 'expense' | 'ccbill' | 'excluded'
export const classify = (c: string): SpendClass =>
  c === CC_BILL ? 'ccbill' : (MOVEMENT_CATS.has(c) || c === 'Loan on Card') ? 'excluded' : 'expense'

// Manual transfers are stored as category "Transfer" + a sub_category — split
// them so an own-account NRE → NRO move doesn't land in the money-sent row.
export const TRANSFER_SUB_ROW: Record<string, string> = {
  Internal: 'NRE to NRO', International: 'International Transfer', Family: 'Family Transfer', 'ATM Withdrawal': 'ATM Withdrawal',
}

export const ROW_LABEL: Record<string, string> = {
  Transfer: 'Money Transfer', 'International Transfer': 'Transfer to India', [CC_BILL]: 'Credit Card Bill',
}
export const labelOf = (cat: string) => ROW_LABEL[cat] ?? cat

// Report row a transaction belongs to
export const catOf = (t: any) => {
  const c = (t.category && String(t.category).trim()) || 'Other'
  return c === 'Transfer' && TRANSFER_SUB_ROW[t.sub_category] ? TRANSFER_SUB_ROW[t.sub_category] : c
}

// Transaction types the Expense Report reads spend from
export const SPEND_TXN_TYPES = ['expense', 'transfer', 'loan']

// True when a transaction is counted in "Total Monthly Expenses"
export const isSpend = (t: any) =>
  SPEND_TXN_TYPES.includes(t?.txn_type) && classify(catOf(t)) === 'expense'
