import { Sparkles } from 'lucide-react'

export function AIInsightBanner({ utilPct, monthlySpend, sym }: { utilPct: number; monthlySpend: number; sym: string }) {
  const insights = []
  if (utilPct > 30) insights.push(`Credit utilization at ${utilPct}% — above the 30% threshold. Prioritize paying down the highest-utilization card.`)
  if (monthlySpend > 0) insights.push(`This month's spending: ${sym}${Math.round(monthlySpend).toLocaleString('en-IN')}. Check your budget meters below.`)
  if (insights.length === 0) insights.push('Your financials are in good shape. Ask the AI Advisor for personalized optimization tips →')

  return (
    <div className="flex items-start gap-3 rounded-xl px-4 py-3"
      style={{ background: 'var(--sage-bg)', border: '1px solid var(--sage)', opacity: 0.9 }}>
      <Sparkles size={15} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--sage)' }} />
      <div className="text-[12px] leading-relaxed" style={{ color: 'var(--text2)' }}>
        <span className="font-bold" style={{ color: 'var(--sage)' }}>AI Insight: </span>
        {insights.join(' · ')}
      </div>
    </div>
  )
}
