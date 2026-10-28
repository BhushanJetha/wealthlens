// Loan maths for the "loan on a card" form: give any three of amount, rate,
// months and EMI and it works out the fourth. Banks quote card loans either
// as a reducing rate (interest on what's still owed) or a flat rate (interest
// on the full amount for the whole term — much dearer than it sounds), so
// both are handled; a flat rate is also shown as its reducing equivalent.

// EMI for a reducing-balance loan (yearly rate %)
export function emiReducing(principal: number, ratePct: number, months: number): number {
  if (!(principal > 0) || !(months > 0)) return 0
  const r = ratePct / 1200
  return r > 0 ? principal * r * Math.pow(1 + r, months) / (Math.pow(1 + r, months) - 1) : principal / months
}
// EMI for a flat-rate loan: interest on the full amount for every year of the term
export function emiFlat(principal: number, flatPct: number, months: number): number {
  if (!(principal > 0) || !(months > 0)) return 0
  return (principal + principal * flatPct / 100 * months / 12) / months
}
// The reducing rate that gives this EMI (what a flat rate really costs)
export function rateFromEmi(principal: number, emi: number, months: number): number | null {
  if (!(principal > 0) || !(months > 0) || !(emi > 0)) return null
  if (emi * months < principal - 0.5) return null                  // doesn't even repay the amount
  if (Math.abs(emi * months - principal) < 0.5) return 0
  let lo = 0, hi = 200
  for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (emiReducing(principal, mid, months) > emi) hi = mid; else lo = mid }
  return Math.round((lo + hi) / 2 * 100) / 100
}
export const flatToReducing = (flatPct: number, months: number) => rateFromEmi(100000, emiFlat(100000, flatPct, months), months)
// Months to repay at this EMI (null if the EMI doesn't cover the interest)
export function monthsFor(principal: number, ratePct: number, emi: number): number | null {
  const r = ratePct / 1200
  if (!(principal > 0) || !(emi > 0)) return null
  if (r === 0) return Math.ceil(principal / emi)
  if (emi <= principal * r) return null
  // (a whisker of slack so an EMI rounded to the paisa doesn't add a month)
  return Math.ceil(-Math.log(1 - principal * r / emi) / Math.log(1 + r) - 0.01)
}
// Still owed after `paid` EMIs (reducing balance at the given rate)
export function balanceAfter(principal: number, ratePct: number, emi: number, paid: number): number {
  const r = ratePct / 1200
  if (paid <= 0) return principal
  const b = r > 0 ? principal * Math.pow(1 + r, paid) - emi * (Math.pow(1 + r, paid) - 1) / r : principal - emi * paid
  return Math.max(0, Math.round(b * 100) / 100)
}

// Fill in whichever of rate / months / EMI is missing
export interface LoanTerms { principal: number; ratePct: number | null; flat: boolean; months: number | null; emi: number | null }
export function solveLoan(t: LoanTerms): { emi: number; months: number; ratePct: number; reducingPct: number; totalInterest: number } | null {
  const P = t.principal
  if (!(P > 0)) return null
  let { ratePct, months, emi } = t
  if (emi == null && ratePct != null && months) emi = t.flat ? emiFlat(P, ratePct, months) : emiReducing(P, ratePct, months)
  else if (months == null && ratePct != null && emi) {
    if (t.flat) { const m = (P / emi) / (1 - (ratePct / 100 / 12) * (P / emi)); months = m > 0 ? Math.ceil(m) : null }
    else months = monthsFor(P, ratePct, emi)
  } else if (ratePct == null && months && emi) {
    const red = rateFromEmi(P, emi, months)
    if (red == null) return null
    ratePct = t.flat ? Math.round(((emi * months - P) / P) / (months / 12) * 10000) / 100 : red
  }
  if (emi == null || !months || ratePct == null) return null
  const reducingPct = t.flat ? rateFromEmi(P, emi, months) ?? ratePct : ratePct
  return { emi: Math.round(emi * 100) / 100, months, ratePct, reducingPct, totalInterest: Math.max(0, Math.round(emi * months - P)) }
}
