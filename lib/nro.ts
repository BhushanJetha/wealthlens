// Single source of truth for "money settled into NRO" — the effective India
// income for NRIs (money reaching the account they spend/invest from). Used by
// the Income tab, Income Report, Budgets, Expense Report AND the Transfers tab
// so the "NRO Settled" figure always matches the "UAE Income (NRO)" figure.
export const NRO_SETTLED_CATS = [
  'Loan Received', 'NRO to Family', 'NRE to NRO', 'Self Transfer', 'Family Transfer',
  'NRO Settled', 'NRE → NRO',
]

export function isNroSettled(t: any): boolean {
  return t?.currency === 'INR' && (t?.sub_category === 'Internal' || NRO_SETTLED_CATS.includes(t?.category))
}

// Map a settled transfer into a "UAE Income (NRO)" income row (display only).
export function toNroIncome(t: any) {
  return { ...t, txn_type: 'income', category: 'UAE Income (NRO)', _autoNro: true }
}
