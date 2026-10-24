// Financial health score (0–100) for Home — four equally weighted pillars from
// the design: savings rate, emergency fund, debt-to-income, insurance cover.

export type Tone = 'good' | 'warn' | 'bad' | 'none'
export interface HealthPart { label: string; value: string; tone: Tone }

export interface HealthInput {
  savingsRate: number | null      // % of income saved (3-month average)
  runwayMonths: number | null     // bank & cash ÷ average monthly spend
  monthlyEmi: number              // all loan EMIs, view currency
  monthlyIncome: number           // average monthly income, view currency
  termCover: number               // term-life sum assured, view currency
}

const clamp = (x: number) => Math.max(0, Math.min(1, x))

export function healthScore(i: HealthInput): { score: number; parts: HealthPart[] } {
  const parts: HealthPart[] = []
  let pts = 0

  // Savings: 20% of income or more earns the full 25
  if (i.savingsRate != null) {
    pts += clamp(i.savingsRate / 20) * 25
    parts.push({ label: 'Savings rate', value: `${i.savingsRate}%`, tone: i.savingsRate >= 20 ? 'good' : i.savingsRate >= 10 ? 'warn' : 'bad' })
  } else parts.push({ label: 'Savings rate', value: '—', tone: 'none' })

  // Emergency fund: 6 months of spending in bank & cash
  if (i.runwayMonths != null) {
    pts += clamp(i.runwayMonths / 6) * 25
    parts.push({ label: 'Emergency fund', value: `${i.runwayMonths} / 6 mo`, tone: i.runwayMonths >= 6 ? 'good' : i.runwayMonths >= 3 ? 'warn' : 'bad' })
  } else parts.push({ label: 'Emergency fund', value: '—', tone: 'none' })

  // Debt-to-income: EMIs under 20% of income is ideal, over 50% scores nothing
  if (i.monthlyIncome > 0) {
    const dti = Math.round(i.monthlyEmi / i.monthlyIncome * 100)
    pts += dti <= 20 ? 25 : dti <= 36 ? 25 - (dti - 20) / 16 * 10 : dti <= 50 ? 15 - (dti - 36) / 14 * 10 : 0
    parts.push({ label: 'Debt-to-income', value: `${dti}%`, tone: dti <= 20 ? 'good' : dti <= 36 ? 'warn' : 'bad' })
  } else {
    pts += i.monthlyEmi > 0 ? 0 : 25
    parts.push({ label: 'Debt-to-income', value: i.monthlyEmi > 0 ? '—' : 'No EMIs', tone: i.monthlyEmi > 0 ? 'none' : 'good' })
  }

  // Protection: term cover of 10× annual income
  if (i.monthlyIncome > 0) {
    const need = i.monthlyIncome * 12 * 10
    const ratio = i.termCover / need
    pts += clamp(ratio) * 25
    parts.push({
      label: 'Insurance cover',
      value: ratio >= 1 ? 'Covered' : i.termCover <= 0 ? 'None' : `${(i.termCover / (i.monthlyIncome * 12)).toFixed(1)}× income`,
      tone: ratio >= 1 ? 'good' : ratio >= 0.5 ? 'warn' : 'bad',
    })
  } else parts.push({ label: 'Insurance cover', value: i.termCover > 0 ? 'Added' : '—', tone: 'none' })

  return { score: Math.round(pts), parts }
}
