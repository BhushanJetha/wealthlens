'use client'
import { useMemo, useState } from 'react'
import { useViewStore } from '@/store/viewStore'
import { buildGoals } from '@/lib/goalsView'
import { declaredIncome } from '@/lib/incomePlans'
import { foundRegular } from '@/lib/regular'
import { monthPlan } from '@/lib/plan'
import type { Cur } from '@/lib/goals'
import type { PlanData } from '@/lib/planData'

// One currency at a time (dirhams and rupees are planned apart): the view picks
// it; in the All view, a switch does
export function usePlanModel(data: PlanData) {
  const { view } = useViewStore()
  const today = data.today
  const has = (c: Cur) => data.goals.some(g => g.currency === c) || data.recurring.some(r => r.currency === c) || data.accounts.some(a => a.currency === c)
  const [picked, setPicked] = useState<Cur | null>(null)
  const cur: Cur = view === 'uae' ? 'AED' : view === 'india' ? 'INR' : picked ?? (has('INR') ? 'INR' : 'AED')
  const built = useMemo(() => buildGoals(data, today), [data, today])
  const found = useMemo(() => foundRegular(data.transactions, data.recurring, today, data.answers, data.bills), [data, today])
  const declared = useMemo(() => declaredIncome(data.plans, cur === 'AED' ? 'uae' : 'india', data.fx, data.transactions), [data, cur])
  const plan = useMemo(() => monthPlan({ cur, today, items: built.items, monthly: built.monthly, declared, budgets: data.budgets, txns: data.transactions,
    recurring: data.recurring, bills: data.bills, found, loans: data.loans }), [cur, today, built, declared, data, found])
  return { cur, setCur: setPicked, showSwitch: view === 'consolidated' && has('INR') && has('AED'), today, built, found, plan }
}
