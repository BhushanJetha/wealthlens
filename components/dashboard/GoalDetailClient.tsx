'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Edit2, Link2, Plus, Trophy, Target, BarChart2, Calculator, Layers, Trash2 } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { createClient } from '@/lib/supabase/client'
import { fmtMoney, fmtCompact } from '@/lib/format'
import { localToday, fmtDay } from '@/lib/insights'
import { HORIZON, PRIORITY, kindInfo, tracksCash, pmtFor, monthsToReach } from '@/lib/goals'
import { buildGoals } from '@/lib/goalsView'
import type { GoalsData } from '@/lib/goalsData'
import { InsightBar, AiActions, KpiTile, KpiGrid, Panel } from '@/components/ui/kit'
import AddGoalModal from '@/components/forms/AddGoalModal'
import LinkInvestmentModal from '@/components/forms/LinkInvestmentModal'
import { AddMoneySheet, AchieveSheet } from './GoalSheets'
import { RecurringDetail } from './RecurringGoals'

type TabKey = 'overview' | 'trajectory' | 'calculator' | 'funding'
const TABS: { key: TabKey; label: string; icon: typeof Target }[] = [
  { key: 'overview', label: 'Overview', icon: Target },
  { key: 'trajectory', label: 'Trajectory', icon: BarChart2 },
  { key: 'calculator', label: 'What if', icon: Calculator },
  { key: 'funding', label: 'Funding', icon: Layers },
]
const TYPE_LABELS: Record<string, string> = {
  stocks: 'Stock', mutual_funds: 'Mutual fund', fixed_deposits: 'FD', recurring_deposits: 'RD', nps_accounts: 'NPS',
  lic_policies: 'LIC', gold_investments: 'Gold', bond_investments: 'Bond', etf_investments: 'ETF',
}
const monthLabel = (m: number) => { const d = new Date(); d.setMonth(d.getMonth() + m); return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) }
const dateIn = (m: number) => { const d = new Date(); d.setMonth(d.getMonth() + m); return d.toISOString().slice(0, 10) }

// One goal (design v2), from the shared engine (lib/goals): what it's worth,
// what it'll cost by its date, what it needs a month, where your pace lands
// it, where the money comes from — and the tools to adjust or finish it.
export default function GoalDetailClient({ goalId, data }: { goalId: string; data: GoalsData }) {
  const router = useRouter()
  const [today, setToday] = useState(data.today)
  useEffect(() => { setToday(localToday()) }, [])
  const [tab, setTab] = useState<TabKey>('overview')
  const [sheet, setSheet] = useState<null | 'edit' | 'link' | 'money' | 'achieve'>(null)
  const [simPmt, setSimPmt] = useState(0)
  const [scenario, setScenario] = useState<'cautious' | 'expected' | 'optimistic'>('expected')
  const [shift, setShift] = useState(0)
  const [busy, setBusy] = useState(false)

  const built = useMemo(() => buildGoals(data, today), [data, today])
  const it = built.items.find(x => x.goal.id === goalId)!
  const g = it.goal, v = it.v, p = it.plan, cur = g.currency === 'AED' ? 'AED' : 'INR'
  const info = kindInfo(it.kind), H = HORIZON[p.horizon]
  const money = (n: number) => fmtMoney(n, cur), short = (n: number) => fmtCompact(n, cur)
  const achieved = p.status === 'achieved'
  const contributions = data.contributions.filter(c => c.goal_id === g.id)
  const links = data.links.filter(l => l.goal_id === g.id)
  const account = g.account_id ? data.accounts.find(a => a.id === g.account_id) : null
  const rate = scenario === 'cautious' ? Math.max(p.ret - 3, 0) : scenario === 'optimistic' ? p.ret + 3 : p.ret
  const eqPct = v.value > 0 ? v.equity / v.value * 100 : 0
  const goldPct = v.value > 0 ? v.gold / v.value * 100 : 0

  // Trajectory: needed path, your pace (three return scenarios), with the needed amount
  const points = useMemo(() => {
    const n = Math.max(p.months, 6), step = Math.max(1, Math.ceil(n / 24)), out: any[] = []
    const grow = (pmt: number, r: number, m: number) => v.value * Math.pow(1 + r / 1200, m) + (r > 0 ? pmt * (Math.pow(1 + r / 1200, m) - 1) / (r / 1200) : pmt * m)
    const targetAt = (m: number) => Number(g.target_amount) * Math.pow(1 + p.inflation / 100, m / 12)
    for (let m = 0; m <= n; m += step) out.push({
      label: monthLabel(m), target: Math.round(targetAt(Math.min(m, p.months))),
      cautious: Math.round(grow(it.pace, Math.max(p.ret - 3, 0), m)), expected: Math.round(grow(it.pace, p.ret, m)), optimistic: Math.round(grow(it.pace, p.ret + 3, m)),
      needed: Math.round(grow(p.need, p.ret, m)),
    })
    return out
  }, [p, v.value, it.pace, g.target_amount])
  // Diwali, premiums, gold…: a pot for the next date, with its own page
  if (it.rec) return <RecurringDetail it={it} data={data} today={today} />

  // What if: a monthly amount → when it's reached; a different date → what it needs
  const simMonths = simPmt > 0 ? monthsToReach(Number(g.target_amount), v.value, simPmt, rate, p.inflation) : null
  const shifted = Math.max(1, p.months + shift)
  const shiftedTarget = Number(g.target_amount) * Math.pow(1 + p.inflation / 100, shifted / 12)
  const shiftedNeed = pmtFor(shiftedTarget, v.value, rate / 1200, shifted)
  const needAtRate = pmtFor(p.futureTarget, v.value, rate / 1200, p.months)
  const lumpToday = p.months > 0 ? Math.max(0, p.futureTarget / Math.pow(1 + rate / 1200, p.months) - v.value) : Math.max(0, p.futureTarget - v.value)

  async function moveDate() {
    setBusy(true)
    await createClient().from('goals').update({ target_date: dateIn(shifted) }).eq('id', g.id)
    setBusy(false); setShift(0); router.refresh()
  }
  async function deleteContribution(id: string) {
    await createClient().from('goal_contributions').delete().eq('id', id)
    router.refresh()
  }
  async function resume() { await createClient().from('goals').update({ status: 'active' }).eq('id', g.id); router.refresh() }

  const suggestions: string[] = []
  if (p.status === 'new') suggestions.push(`Start it: link a fund or account, or add money. ${money(p.need)} a month gets you there.`)
  if (p.status === 'behind') suggestions.push(`At ${short(it.pace)} a month you'd reach about ${short(p.projected)} by ${fmtDay(g.target_date)} — ${short(-p.gap)} short. Add ${short(Math.max(0, p.need - it.pace))} a month${p.reachAt != null && it.pace > 0 ? `, or move the date to ${monthLabel(p.reachAt)}` : ''}.`)
  if (p.status === 'on_track') suggestions.push(`On track: at ${short(it.pace)} a month you'd have about ${short(p.projected)} by the date${p.gap > 0 ? ` — ${short(p.gap)} more than needed` : ''}.`)
  if (v.value > 0 && eqPct > p.maxEquity + 15) suggestions.push(`${Math.round(eqPct)}% is in equity with ${p.months} months to go. Keep it under ~${p.maxEquity}% for a ${H.label.toLowerCase()} goal — move some to FDs or debt funds.`)
  if (v.value > 0 && p.months > 84 && eqPct < 20) suggestions.push(`Almost all of it is in steady options. With ${Math.round(p.months / 12)} years to go, an equity SIP could do more of the work.`)
  if (p.months > 24 && !achieved) suggestions.push(`From ${monthLabel(p.months - 24)}, start moving it to safer options so a market fall near the date can't hurt it.`)
  if (it.kind === 'emergency' && !tracksCash(g)) suggestions.push('Turn on “Count my bank & cash balances” (Edit) so this fills itself from your accounts.')
  if (p.inflation > 0) suggestions.push(`The target is ${money(Number(g.target_amount))} in today's money — about ${money(p.futureTarget)} by then with prices rising ${p.inflation}% a year.`)

  const ctx = `Goal "${g.name}" (${info.label}, ${H.label}, ${PRIORITY[Number(g.priority ?? 2)]}): ${money(v.value)} saved of ${money(p.futureTarget)} by ${g.target_date} (${money(Number(g.target_amount))} in today's money, ${p.inflation}% inflation). Needs ${money(p.need)}/month at an assumed ${p.ret}%; pace ${money(it.pace)}/month; ${Math.round(eqPct)}% equity.`
  const insight = achieved ? `You reached ${g.name}. Mark it achieved to free its investments for your next goal.`
    : p.months <= 0 ? `The date has passed with ${money(Math.max(0, p.futureTarget - v.value))} still to go. Pick a new date (What if) or a smaller target.`
    : `${Math.round(p.pct)}% there. About ${money(p.need)} a month closes the gap by ${fmtDay(g.target_date)} ${g.target_date.slice(0, 4)}, assuming ${p.ret}% a year (${money(p.needRange.optimistic)}–${money(p.needRange.cautious)} if returns differ by 3%).`

  return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <Link href="/dashboard/goals" className="flex items-center gap-1 text-[12px] font-medium self-start" style={{ color: 'var(--text3)' }}><ChevronLeft size={14} />Goals</Link>

      {/* Header */}
      <section className="wl-card px-4 md:px-6 py-4 md:py-5" style={{ background: `linear-gradient(135deg, ${info.color}0F 0%, #fff 55%)` }}>
        <div className="flex items-start gap-3.5">
          <span className="w-12 h-12 md:w-14 md:h-14 rounded-2xl flex items-center justify-center text-[24px] flex-shrink-0" style={{ background: info.color + '1F' }}>{g.icon && g.icon !== '🎯' ? g.icon : info.icon}</span>
          <div className="flex-1 min-w-0">
            <h1 className="text-[21px] md:text-[24px] font-bold tracking-[-0.01em]" style={{ color: 'var(--text)' }}>{g.name}</h1>
            {g.description && <p className="text-[12.5px] mt-0.5" style={{ color: 'var(--text3)' }}>{g.description}</p>}
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className="rounded-full px-2.5 py-[3px] text-[11px] font-semibold" style={{ background: H.bg, color: H.color }}>{H.label} · {H.range}</span>
              <span className="rounded-full px-2.5 py-[3px] text-[11px] font-semibold" style={{ background: info.color + '1A', color: info.color }}>{info.label}</span>
              <span className="rounded-full px-2.5 py-[3px] text-[11px] font-semibold" style={{ background: '#F1F5F9', color: 'var(--text2)' }}>{PRIORITY[Number(g.priority ?? 2)]}</span>
              {g.holder_name && <span className="rounded-full px-2.5 py-[3px] text-[11px] font-semibold" style={{ background: '#F1F5F9', color: 'var(--text2)' }}>For {g.holder_name === 'Self' ? 'you' : g.holder_name}</span>}
              <span className="rounded-full px-2.5 py-[3px] text-[11px] font-semibold" style={{ background: '#F1F5F9', color: 'var(--text2)' }}>by {fmtDay(g.target_date)} {g.target_date.slice(0, 4)}</span>
            </div>
          </div>
          <div className="hidden md:flex gap-2 flex-shrink-0">
            {!achieved && <button onClick={() => setSheet('money')} className="wl-btn wl-btn-primary" style={{ height: 34 }}><Plus size={14} />Add money</button>}
            <button onClick={() => setSheet('edit')} className="wl-btn" style={{ height: 34 }}><Edit2 size={13} />Edit</button>
          </div>
        </div>
        <div className="mt-4">
          <div className="flex justify-between items-baseline gap-2">
            <span className="text-[24px] md:text-[28px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{money(v.value)}</span>
            <span className="text-[12.5px]" style={{ color: 'var(--text3)' }}>of {money(p.futureTarget)}{p.inflation > 0 ? ` (${short(Number(g.target_amount))} today)` : ''}</span>
          </div>
          <div className="h-3 rounded-full mt-2" style={{ background: 'var(--track)' }} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p.pct)} aria-label="Goal progress">
            <div className="h-full rounded-full wl-grow" style={{ width: `${p.pct}%`, background: achieved ? 'var(--pos)' : info.color }} />
          </div>
          <div className="flex justify-between text-[11.5px] mt-1.5" style={{ color: 'var(--text4)' }}>
            {[25, 50, 75, 100].map(m => <span key={m} style={{ color: p.pct >= m ? 'var(--pos-text)' : undefined, fontWeight: p.pct >= m ? 600 : 400 }}>{p.pct >= m ? '✓ ' : ''}{m}%</span>)}
          </div>
        </div>
        <div className="md:hidden flex gap-2 mt-3">
          {!achieved && <button onClick={() => setSheet('money')} className="wl-btn wl-btn-primary flex-1" style={{ height: 38 }}><Plus size={14} />Add money</button>}
          <button onClick={() => setSheet('edit')} className="wl-btn flex-1" style={{ height: 38 }}><Edit2 size={13} />Edit</button>
        </div>
      </section>

      <InsightBar text={insight} prompt={`Explain my goal and the best way to reach it. ${ctx}`} />
      {!achieved && <AiActions actions={['Fix my plan', 'Which investments suit this goal?']} context={ctx} />}

      {g.status === 'paused' && (
        <div className="rounded-xl px-4 py-2.5 flex items-center justify-between gap-3 text-[13px]" style={{ background: '#F1F5F9', color: 'var(--text2)' }}>
          This goal is paused — it's left out of the funding plan.<button onClick={resume} className="font-semibold" style={{ color: 'var(--accent)' }}>Resume</button>
        </div>
      )}
      {achieved && g.status !== 'achieved' && (
        <div className="rounded-2xl px-4 py-3.5 flex items-center gap-3" style={{ background: '#FFF7E6', border: '1px solid #F8DDB8' }}>
          <Trophy size={22} style={{ color: '#D97706' }} />
          <div className="flex-1 text-[13px]" style={{ color: '#7C4A03' }}><b>You've reached it!</b> Mark it achieved to celebrate and free its investments for your next goal.</div>
          <button onClick={() => setSheet('achieve')} className="wl-btn wl-btn-primary flex-shrink-0" style={{ height: 34 }}>Mark achieved</button>
        </div>
      )}

      <KpiGrid>
        <KpiTile label="Saved" value={short(v.value)} tint={0} icon={Target} delta={`${Math.round(p.pct)}% of ${short(p.futureTarget)}`} />
        <KpiTile label="Needed a month" value={achieved ? '—' : short(p.need)} tint={2} icon={Calculator}
          delta={achieved ? 'Reached' : `${short(p.needRange.optimistic)}–${short(p.needRange.cautious)} · at ${p.ret}%`} />
        <KpiTile label="Your pace" value={`${short(it.pace)}/mo`} tint={3} icon={BarChart2} tone={it.pace >= p.need ? 'good' : 'neutral'}
          delta={tracksCash(g) ? 'Your saving it gets first (funding plan)' : it.pace > 0 ? 'SIPs, RDs and money added, last 3 months' : 'Nothing going in yet'} />
        <KpiTile label={`By ${fmtDay(g.target_date)} at this pace`} value={short(p.projected)} tint={1} icon={Layers}
          tone={p.gap >= 0 ? 'good' : 'bad'} delta={p.gap >= 0 ? `${short(p.gap)} ahead` : `${short(-p.gap)} short`} />
      </KpiGrid>

      <div className="flex gap-1 p-1 rounded-xl" style={{ background: '#E8EAF0' }} role="tablist">
        {TABS.map(t => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12.5px] font-semibold transition-all"
            style={tab === t.key ? { background: '#fff', color: 'var(--text)', boxShadow: '0 1px 2px rgba(0,0,0,.1)' } : { color: 'var(--text3)' }}>
            <t.icon size={13} />{t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-3.5 md:gap-4 items-start">
          <div className="flex flex-col gap-3.5 md:gap-4 min-w-0">
            <Panel title="Where the money comes from" right={<button onClick={() => setSheet('link')} className="text-[12px] font-semibold flex items-center gap-1" style={{ color: 'var(--accent)' }}><Link2 size={13} />Link</button>}>
              <ul className="mt-2">
                {v.holdings.map(h => (
                  <li key={h.type + h.id} className="flex items-center gap-3 py-2" style={{ borderTop: '1px solid var(--track)' }}>
                    <span className="text-[10.5px] font-semibold rounded-md px-1.5 py-0.5 flex-shrink-0" style={{ background: 'var(--accent-bg)', color: 'var(--accent2)' }}>{TYPE_LABELS[h.type] ?? h.type}</span>
                    <span className="flex-1 min-w-0 text-[13px] truncate" style={{ color: 'var(--text)' }}>{h.name}{h.pct < 100 && <span style={{ color: 'var(--text4)' }}> · {h.pct}% of it</span>}</span>
                    <span className="text-[13px] font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{short(h.value)}</span>
                  </li>
                ))}
                {tracksCash(g) && <li className="flex items-center gap-3 py-2" style={{ borderTop: '1px solid var(--track)' }}><span className="flex-1 text-[13px]" style={{ color: 'var(--text)' }}>🏦 Your {cur} bank & cash balances</span><span className="text-[13px] font-semibold tabular-nums">{short(v.cash)}</span></li>}
                {account && <li className="flex items-center gap-3 py-2" style={{ borderTop: '1px solid var(--track)' }}><span className="flex-1 text-[13px]" style={{ color: 'var(--text)' }}>🏦 {account.name} (savings kept for it)</span><span className="text-[13px] font-semibold tabular-nums">{short(v.account)}</span></li>}
                {!tracksCash(g) && contributions.length > 0 && <li className="flex items-center gap-3 py-2" style={{ borderTop: '1px solid var(--track)' }}><span className="flex-1 text-[13px]" style={{ color: 'var(--text)' }}>✍️ Money you added ({contributions.length})</span><span className="text-[13px] font-semibold tabular-nums">{short(v.added)}</span></li>}
                {v.value === 0 && <li className="text-[12.5px] py-3" style={{ color: 'var(--text3)' }}>Nothing yet. Link a fund, FD or SIP, keep a savings account for it (Edit), or add money as you set it aside.</li>}
              </ul>
              <div className="flex gap-2 mt-2">
                <button onClick={() => setSheet('link')} className="wl-btn flex-1" style={{ height: 34 }}><Link2 size={13} />Link investments</button>
                {!achieved && <button onClick={() => setSheet('money')} className="wl-btn flex-1" style={{ height: 34 }}><Plus size={13} />Add money</button>}
              </div>
            </Panel>

            <Panel title="Mix check" right={<span className="text-[11.5px]" style={{ color: 'var(--text4)' }}>{p.months} months to go</span>}>
              {v.value <= 0 ? <p className="text-[12.5px] mt-2" style={{ color: 'var(--text3)' }}>Once money is linked, this checks it suits the time left. {H.fit}</p> : (<>
                <div className="flex h-3 rounded-full overflow-hidden gap-[2px] mt-3" role="img" aria-label={`Equity ${Math.round(eqPct)}%, gold ${Math.round(goldPct)}%, steady ${Math.round(100 - eqPct - goldPct)}%`}>
                  {eqPct > 0 && <div style={{ width: `${eqPct}%`, background: '#6A55E8' }} />}
                  {goldPct > 0 && <div style={{ width: `${goldPct}%`, background: '#F29A2E' }} />}
                  {100 - eqPct - goldPct > 0 && <div style={{ width: `${100 - eqPct - goldPct}%`, background: '#2FB67C' }} />}
                </div>
                <div className="flex gap-3.5 flex-wrap text-[11.5px] mt-2" style={{ color: 'var(--text3)' }}>
                  <span><i className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: '#6A55E8' }} />Equity {Math.round(eqPct)}%</span>
                  {goldPct > 0 && <span><i className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: '#F29A2E' }} />Gold {Math.round(goldPct)}%</span>}
                  <span><i className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: '#2FB67C' }} />Steady {Math.round(100 - eqPct - goldPct)}%</span>
                </div>
                <p className="text-[12.5px] mt-2.5 leading-snug" style={{ color: eqPct > p.maxEquity + 15 ? 'var(--amber-text)' : 'var(--text2)' }}>
                  {eqPct > p.maxEquity + 15 ? `⚠ More equity than suits ${p.months} months — keep it under ~${p.maxEquity}% so a market fall can't derail the date.`
                    : `✓ Suits the time left (equity up to ~${p.maxEquity}% for now).`} {H.fit}
                </p>
              </>)}
            </Panel>
          </div>

          <div className="flex flex-col gap-3.5 md:gap-4">
            <Panel title="What to do">
              <ul className="mt-2 flex flex-col gap-2">
                {suggestions.slice(0, 5).map((s, i) => <li key={i} className="rounded-lg px-3 py-2 text-[12.5px] leading-snug" style={{ background: 'var(--bg2)', color: 'var(--text2)' }}>{s}</li>)}
              </ul>
            </Panel>
            <Panel title="Assumptions">
              <dl className="mt-2 text-[12.5px] flex flex-col gap-1.5">
                {[['Target today', money(Number(g.target_amount))], ['Prices rise', `${p.inflation}% a year${g.inflation_pct == null ? ' (usual for this type)' : ''}`],
                  ['Expected return', `${p.ret}% a year${g.return_pct == null ? ` (auto, ${H.label.toLowerCase()})` : ''}`], ['Months left', String(p.months)],
                  ['Created', fmtDay(String(g.created_at).slice(0, 10)) + ' ' + String(g.created_at).slice(0, 4)]].map(([k, val]) => (
                  <div key={k} className="flex justify-between gap-3"><dt style={{ color: 'var(--text3)' }}>{k}</dt><dd className="font-semibold" style={{ color: 'var(--text)' }}>{val}</dd></div>
                ))}
              </dl>
              <button onClick={() => setSheet('edit')} className="text-[12px] font-semibold mt-2" style={{ color: 'var(--accent)' }}>Change</button>
            </Panel>
            {!achieved && g.status !== 'paused' && (
              <button onClick={() => setSheet('achieve')} className="wl-card px-4 py-3 flex items-center gap-3 text-left">
                <Trophy size={18} style={{ color: '#D97706' }} />
                <span className="flex-1 text-[13px]" style={{ color: 'var(--text2)' }}><b style={{ color: 'var(--text)' }}>Done with it?</b> Mark it achieved and record what you used.</span>
              </button>
            )}
          </div>
        </div>
      )}

      {tab === 'trajectory' && (
        <Panel title="Where it's heading" right={<span className="text-[11.5px]" style={{ color: 'var(--text4)' }}>at {short(it.pace)}/mo · assumed {p.ret}% ± 3%</span>}>
          <div className="h-[280px] mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points} margin={{ top: 6, right: 8, left: 4, bottom: 0 }}>
                <CartesianGrid stroke="#EEF0F5" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10.5, fill: '#94A3B8' }} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tickFormatter={(n: number) => short(n)} tick={{ fontSize: 10.5, fill: '#94A3B8' }} tickLine={false} axisLine={false} width={64} />
                <Tooltip formatter={(n: number, name: string) => [money(n), name]} contentStyle={{ borderRadius: 10, border: '1px solid var(--line)', fontSize: 12 }} />
                <ReferenceLine y={p.futureTarget} stroke={info.color} strokeDasharray="4 4" />
                <Line dataKey="target" name="Target (with price rises)" stroke="#CBD5E1" strokeWidth={2} dot={false} strokeDasharray="4 4" isAnimationActive={false} />
                <Line dataKey="needed" name={`With ${short(p.need)}/mo`} stroke={info.color} strokeWidth={2.2} dot={false} isAnimationActive={false} />
                <Line dataKey="expected" name="Your pace (expected)" stroke="#6A55E8" strokeWidth={2.2} dot={false} isAnimationActive={false} />
                <Line dataKey="optimistic" name="Your pace (optimistic)" stroke="#B9AEF5" strokeWidth={1.4} dot={false} strokeDasharray="2 4" isAnimationActive={false} />
                <Line dataKey="cautious" name="Your pace (cautious)" stroke="#B9AEF5" strokeWidth={1.4} dot={false} strokeDasharray="2 4" isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-3.5 flex-wrap text-[11.5px] mt-2" style={{ color: 'var(--text3)' }}>
            <span><i className="inline-block w-4 h-[2px] mr-1 align-middle" style={{ background: info.color }} />With the needed {short(p.need)}/mo</span>
            <span><i className="inline-block w-4 h-[2px] mr-1 align-middle" style={{ background: '#6A55E8' }} />Your pace ({short(it.pace)}/mo)</span>
            <span><i className="inline-block w-4 h-[2px] mr-1 align-middle" style={{ background: '#B9AEF5' }} />Cautious / optimistic returns</span>
            <span><i className="inline-block w-4 h-[2px] mr-1 align-middle" style={{ background: '#CBD5E1' }} />Target as prices rise</span>
          </div>
          <p className="text-[11.5px] mt-2" style={{ color: 'var(--text4)' }}>Projections assume steady returns; real markets go up and down. Shown as a range for that reason.</p>
        </Panel>
      )}

      {tab === 'calculator' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 md:gap-4 items-start">
          <Panel title="If I put in…">
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {(['cautious', 'expected', 'optimistic'] as const).map(s => (
                <button key={s} onClick={() => setScenario(s)} aria-pressed={scenario === s} className="wl-chip" style={{ height: 28 }}>
                  {s[0].toUpperCase() + s.slice(1)} · {s === 'cautious' ? Math.max(p.ret - 3, 0) : s === 'optimistic' ? p.ret + 3 : p.ret}%
                </button>
              ))}
            </div>
            <div className="flex items-center rounded-xl px-3 mt-3" style={{ background: '#F7F8FA', border: '1px solid #E2E8F0', height: 46 }}>
              <span className="text-[14px] font-semibold mr-2" style={{ color: 'var(--text3)' }}>{cur === 'AED' ? 'AED' : '₹'}</span>
              <input value={simPmt || ''} onChange={e => setSimPmt(Number(e.target.value.replace(/[^0-9.]/g, '')) || 0)} inputMode="decimal" placeholder={String(Math.round(needAtRate))} aria-label="Monthly amount"
                className="flex-1 bg-transparent outline-none text-[18px] font-bold tabular-nums" style={{ color: 'var(--text)' }} />
              <span className="text-[12px]" style={{ color: 'var(--text3)' }}>a month</span>
            </div>
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {[0.5, 1, 1.5, 2].map(f => Math.round(needAtRate * f)).filter(x => x > 0).map(x => <button key={x} onClick={() => setSimPmt(x)} className="wl-chip" style={{ height: 26, fontSize: 11 }}>{short(x)}</button>)}
              {it.pace > 0 && <button onClick={() => setSimPmt(Math.round(it.pace + (cur === 'AED' ? 250 : 5000)))} className="wl-chip" style={{ height: 26, fontSize: 11 }}>Pace + {cur === 'AED' ? 'AED 250' : '₹5,000'}</button>}
            </div>
            <div className="rounded-xl px-4 py-3 mt-3" style={{ background: simMonths != null && simMonths <= p.months ? '#E7F7EF' : 'var(--bg2)' }}>
              {simPmt <= 0 ? <span className="text-[12.5px]" style={{ color: 'var(--text3)' }}>Needed at {rate}%: <b style={{ color: 'var(--text)' }}>{money(needAtRate)}</b> a month. One-off today instead: <b style={{ color: 'var(--text)' }}>{money(lumpToday)}</b>.</span>
                : simMonths == null ? <span className="text-[12.5px]" style={{ color: 'var(--text3)' }}>That doesn't reach it within 50 years — try more.</span>
                : <span className="text-[13px]" style={{ color: 'var(--text)' }}>Reached by <b>{monthLabel(simMonths)}</b> — {simMonths <= p.months ? `${p.months - simMonths} months early 🎉` : `${simMonths - p.months} months after your date`}.</span>}
            </div>
          </Panel>
          <Panel title="Move the date">
            <input type="range" min={-Math.min(24, Math.max(p.months - 1, 0))} max={36} value={shift} onChange={e => setShift(Number(e.target.value))} className="w-full mt-4" style={{ accentColor: info.color }} aria-label="Months earlier or later" />
            <div className="flex justify-between text-[11px]" style={{ color: 'var(--text4)' }}><span>Earlier</span><span>{shift === 0 ? 'No change' : `${shift > 0 ? '+' : ''}${shift} months`}</span><span>Later</span></div>
            <div className="grid grid-cols-2 gap-2.5 mt-3">
              <div className="rounded-xl px-3 py-2.5" style={{ background: 'var(--bg2)' }}><div className="text-[11px]" style={{ color: 'var(--text3)' }}>New date</div><div className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>{monthLabel(shifted)}</div></div>
              <div className="rounded-xl px-3 py-2.5" style={{ background: shiftedNeed < needAtRate ? '#E7F7EF' : shift === 0 ? 'var(--bg2)' : '#FDECE8' }}><div className="text-[11px]" style={{ color: 'var(--text3)' }}>Needs a month</div><div className="text-[14px] font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{money(shiftedNeed)}</div></div>
            </div>
            <p className="text-[11.5px] mt-2" style={{ color: 'var(--text4)' }}>A later date costs a little more (prices keep rising) but gives the money longer to grow.</p>
            {shift !== 0 && <button onClick={moveDate} disabled={busy} className="wl-btn wl-btn-primary w-full mt-3 disabled:opacity-60" style={{ height: 38 }}>Move to {monthLabel(shifted)}</button>}
          </Panel>
        </div>
      )}

      {tab === 'funding' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 md:gap-4 items-start">
          <Panel title={`Linked investments · ${links.length}`} right={<button onClick={() => setSheet('link')} className="text-[12px] font-semibold flex items-center gap-1" style={{ color: 'var(--accent)' }}><Link2 size={13} />Manage</button>}>
            {v.holdings.length === 0 ? <p className="text-[12.5px] mt-2" style={{ color: 'var(--text3)' }}>None linked. Link a fund, FD or SIP — its value (or the share you give this goal) counts here, and SIPs keep it growing every month.</p> : (
              <ul className="mt-2">
                {v.holdings.map(h => (
                  <li key={h.type + h.id} className="py-2" style={{ borderTop: '1px solid var(--track)' }}>
                    <div className="flex justify-between gap-3 text-[13px]"><span className="truncate" style={{ color: 'var(--text)' }}>{h.name}</span><span className="font-semibold tabular-nums">{money(h.value)}</span></div>
                    <div className="text-[11.5px]" style={{ color: 'var(--text4)' }}>{TYPE_LABELS[h.type] ?? h.type} · {h.pct}% of it for this goal · {Math.round(h.equity * 100)}% equity</div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Money added by hand" right={!achieved ? <button onClick={() => setSheet('money')} className="text-[12px] font-semibold flex items-center gap-1" style={{ color: 'var(--accent)' }}><Plus size={13} />Add</button> : undefined}>
            {!data.contributionsReady ? <p className="text-[12.5px] mt-2" style={{ color: 'var(--text3)' }}>Run migration 030 in Supabase to add money to goals.</p>
              : contributions.length === 0 ? <p className="text-[12.5px] mt-2" style={{ color: 'var(--text3)' }}>Set money aside in cash or a savings account? Record it here so the goal counts it.</p> : (
              <ul className="mt-2">
                {contributions.map(c => (
                  <li key={c.id} className="flex items-center gap-3 py-2 text-[13px]" style={{ borderTop: '1px solid var(--track)' }}>
                    <span className="flex-1 min-w-0 truncate" style={{ color: 'var(--text2)' }}>{fmtDay(c.contrib_date)} {String(c.contrib_date).slice(0, 4)}{c.note ? ` · ${c.note}` : ''}</span>
                    <span className="font-semibold tabular-nums" style={{ color: Number(c.amount) < 0 ? '#DC2626' : 'var(--pos-text)' }}>{Number(c.amount) < 0 ? '−' : '+'}{money(Math.abs(Number(c.amount)))}</span>
                    <button onClick={() => deleteContribution(c.id)} aria-label="Delete entry" className="p-1 rounded-md hover:bg-[var(--rose-bg)]" style={{ color: 'var(--text4)' }}><Trash2 size={12} /></button>
                  </li>
                ))}
              </ul>
            )}
            {tracksCash(g) && <p className="text-[11.5px] mt-2" style={{ color: 'var(--text4)' }}>This goal counts your bank & cash balances, so money added by hand isn't added again.</p>}
          </Panel>
        </div>
      )}

      {sheet === 'edit' && <AddGoalModal editData={g} accounts={data.accounts} members={data.members} onClose={() => setSheet(null)} />}
      {sheet === 'link' && <LinkInvestmentModal goalId={g.id} goal={g} allInvestments={data.investments} linked={links} onClose={() => setSheet(null)} />}
      {sheet === 'money' && <AddMoneySheet goal={g} onClose={() => setSheet(null)} onSaved={() => { setSheet(null); router.refresh() }} />}
      {sheet === 'achieve' && <AchieveSheet goal={g} value={v.value} linkCount={links.length} onClose={() => setSheet(null)} onSaved={() => { setSheet(null); router.refresh() }} />}
    </div>
  )
}
