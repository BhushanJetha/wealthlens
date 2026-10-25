'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { isMissingTable } from '@/lib/supabase/missingTable'
import { useViewStore } from '@/store/viewStore'
import { handwritten } from '@/lib/fonts'
import {
  resolve, evaluate, toCur, fmtMoney, ASSUMPTIONS,
  type Answers, type Detected, type Cur, type Status, type Source,
} from '@/lib/freedom'
import { QUOTES } from '@/lib/inspiration'
import {
  CheckCircle2, Circle, CircleDot, MinusCircle, ArrowRight, X, ClipboardList,
  Route, Sparkles, ChevronLeft, ChevronRight, Info, Square, CheckSquare,
} from 'lucide-react'

const LOCAL_KEY = 'wl-freedom-answers'
const SIGN_COLORS = ['#F9A8D4', '#FCD34D', '#86EFAC', '#93C5FD', '#C4B5FD', '#FDBA74', '#5EEAD4']

const STATUS: Record<Status, { icon: any; color: string; label: string }> = {
  done:     { icon: CheckCircle2, color: '#16A34A', label: 'Done' },
  partial:  { icon: CircleDot,    color: '#D97706', label: 'In progress' },
  todo:     { icon: Circle,       color: '#E11D48', label: 'To do' },
  optional: { icon: MinusCircle,  color: '#9CA3AF', label: 'Not needed yet' },
}
const SRC: Record<Source, { label: string; bg: string; fg: string }> = {
  you:     { label: 'your answer',    bg: '#F0FDF4', fg: '#15803D' },
  data:    { label: 'from your data', bg: '#EFF6FF', fg: '#1D4ED8' },
  assumed: { label: 'not set',        bg: '#F3F4F6', fg: '#6B7280' },
}

export default function FreedomCheckClient({ detected, initialAnswers, updatedAt, tableMissing: initialMissing }: {
  detected: Detected; initialAnswers: Answers | null; updatedAt: string | null; tableMissing: boolean
}) {
  const { view, fxRate: fx } = useViewStore()
  const [answers, setAnswers] = useState<Answers>(initialAnswers ?? {})
  const [tableMissing, setTableMissing] = useState(initialMissing)
  const [notice, setNotice] = useState('')
  const [wizard, setWizard] = useState(false)
  const [savedAt, setSavedAt] = useState(updatedAt)

  // Before migration 022 is run, answers live in this browser only
  useEffect(() => {
    if (!initialMissing) return
    try { const s = localStorage.getItem(LOCAL_KEY); if (s) setAnswers(JSON.parse(s)) } catch {}
  }, [initialMissing])

  const cur: Cur = answers.currency ?? (view === 'uae' ? 'AED' : 'INR')
  const r = useMemo(() => resolve(answers, detected, cur, fx), [answers, detected, cur, fx])
  const result = useMemo(() => evaluate(r, answers.done ?? {}), [r, answers.done])
  const m = (n: number) => fmtMoney(n, cur)
  const hasAnswers = Object.keys(answers).some(k => k !== 'done')

  async function persist(next: Answers) {
    setAnswers(next)
    if (!tableMissing) {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('financial_profile')
        .upsert({ user_id: user!.id, answers: next, updated_at: new Date().toISOString() })
      if (!error) { setNotice(''); setSavedAt(new Date().toISOString()); return }
      if (!isMissingTable(error)) { setNotice(`Couldn’t save: ${error.message}`); return }
      setTableMissing(true)
    }
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(next)) } catch {}
  }
  const toggleManual = (id: string) => persist({ ...answers, done: { ...(answers.done ?? {}), [id]: !answers.done?.[id] } })

  const { stages, current, items, plan, metrics } = result
  const metCount = stages.filter(s => s.met).length
  const stage = stages[current - 1]
  const quote = useMemo(() => {
    const pool = QUOTES.filter(q => ['freedom', 'saving', 'goals'].includes(q.topic))
    return pool[Math.floor(Date.now() / 86400000) % pool.length]
  }, [])

  const kpis = [
    { label: 'Savings rate', val: r.income > 0 ? `${Math.round(metrics.savingsRate * 100)}%` : '—', good: metrics.savingsRate >= 0.2, warn: metrics.savingsRate > 0 },
    { label: 'Emergency fund', val: metrics.emergencyMonths >= 99 ? '—' : `${metrics.emergencyMonths.toFixed(1)} mo`, good: metrics.emergencyMonths >= 6, warn: metrics.emergencyMonths >= 1 },
    { label: 'EMI load', val: r.income > 0 ? `${Math.round(metrics.emiRatio * 100)}%` : '—', good: metrics.emiRatio <= 0.3, warn: metrics.emiRatio <= 0.45 },
    { label: 'Freedom number', val: metrics.fiNumber > 0 ? `${Math.round(metrics.fiPct * 100)}%` : '—', good: metrics.fiPct >= 1, warn: metrics.fiPct > 0 },
  ]

  return (
    <div className="space-y-5 pb-12">
      {/* Daily quote */}
      <Link href="/dashboard/inspire" className="block rounded-2xl px-5 py-4 transition-shadow hover:shadow-md"
        style={{ background: 'linear-gradient(120deg,#FEF3C7 0%,#FCE7F3 55%,#E0E7FF 100%)' }}>
        <div className="flex items-center gap-3">
          <Sparkles size={18} className="shrink-0" style={{ color: '#DB2777' }} />
          <div className="flex-1 min-w-0">
            <span className={handwritten.className} style={{ fontSize: 23, color: '#3B0764', fontWeight: 700, lineHeight: 1.15 }}>{quote.text}</span>
            {quote.author && <span className="ml-2 text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: '#7E22CE' }}>— {quote.author}</span>}
          </div>
          <span className="hidden sm:flex items-center gap-1 text-[11px] font-bold shrink-0" style={{ color: '#9D174D' }}>Money Mindset <ArrowRight size={12} /></span>
        </div>
      </Link>

      {notice && <div className="wl-card p-3 text-[12px]" style={{ borderColor: 'var(--rose)', color: 'var(--rose)' }}>{notice}</div>}
      {tableMissing && (
        <div className="wl-card p-3 flex items-start gap-2 text-[12px]" style={{ background: '#FFFBEB', borderColor: '#FCD34D', color: '#92400E' }}>
          <Info size={14} className="shrink-0 mt-0.5" />
          <span>Your answers are saved in this browser only. Run <b>supabase/migrations/022_freedom.sql</b> in the Supabase SQL Editor to keep them in your account.</span>
        </div>
      )}

      {/* First-time prompt */}
      {!hasAnswers && (
        <div className="wl-card p-4 flex flex-col sm:flex-row sm:items-center gap-3" style={{ borderColor: 'var(--sage)', background: 'var(--sage-bg)' }}>
          <ClipboardList size={22} className="shrink-0" style={{ color: 'var(--sage)' }} />
          <div className="flex-1">
            <div className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>We’ve pre-filled this from your WealthLens data</div>
            <div className="text-[12px]" style={{ color: 'var(--text2)' }}>Answer 8 quick questions — salary, expenses, EMIs, savings, dependents, insurance — to make your stage and plan accurate.</div>
          </div>
          <button onClick={() => setWizard(true)} className="px-4 py-2.5 rounded-xl text-[13px] font-bold text-white shrink-0" style={{ background: 'var(--sage)' }}>
            Start the check-up
          </button>
        </div>
      )}

      {/* Stage hero */}
      <div className="wl-card overflow-hidden">
        <div className="grid md:grid-cols-[1fr_300px]">
          <div className="p-5 sm:p-6">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--text3)' }}>Your freedom stage</div>
            {current > stages.length ? (
              <>
                <div className={handwritten.className} style={{ fontSize: 44, color: '#15803D', fontWeight: 700, lineHeight: 1.05, marginTop: 4 }}>Financially Free 🎉</div>
                <p className="text-[13px] mt-1" style={{ color: 'var(--text2)' }}>Every step is done. Keep investing, rebalance yearly and enjoy the freedom.</p>
              </>
            ) : (
              <>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-[13px] font-bold" style={{ color: 'var(--text3)' }}>Stage {current} of {stages.length}</span>
                </div>
                <div className={handwritten.className} style={{ fontSize: 46, color: 'var(--text)', fontWeight: 700, lineHeight: 1 }}>{stage.name}</div>
                <p className="text-[13px] mt-1" style={{ color: 'var(--text2)' }}>{stage.sub}</p>
              </>
            )}

            <div className="mt-4">
              <div className="flex justify-between text-[11px] mb-1" style={{ color: 'var(--text3)' }}>
                <span>Journey</span><span>{metCount} of {stages.length} stages complete</span>
              </div>
              <div className="flex gap-1">
                {stages.map((s, i) => (
                  <div key={s.n} className="h-2 flex-1 rounded-full" style={{ background: s.met ? SIGN_COLORS[i] : 'var(--bg2)', border: s.met ? 'none' : '1px solid var(--border)' }} />
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-4">
              {kpis.map(k => (
                <div key={k.label} className="rounded-xl px-3 py-2.5" style={{ background: 'var(--bg2)' }}>
                  <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text3)' }}>{k.label}</div>
                  <div className="text-[18px] font-black font-mono" style={{ color: k.val === '—' ? 'var(--text3)' : k.good ? '#16A34A' : k.warn ? '#D97706' : '#E11D48' }}>{k.val}</div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3 mt-4">
              <button onClick={() => setWizard(true)} className="px-4 py-2 rounded-xl text-[12px] font-bold border"
                style={hasAnswers ? { borderColor: 'var(--border)', color: 'var(--text2)', background: '#fff' } : { borderColor: 'var(--sage)', color: '#fff', background: 'var(--sage)' }}>
                {hasAnswers ? 'Update my answers' : 'Answer the questions'}
              </button>
              <span className="text-[11px]" style={{ color: 'var(--text3)' }}>
                In {cur} · income {m(r.income)}/mo · expenses {m(r.expenses)}/mo
                {savedAt && hasAnswers && <> · updated {new Date(savedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</>}
              </span>
            </div>
          </div>

          {/* Signpost of the 7 stages */}
          <div className="relative px-5 py-6" style={{ background: 'linear-gradient(180deg,#E0F2FE 0%,#FDF2F8 60%,#FEF3C7 100%)' }}>
            <div className="absolute left-[34px] top-5 bottom-5 w-2.5 rounded-sm" style={{ background: '#A16207' }} />
            <div className="relative space-y-2">
              {stages.map((s, i) => {
                const isCur = s.n === current
                return (
                  <div key={s.n} className="relative flex items-center gap-2">
                    <div className="flex items-center gap-1.5 h-9 pl-3 pr-7 shadow-sm"
                      style={{
                        background: SIGN_COLORS[i], opacity: s.met || isCur ? 1 : 0.45,
                        clipPath: 'polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%)',
                        transform: `rotate(${i % 2 ? 1 : -1}deg) ${isCur ? 'scale(1.06)' : ''}`,
                        outline: isCur ? '2px solid #1F2937' : 'none',
                      }}>
                      {s.met ? <CheckCircle2 size={13} color="#14532D" />
                        : isCur ? <span className="text-[13px]" aria-label="You are here">📍</span>
                        : <span className="text-[10px] font-black" style={{ color: '#1F2937' }}>{s.n}</span>}
                      <span className={handwritten.className} style={{ fontSize: 20, color: '#1F2937', fontWeight: 700, whiteSpace: 'nowrap' }}>{s.name}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-5 items-start">
        {/* Checklist */}
        <div className="wl-card overflow-hidden">
          <div className="px-4 py-3 flex items-center justify-between" style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2">
              <ClipboardList size={15} style={{ color: 'var(--blue)' }} />
              <span className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>Freedom checklist</span>
            </div>
            <span className="text-[11px] font-semibold" style={{ color: 'var(--text3)' }}>
              {items.filter(i => i.status === 'done' || i.status === 'optional').length} / {items.length} done
            </span>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {items.map(it => {
              const st = STATUS[it.status]
              const Icon = it.manual ? (it.status === 'done' ? CheckSquare : Square) : st.icon
              return (
                <div key={it.id} className="px-4 py-3 flex items-start gap-3">
                  {it.manual
                    ? <button onClick={() => toggleManual(it.id)} aria-label={`Mark ${it.title}`} className="mt-0.5"><Icon size={18} style={{ color: st.color }} /></button>
                    : <Icon size={18} className="shrink-0 mt-0.5" style={{ color: st.color }} />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{it.title}</span>
                      {it.src && <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold" style={{ background: SRC[it.src].bg, color: SRC[it.src].fg }}>{SRC[it.src].label}</span>}
                    </div>
                    <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--text3)' }}>{it.detail}</div>
                  </div>
                  {it.link && (
                    <Link href={it.link.href} className="shrink-0 text-[11px] font-semibold flex items-center gap-0.5 mt-0.5" style={{ color: 'var(--blue)' }}>
                      {it.link.label} <ChevronRight size={11} />
                    </Link>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Plan */}
        <div className="wl-card overflow-hidden">
          <div className="px-4 py-3 flex items-center gap-2" style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
            <Route size={15} style={{ color: 'var(--sage)' }} />
            <span className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>Your plan — in this order</span>
          </div>
          {plan.length === 0 ? (
            <div className="p-6 text-center text-[13px]" style={{ color: 'var(--text2)' }}>You’ve ticked everything. Keep investing and enjoy the freedom! 🎉</div>
          ) : (
            <ol className="p-4 space-y-3">
              {plan.map((p, i) => (
                <li key={p.id} className="flex gap-3">
                  <span className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-black shrink-0"
                    style={i < 3 ? { background: 'var(--sage)', color: '#fff' } : { background: 'var(--bg2)', color: 'var(--text3)' }}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>{p.title}</span>
                      {i < 3 && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider" style={{ background: 'var(--sage-bg)', color: 'var(--sage)' }}>Do next</span>}
                    </div>
                    <p className="text-[12px] mt-0.5 leading-relaxed" style={{ color: 'var(--text2)' }}>{p.action}</p>
                    {p.link && (
                      <Link href={p.link.href} className="inline-flex items-center gap-0.5 text-[11px] font-semibold mt-1" style={{ color: 'var(--blue)' }}>
                        Open {p.link.label} <ChevronRight size={11} />
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      <p className="text-[10.5px] leading-relaxed" style={{ color: 'var(--text3)' }}>
        Assumptions: inflation {ASSUMPTIONS.inflation * 100}%, SIP return {ASSUMPTIONS.sipReturn * 100}%, existing retirement savings grow {ASSUMPTIONS.existingReturn * 100}%,
        term cover {ASSUMPTIONS.termMultiple}× yearly income + loans, emergency fund {ASSUMPTIONS.emergencyMonths} months of expenses + EMIs, freedom number {ASSUMPTIONS.fiMultiple}× yearly expenses.
        All accounts (AED + INR) are included, converted at 1 AED = ₹{fx.toFixed(2)}.
        {detected.monthsOfData > 0 && <> Income & expenses from your data are the average of your last {detected.monthsOfData} month{detected.monthsOfData > 1 ? 's' : ''} of transactions.</>}
        {' '}A guide to help you plan, not financial advice.
      </p>

      {wizard && (
        <CheckupWizard answers={answers} resolved={r} detected={detected} fx={fx}
          onClose={() => setWizard(false)}
          onSave={next => { persist(next); setWizard(false) }} />
      )}
    </div>
  )
}

// ─── Questionnaire ────────────────────────────────────────────────────────────
type Form = {
  currency: Cur; age: string; retireAge: string; income: string; expenses: string; emi: string; savings: string
  dependents: string; termCover: string; hasHealth: '' | 'yes' | 'no'; emergencyFund: string; retirementSavings: string
}
const MONEY_KEYS = ['income', 'expenses', 'emi', 'savings', 'termCover', 'emergencyFund', 'retirementSavings'] as const

function CheckupWizard({ answers, resolved: r, detected, fx, onClose, onSave }: {
  answers: Answers; resolved: ReturnType<typeof resolve>; detected: Detected; fx: number
  onClose: () => void; onSave: (a: Answers) => void
}) {
  // Start from whatever the check is using now; unknowns stay blank
  const init = (k: keyof Answers, v: number) => r.src[k] === 'assumed' ? '' : String(Math.round(v))
  const [f, setF] = useState<Form>({
    currency: r.cur,
    age: answers.age != null ? String(answers.age) : '',
    retireAge: answers.retireAge != null ? String(answers.retireAge) : '',
    income: init('income', r.income), expenses: init('expenses', r.expenses), emi: init('emi', r.emi),
    savings: answers.savings != null ? String(answers.savings) : '',
    dependents: answers.dependents != null ? String(answers.dependents) : '',
    termCover: init('termCover', r.termCover),
    hasHealth: answers.hasHealth != null ? (answers.hasHealth ? 'yes' : 'no') : r.src.hasHealth === 'data' ? 'yes' : '',
    emergencyFund: init('emergencyFund', r.emergencyFund),
    retirementSavings: init('retirementSavings', r.retirementSavings),
  })
  const [step, setStep] = useState(0)
  const set = (k: keyof Form) => (v: string) => setF(p => ({ ...p, [k]: v }))
  const sug = (p: keyof Detected) => Math.round(toCur(detected[p] as any, f.currency, fx))
  const n = (s: string) => (s.trim() === '' || isNaN(Number(s)) ? undefined : Number(s))
  const autoSavings = (n(f.income) ?? 0) - (n(f.expenses) ?? 0) - (n(f.emi) ?? 0)

  function switchCurrency(to: Cur) {
    if (to === f.currency) return
    const rate = to === 'INR' ? fx : 1 / fx
    setF(p => {
      const next: Form = { ...p, currency: to }
      MONEY_KEYS.forEach(k => { const v = n(p[k]); if (v != null) next[k] = String(Math.round(v * rate)) })
      return next
    })
  }

  function finish() {
    onSave({
      ...answers,
      currency: f.currency, age: n(f.age), retireAge: n(f.retireAge),
      income: n(f.income), expenses: n(f.expenses), emi: n(f.emi), savings: n(f.savings),
      dependents: n(f.dependents), termCover: n(f.termCover),
      hasHealth: f.hasHealth === '' ? undefined : f.hasHealth === 'yes',
      emergencyFund: n(f.emergencyFund), retirementSavings: n(f.retirementSavings),
    })
  }

  const steps: { title: string; sub: string; body: React.ReactNode }[] = [
    { title: 'About you', sub: 'Which currency should we plan in, and when do you want to retire?', body: (
      <div className="space-y-4">
        <div className="flex gap-2">
          {(['AED', 'INR'] as Cur[]).map(c => (
            <button key={c} onClick={() => switchCurrency(c)} className="flex-1 py-2.5 rounded-xl text-[13px] font-bold border"
              style={f.currency === c ? { background: 'var(--sage-bg)', borderColor: 'var(--sage)', color: 'var(--sage)' } : { borderColor: 'var(--border)', color: 'var(--text3)' }}>
              {c === 'AED' ? 'AED — UAE' : '₹ INR — India'}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <NumField label="Your age" value={f.age} onChange={set('age')} placeholder="30" />
          <NumField label="Retire at" value={f.retireAge} onChange={set('retireAge')} placeholder="60" />
        </div>
      </div>
    ) },
    { title: 'Monthly take-home pay', sub: 'Salary and other regular income after tax, per month.', body: (
      <MoneyField cur={f.currency} value={f.income} onChange={set('income')} suggestion={sug('income')} />
    ) },
    { title: 'Monthly expenses', sub: 'Rent, food, bills, school fees, family support… not EMIs or investments.', body: (
      <MoneyField cur={f.currency} value={f.expenses} onChange={set('expenses')} suggestion={sug('expenses')} />
    ) },
    { title: 'Monthly EMIs', sub: 'All loan EMIs together — home, car, personal. Enter 0 if none.', body: (
      <MoneyField cur={f.currency} value={f.emi} onChange={set('emi')} suggestion={sug('emi')} />
    ) },
    { title: 'How much can you save each month?', sub: `Leave blank to use income − expenses − EMIs (${fmtMoney(autoSavings, f.currency)}).`, body: (
      <MoneyField cur={f.currency} value={f.savings} onChange={set('savings')} placeholder={String(Math.round(autoSavings))} />
    ) },
    { title: 'Who depends on your income?', sub: 'Spouse, children, parents you support.', body: (
      <div className="flex flex-wrap gap-2">
        {['0', '1', '2', '3', '4', '5'].map(d => (
          <button key={d} onClick={() => set('dependents')(d)} className="w-14 h-12 rounded-xl text-[15px] font-bold border"
            style={f.dependents === d ? { background: 'var(--sage-bg)', borderColor: 'var(--sage)', color: 'var(--sage)' } : { borderColor: 'var(--border)', color: 'var(--text2)' }}>
            {d === '5' ? '5+' : d}
          </button>
        ))}
      </div>
    ) },
    { title: 'Insurance', sub: 'Term life cover pays your family if something happens to you.', body: (
      <div className="space-y-4">
        <MoneyField label="Total term life cover (0 if none)" cur={f.currency} value={f.termCover} onChange={set('termCover')} suggestion={sug('termCover')} />
        <div>
          <div className="text-[10px] uppercase tracking-wider font-semibold mb-1.5" style={{ color: 'var(--text3)' }}>Health insurance for you & family?</div>
          <div className="flex gap-2">
            {(['yes', 'no'] as const).map(v => (
              <button key={v} onClick={() => set('hasHealth')(v)} className="flex-1 py-2.5 rounded-xl text-[13px] font-bold border capitalize"
                style={f.hasHealth === v ? { background: 'var(--sage-bg)', borderColor: 'var(--sage)', color: 'var(--sage)' } : { borderColor: 'var(--border)', color: 'var(--text3)' }}>
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>
    ) },
    { title: 'Safety & retirement', sub: 'Money you can reach in an emergency, and what you’ve saved for retirement.', body: (
      <div className="space-y-4">
        <MoneyField label="Emergency fund (savings + FDs you can break)" cur={f.currency} value={f.emergencyFund} onChange={set('emergencyFund')} suggestion={sug('liquid')} />
        <MoneyField label="Retirement savings (NPS / PPF / EPF / pension)" cur={f.currency} value={f.retirementSavings} onChange={set('retirementSavings')} suggestion={sug('retirement')} />
      </div>
    ) },
  ]
  const last = step === steps.length - 1
  const s = steps[step]

  return (
    <div className="fixed inset-0 wl-sheet bg-black/40 z-50 overflow-y-auto" onClick={onClose}>
      <div className="wl-sheet-wrap flex min-h-full items-center justify-center p-4 py-8">
        <div className="wl-sheet-panel wl-card w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
          <div className="px-5 pt-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text3)' }}>Freedom check-up · {step + 1} of {steps.length}</span>
              <button onClick={onClose} style={{ color: 'var(--text3)' }} aria-label="Close"><X size={16} /></button>
            </div>
            <div className="flex gap-1 mt-2">
              {steps.map((_, i) => <div key={i} className="h-1 flex-1 rounded-full" style={{ background: i <= step ? 'var(--sage)' : 'var(--bg2)' }} />)}
            </div>
          </div>
          <div className="px-5 pt-5 pb-4 min-h-[230px]">
            <div className="text-[17px] font-bold" style={{ color: 'var(--text)' }}>{s.title}</div>
            <p className="text-[12px] mt-0.5 mb-4" style={{ color: 'var(--text3)' }}>{s.sub}</p>
            {s.body}
          </div>
          <div className="px-5 py-3 flex gap-2" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg2)' }}>
            <button onClick={() => setStep(x => x - 1)} disabled={step === 0}
              className="px-3 py-2 rounded-lg text-[12px] font-semibold border flex items-center gap-1 disabled:opacity-30" style={{ borderColor: 'var(--border)', color: 'var(--text2)', background: '#fff' }}>
              <ChevronLeft size={13} /> Back
            </button>
            <button onClick={finish} className="px-3 py-2 rounded-lg text-[12px] font-semibold" style={{ color: 'var(--text3)' }}>Save & close</button>
            <button onClick={() => (last ? finish() : setStep(x => x + 1))}
              className="ml-auto px-4 py-2 rounded-lg text-[12px] font-bold text-white flex items-center gap-1" style={{ background: 'var(--sage)' }}>
              {last ? 'See my plan' : <>Next <ChevronRight size={13} /></>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function NumField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-semibold mb-1.5" style={{ color: 'var(--text3)' }}>{label}</div>
      <input type="number" inputMode="numeric" value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)}
        className="wl-input w-full font-mono font-bold" style={{ background: 'var(--bg2)' }} />
    </div>
  )
}

function MoneyField({ label, cur, value, onChange, suggestion, placeholder }: {
  label?: string; cur: Cur; value: string; onChange: (v: string) => void; suggestion?: number; placeholder?: string
}) {
  const showSug = suggestion != null && suggestion > 0 && String(suggestion) !== value
  return (
    <div>
      {label && <div className="text-[10px] uppercase tracking-wider font-semibold mb-1.5" style={{ color: 'var(--text3)' }}>{label}</div>}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] font-mono" style={{ color: 'var(--text3)' }}>{cur === 'AED' ? 'AED' : '₹'}</span>
        <input type="number" inputMode="decimal" min="0" value={value} placeholder={placeholder ?? '0'} onChange={e => onChange(e.target.value)}
          className="wl-input w-full pl-12 font-mono font-bold text-[15px]" style={{ background: 'var(--bg2)' }} />
      </div>
      {showSug && (
        <button onClick={() => onChange(String(suggestion))} className="mt-1.5 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold"
          style={{ background: '#EFF6FF', color: '#1D4ED8' }}>
          From your data: {fmtMoney(suggestion!, cur)} · Use
        </button>
      )}
    </div>
  )
}
