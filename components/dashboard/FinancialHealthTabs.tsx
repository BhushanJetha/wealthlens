'use client'
import { PageHeader, Segmented } from '@/components/ui/kit'
import { useState } from 'react'
import { Route, HeartPulse } from 'lucide-react'

// Financial Health = the personal Freedom Check (stage, checklist, plan) plus
// the original Health Score & learning page.
export default function FinancialHealthTabs({ check, score }: { check: React.ReactNode; score: React.ReactNode }) {
  const [tab, setTab] = useState<'check' | 'score'>('check')
  const TABS = [
    { key: 'check' as const, label: 'Freedom Check', icon: Route },
    { key: 'score' as const, label: 'Health Score', icon: HeartPulse },
  ]
  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader title="Financial health" sub="Where you stand today, and the next steps to financial freedom" />
      <div className="overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
        <Segmented violet label="Financial health views" value={tab} onChange={setTab}
          options={TABS.map(t => ({ value: t.key, label: t.label }))} />
      </div>
      {tab === 'check' ? check : score}
    </div>
  )
}
