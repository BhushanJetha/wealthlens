// Single source of truth for "money settled into NRO" — the effective India
// income for NRIs (money reaching the account they spend/invest from). Used by
// the Income tab, Income Report, Budgets, Expense Report AND the Transfers tab
// so the "NRO Settled" figure always matches the "UAE Income (NRO)" figure.
// TRUE inflows only — money moving from NRE into NRO (the account spent from).
// Family Transfer / NRO to Family are money going OUT (shown as expenses), and
// Loan Received is a borrowing, so none of those count as income here.
export const NRO_SETTLED_CATS = ['NRE to NRO', 'NRE → NRO', 'NRO Settled']

export function isNroSettled(t: any): boolean {
  return t?.currency === 'INR' && (t?.sub_category === 'Internal' || NRO_SETTLED_CATS.includes(t?.category))
}

// Map a settled transfer into a "UAE Income (NRO)" income row (display only).
export function toNroIncome(t: any) {
  return { ...t, txn_type: 'income', category: 'UAE Income (NRO)', _autoNro: true }
}
