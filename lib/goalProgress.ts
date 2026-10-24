// Goal progress = current value of the investments linked to it. Shared by the
// Goals tab and the Home dashboard.

export function getInvCurrentValue(type: string, rec: any): number {
  if (type === 'stocks') return (rec.quantity ?? 0) * (rec.current_price ?? rec.avg_buy_price ?? 0)
  if (type === 'mutual_funds') return (rec.units ?? 0) * (rec.current_nav ?? rec.avg_nav ?? 0)
  if (type === 'fixed_deposits') return rec.principal ?? 0
  if (type === 'recurring_deposits') {
    const start = new Date(rec.start_date ?? rec.created_at)
    const months = Math.max(0, (new Date().getFullYear() - start.getFullYear()) * 12 + new Date().getMonth() - start.getMonth())
    return months * (rec.monthly_amount ?? 0)
  }
  if (type === 'nps_accounts') return rec.corpus_amount ?? rec.invested_amount ?? 0
  if (type === 'lic_policies') return rec.total_paid ?? 0
  if (type === 'gold_investments') return rec.quantity_grams && rec.current_price_per_gram ? rec.quantity_grams * rec.current_price_per_gram : rec.invested_amount ?? 0
  return rec.invested_amount ?? 0
}

// Current value linked to one goal, converted with `conv` (view/FX aware)
export function goalCurrentValue(
  goalId: string,
  goalInvestments: { goal_id: string; investment_type: string; investment_id: string }[],
  allInvestments: Record<string, any[]>,
  conv: (v: number, cur: string) => number,
): number {
  let total = 0
  goalInvestments.filter(gi => gi.goal_id === goalId).forEach(gi => {
    const rec = (allInvestments[gi.investment_type] ?? []).find((r: any) => r.id === gi.investment_id)
    if (rec) total += conv(getInvCurrentValue(gi.investment_type, rec), rec.currency ?? 'INR')
  })
  return total
}
