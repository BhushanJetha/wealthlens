'use client'
import { useMemo, useState } from 'react'
import { HandCoins, Lock, Target } from 'lucide-react'
import { fmtMoney } from '@/lib/format'
import { planWithdrawal, WHEN, type When } from '@/lib/portfolio/withdraw'
import type { PHolding, Cur, Cls } from '@/lib/portfolio/holdings'
import { PageHeader, InsightBar, Panel, Segmented } from '@/components/ui/kit'
import AddGoalModal from '@/components/forms/AddGoalModal'

// "I need money" (design v2): say how much, in which currency and by when —
// see where to take it from, cheapest first, what it costs (estimated), what
// stays untouched, and cheaper ways round it. Nothing is sold from here.
export default function NeedMoneyClient({ today, fx, hs, goals, essentials, saving, flagged, overweight, underweight }: {
  today: string; fx: number; hs: PHolding[]; goals: { id: string; name: string }[]
  essentials: Record<Cur, number>; saving: Record<Cur, number>; flagged: string[]; overweight: Cls[]; underweight: Cls[]
}) {
  const home: Cur = essentials.AED * fx >= essentials.INR ? 'AED' : 'INR'
  const [amount, setAmount] = useState('')
  const [cur, setCur] = useState<Cur>(home === 'AED' ? 'AED' : 'INR')
  const [when, setWhen] = useState<When>('month')
  const [purpose, setPurpose] = useState('')
  const [keepEmergency, setKeepEmergency] = useState(true)
  const [protectGoals, setProtectGoals] = useState(true)
  const [goal, setGoal] = useState(false)
  const amt = Number(amount) || 0
  const money = (n: number) => fmtMoney(n, cur)
  const plan = useMemo(() => amt > 0 ? planWithdrawal(hs, { amount: amt, currency: cur, when, keepEmergency, protectGoals }, {
    fx, today, essentials, saving, goalName: id => goals.find(g => g.id === id)?.name ?? 'a goal', flagged, overweight, underweight,
  }) : null, [amt, cur, when, keepEmergency, protectGoals, hs, fx, today, essentials, saving, goals, flagged, overweight, underweight])
  const months = when === 'quarter' ? 3 : when === 'later' ? 6 : 1

  const insight = !plan ? 'Say how much you need and by when — WealthLens shows where to take it from, cheapest first, leaving locked and goal money alone.'
    : plan.shortfall > 0 ? `${money(plan.covered)} of ${money(amt)} can come from your money without touching locked or goal savings — ${money(plan.shortfall)} short. See the other ways below.`
    : `All ${money(amt)} can come from ${plan.steps.length} place${plan.steps.length === 1 ? '' : 's'}, costing about ${money(plan.cost)} in tax and charges (estimated).`

  return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <PageHeader title="I need money" sub="Where to take it from — cheapest first, your emergency fund, goals and locked money left alone" />
      <InsightBar text={insight} prompt={`I need ${amt ? money(amt) : 'some money'} ${WHEN[when].label.toLowerCase()}${purpose ? ` for ${purpose}` : ''}. Plan: ${plan?.steps.map(s => `${s.source} ${money(s.amount)} (${s.costNote})`).join('; ') ?? 'none yet'}. What's the smartest way?`} />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-3.5 md:gap-4 items-start">
        <Panel title={<span className="flex items-center gap-1.5"><HandCoins size={15} style={{ color: 'var(--accent)' }} />What do you need?</span>}>
          <div className="flex flex-col gap-3.5 mt-3">
            <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
              <div className="flex items-center rounded-xl px-3" style={{ background: '#F7F8FA', border: '1px solid #E2E8F0', height: 48 }}>
                <span className="text-[14px] font-semibold mr-2" style={{ color: 'var(--text3)' }}>{cur === 'AED' ? 'AED' : '₹'}</span>
                <input value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="0" autoFocus aria-label="Amount needed"
                  className="flex-1 bg-transparent outline-none text-[20px] font-bold tabular-nums" style={{ color: 'var(--text)' }} />
              </div>
              <Segmented label="Currency" value={cur} onChange={(c: Cur) => setCur(c)} options={[{ value: 'INR', label: '₹ India' }, { value: 'AED', label: 'AED UAE' }]} />
            </div>
            <Segmented label="When" value={when} onChange={setWhen} full options={(Object.keys(WHEN) as When[]).map(w => ({ value: w, label: WHEN[w].label }))} />
            <input value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="What for? (optional) — e.g. car, wedding, a flat deposit" className="wl-input w-full" style={{ height: 42 }} />
            <label className="flex items-start gap-2.5 text-[12.5px] cursor-pointer" style={{ color: 'var(--text2)' }}>
              <input type="checkbox" checked={keepEmergency} onChange={e => setKeepEmergency(e.target.checked)} className="accent-[var(--accent)] w-4 h-4 mt-0.5" />
              <span>Keep my emergency fund <span style={{ color: 'var(--text4)' }}>(6 months of essentials: {fmtMoney(essentials[cur] * 6, cur)})</span></span>
            </label>
            <label className="flex items-start gap-2.5 text-[12.5px] cursor-pointer" style={{ color: 'var(--text2)' }}>
              <input type="checkbox" checked={protectGoals} onChange={e => setProtectGoals(e.target.checked)} className="accent-[var(--accent)] w-4 h-4 mt-0.5" />
              <span>Don’t touch money linked to my goals</span>
            </label>
            <p className="text-[11.5px] leading-snug" style={{ color: 'var(--text4)' }}>Sold first: what’s flagged to switch or trim, then what’s over your target mix, then the cheapest in tax; what’s under target goes last. Jewellery is never sold. Tax is estimated and assumes a holding is over a year old. Nothing is sold from here.</p>
          </div>
        </Panel>

        <div className="flex flex-col gap-3.5 md:gap-4 min-w-0">
          {plan && (
            <Panel title="Where it comes from" right={<span className="text-[12px] tabular-nums" style={{ color: 'var(--text3)' }}>cost ≈ <b style={{ color: 'var(--text)' }}>{money(plan.cost)}</b></span>}>
              <ol className="mt-2">
                {plan.steps.map((s, i) => (
                  <li key={s.key} className="flex gap-3 py-2.5" style={{ borderTop: i ? '1px solid var(--track)' : undefined }}>
                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11.5px] font-bold flex-shrink-0" style={{ background: 'var(--accent-bg)', color: 'var(--accent2)' }}>{i + 1}</span>
                    <span className="flex-1 min-w-0">
                      <span className="flex justify-between gap-3">
                        <span className="text-[13.5px] font-semibold truncate" style={{ color: 'var(--text)' }}>{s.source}</span>
                        <span className="text-[14px] font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--text)' }}>{money(s.amount)}</span>
                      </span>
                      <span className="block text-[11.5px]" style={{ color: 'var(--text3)' }}>{s.detail} · {s.speed}</span>
                      <span className="block text-[11.5px]" style={{ color: s.cost > 0 ? 'var(--amber-text)' : 'var(--pos-text)' }}>{s.cost > 0 ? `≈ ${money(s.cost)} · ` : ''}{s.costNote}</span>
                      {s.warn && <span className="block text-[11.5px] mt-0.5" style={{ color: 'var(--amber-text)' }}>⚠ {s.warn}</span>}
                    </span>
                  </li>
                ))}
                {!plan.steps.length && <li className="text-[12.5px] py-3" style={{ color: 'var(--text3)' }}>Nothing can be used without touching your emergency fund, goals or locked money.</li>}
              </ol>
              <div className="mt-2 rounded-lg px-3 py-2 text-[12.5px] font-semibold" style={{ background: plan.shortfall > 0 ? 'var(--amber-bg)' : 'var(--pos-bg)', color: plan.shortfall > 0 ? 'var(--amber-text)' : 'var(--pos-text)' }}>
                {plan.shortfall > 0 ? `${money(plan.covered)} found · ${money(plan.shortfall)} short` : `✓ All ${money(amt)} covered`}
              </div>
            </Panel>
          )}
          {plan && plan.alternatives.length > 0 && (
            <Panel title="Cheaper ways round it">
              <ul className="mt-2 flex flex-col gap-2">{plan.alternatives.map((a, i) => <li key={i} className="rounded-lg px-3 py-2 text-[12.5px] leading-snug" style={{ background: 'var(--bg2)', color: 'var(--text2)' }}>{a}</li>)}</ul>
              {when !== 'now' && <button onClick={() => setGoal(true)} className="wl-btn mt-3" style={{ height: 36 }}><Target size={14} />Make it a goal instead</button>}
            </Panel>
          )}
          {plan && plan.untouched.length > 0 && (
            <Panel title={<span className="flex items-center gap-1.5"><Lock size={14} style={{ color: 'var(--text3)' }} />Left alone</span>}>
              <ul className="mt-2">{plan.untouched.map(u => (
                <li key={u.label} className="flex justify-between gap-3 py-2 text-[12.5px]" style={{ borderTop: '1px solid var(--track)' }}>
                  <span><span className="block font-semibold" style={{ color: 'var(--text)' }}>{u.label}</span><span className="block text-[11.5px]" style={{ color: 'var(--text3)' }}>{u.why}</span></span>
                  <span className="tabular-nums flex-shrink-0" style={{ color: 'var(--text2)' }}>{money(u.value)}</span>
                </li>))}</ul>
            </Panel>
          )}
          {!plan && (
            <div className="wl-card px-5 py-8 text-center">
              <HandCoins size={28} style={{ color: 'var(--accent)' }} className="mx-auto" />
              <div className="text-[14px] font-semibold mt-2" style={{ color: 'var(--text)' }}>Enter an amount to see the plan</div>
              <div className="text-[12.5px] mt-1" style={{ color: 'var(--text3)' }}>Order: spare cash → deposits maturing in time → liquid and debt funds → investments (losses first, then lowest tax) → breaking an FD.</div>
            </div>
          )}
        </div>
      </div>
      {goal && <AddGoalModal onClose={() => setGoal(false)} defaults={{ name: purpose || 'Planned purchase', kind: 'purchase', target: amt, currency: cur, months }} />}
    </div>
  )
}
