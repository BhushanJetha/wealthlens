// Smart algorithm for matching investments to goals based on type + time horizon

const BASE_SCORES: Record<string, Record<string, number>> = {
  equity:       { stocks: 85, mutual_funds: 75, etf_investments: 70 },
  mutual_fund:  { mutual_funds: 90, etf_investments: 60 },
  fixed_income: { fixed_deposits: 85, recurring_deposits: 75, bond_investments: 80 },
  gold:         { gold_investments: 90 },
  retirement:   { nps_accounts: 90, lic_policies: 80 },
  emergency:    { fixed_deposits: 85, recurring_deposits: 75 },
  real_estate:  {},
  general: {
    stocks: 55, mutual_funds: 60, etf_investments: 55,
    fixed_deposits: 50, recurring_deposits: 45, bond_investments: 50,
    gold_investments: 40, nps_accounts: 50, lic_policies: 40,
  },
}

export function scoreInvestmentForGoal(
  type: string,
  record: any,
  category: string,
  monthsLeft: number
): number {
  let score = BASE_SCORES[category]?.[type] ?? 0

  const ft = (record.fund_type ?? '').toLowerCase()
  const et = (record.etf_type  ?? '').toLowerCase()

  if (monthsLeft <= 12) {
    // Short-term: penalise volatile, reward liquid/stable
    if (type === 'stocks')          score = Math.max(0, score - 30)
    if (type === 'etf_investments') score = Math.max(0, score - 15)
    if (type === 'mutual_funds') {
      if (['liquid', 'debt'].includes(ft))    score += 20
      if (['equity', 'elss'].includes(ft))    score = Math.max(0, score - 20)
    }
    if (type === 'fixed_deposits') {
      score += 15
      if (record.maturity_date) {
        const fdM = Math.ceil((new Date(record.maturity_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30))
        if (fdM > 0 && fdM <= monthsLeft + 2) score += 15  // matures near goal
      }
    }
    if (type === 'recurring_deposits') score += 10
  } else if (monthsLeft <= 36) {
    // Mid-term: balanced
    if (type === 'mutual_funds') {
      if (['hybrid', 'balanced'].includes(ft)) score += 15
      if (['equity', 'index'].includes(ft))    score += 10
    }
    if (type === 'etf_investments') score += 10
    if (type === 'fixed_deposits')  score += 5
  } else {
    // Long-term (3yr+): growth assets win
    if (type === 'stocks')      score += 20
    if (type === 'nps_accounts') score += 25
    if (type === 'mutual_funds') {
      if (['equity', 'elss', 'index'].includes(ft)) score += 20
      if (['liquid', 'debt'].includes(ft))           score = Math.max(0, score - 15)
    }
    if (type === 'etf_investments' && ['equity', 'index'].includes(et)) score += 15
    if (type === 'fixed_deposits') score = Math.max(0, score - 10)
  }

  // Category-specific cross-type bonuses
  if (category === 'gold') {
    if (type === 'mutual_funds'    && ft === 'gold') score += 20
    if (type === 'etf_investments' && et === 'gold') score += 20
  }
  if (category === 'equity') {
    if (type === 'mutual_funds'    && ['equity', 'elss', 'index'].includes(ft)) score += 15
    if (type === 'etf_investments' && et === 'equity') score += 15
  }

  return Math.min(100, Math.max(0, score))
}

export function getMatchLabel(score: number): { label: string; color: string; bg: string } | null {
  if (score >= 80) return { label: '⭐ Best Match',  color: 'var(--income)', bg: 'var(--income-bg)' }
  if (score >= 60) return { label: '✓ Good Match',   color: 'var(--blue)',   bg: 'var(--blue-bg)'   }
  if (score >= 40) return { label: '~ Fair Match',   color: 'var(--gold)',   bg: 'var(--gold-bg)'   }
  return null
}

// Returns true if investment should be auto-linked (smart threshold)
export function shouldAutoLink(
  type: string,
  record: any,
  category: string,
  monthsLeft: number
): boolean {
  return scoreInvestmentForGoal(type, record, category, monthsLeft) >= 50
}
