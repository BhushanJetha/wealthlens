import { Sparkles } from 'lucide-react'

export function AIInsightBanner({ utilPct, monthlySpend, sym }: { utilPct: number; monthlySpend: number; sym: string }) {
  const insights = []
  if (utilPct > 30) insights.push(`Credit utilization at ${utilPct}% — above the 30% threshold. Prioritize paying down the highest-utilization card.`)
  if (monthlySpend > 0) insights.push(`This month's spending: ${sym}${Math.round(monthlySpend).toLocaleString('en-IN')}. Check your budget meters below.`)
  if (insights.length === 0) insights.push('Your financials are in good shape. Ask the AI Advisor for personalized optimization tips →')

  return (
    <div className="flex items-start gap-3 bg-[#00C9A7]/6 border border-[#00C9A7]/18 rounded-xl px-4 py-3">
      <Sparkles size={15} className="text-[#00C9A7] flex-shrink-0 mt-0.5" />
      <div className="text-[12px] text-slate-300 leading-relaxed">
        <span className="text-[#00C9A7] font-bold">AI Insight: </span>
        {insights.join(' · ')}
      </div>
    </div>
  )
}
