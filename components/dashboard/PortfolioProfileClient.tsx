'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { QUESTIONS, PROFILES, riskProfile, answered, targetMix, type Answers } from '@/lib/portfolio/profile'
import { CLS_LABEL } from '@/lib/portfolio/advice'
import type { Cls } from '@/lib/portfolio/holdings'
import { PageHeader, Panel } from '@/components/ui/kit'

const CLS: Cls[] = ['equity', 'debt', 'gold', 'cash']

// The investor profile (design v2): ten quick questions → how much risk suits
// you → a target mix you can change. Everything in the portfolio manager is
// measured against it.
export default function PortfolioProfileClient({ answers: start, targets, ready }: { answers: Answers; targets: any; ready: boolean }) {
  const router = useRouter()
  const [a, setA] = useState<Answers>(start ?? {})
  const saved = targetMix(targets, null)
  const [custom, setCustom] = useState<Record<Cls, number> | null>(saved.source === 'yours' ? saved.mix : null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const done = answered(a)
  const result = useMemo(() => (done ? riskProfile(a) : null), [a, done])
  const mix = custom ?? result?.mix ?? PROFILES[2].mix
  const sum = CLS.reduce((s, c) => s + (Number(mix[c]) || 0), 0)
  const count = QUESTIONS.filter(q => a[q.key] != null && (!q.multi || (a[q.key] as string[]).length)).length

  const pick = (key: string, value: string, multi?: boolean) => setA(prev => {
    if (!multi) return { ...prev, [key]: value }
    const cur = (prev[key] as string[] | undefined) ?? []
    const next = value === 'none' ? ['none'] : cur.includes(value) ? cur.filter(v => v !== value) : [...cur.filter(v => v !== 'none'), value]
    return { ...prev, [key]: next }
  })

  async function save() {
    if (custom && Math.round(sum) !== 100) { setError('Your mix needs to add up to 100%.'); return }
    setBusy(true); setError('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('investor_profile').upsert({ user_id: user!.id, answers: a, targets: custom ? { mix: custom } : null, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    setBusy(false)
    if (error) { setError(/investor_profile/.test(error.message) ? 'Run migration 032 in Supabase to save your profile.' : error.message); return }
    router.push('/dashboard/portfolio'); router.refresh()
  }

  return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <PageHeader title="My investor profile" sub={`${count} of ${QUESTIONS.length} answered — so suggestions fit you, not a default`} />
      {!ready && <div className="rounded-xl px-4 py-2.5 text-[12.5px]" style={{ background: 'var(--amber-bg)', color: 'var(--amber-text)' }}>Run migration 032 in Supabase to save your answers.</div>}

      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-3.5 md:gap-4 items-start">
        <div className="flex flex-col gap-3 min-w-0">
          {QUESTIONS.map((q, i) => (
            <section key={q.key} className="wl-card px-4 md:px-5 py-3.5">
              <div className="flex items-start gap-2.5">
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11.5px] font-bold flex-shrink-0" style={a[q.key] != null ? { background: 'var(--pos-bg)', color: 'var(--pos-text)' } : { background: 'var(--accent-bg)', color: 'var(--accent2)' }}>
                  {a[q.key] != null ? <Check size={13} /> : i + 1}
                </span>
                <div className="min-w-0">
                  <h2 className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>{q.q}</h2>
                  <p className="text-[11.5px] mt-0.5" style={{ color: 'var(--text4)' }}>{q.why}{q.multi ? ' Pick any.' : ''}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2.5 pl-[34px]" role={q.multi ? 'group' : 'radiogroup'} aria-label={q.q}>
                {q.options.map(o => {
                  const on = q.multi ? ((a[q.key] as string[] | undefined) ?? []).includes(o.value) : a[q.key] === o.value
                  return <button key={o.value} onClick={() => pick(q.key, o.value, q.multi)} aria-pressed={on} className="wl-chip" style={{ height: 32 }}>{o.label}</button>
                })}
              </div>
            </section>
          ))}
        </div>

        <div className="flex flex-col gap-3.5 md:gap-4 lg:sticky lg:top-4">
          <Panel title="What suits you">
            {result ? (<>
              <div className="mt-2 text-[22px] font-bold" style={{ color: 'var(--text)' }}>{result.profile.label}</div>
              <div className="text-[12.5px]" style={{ color: 'var(--text3)' }}>{result.profile.blurb} Risk score {result.score}/100.</div>
              {result.notes.map((n, i) => <p key={i} className="text-[12px] mt-1.5 leading-snug" style={{ color: 'var(--text2)' }}>{n}</p>)}
            </>) : <p className="text-[12.5px] mt-2" style={{ color: 'var(--text3)' }}>Answer the questions to see your profile. Until then the manager uses a Balanced mix.</p>}
          </Panel>

          <Panel title="Target mix" right={custom ? <button onClick={() => setCustom(null)} className="text-[12px] font-semibold" style={{ color: 'var(--accent)' }}>Use suggested</button> : undefined}>
            <ul className="mt-2.5 flex flex-col gap-2.5">
              {CLS.map(c => (
                <li key={c} className="flex items-center gap-3">
                  <span className="w-[92px] text-[12.5px]" style={{ color: 'var(--text2)' }}>{CLS_LABEL[c]}</span>
                  <input type="range" min={0} max={100} step={5} value={mix[c]} aria-label={`${CLS_LABEL[c]} %`} className="flex-1" style={{ accentColor: 'var(--accent)' }}
                    onChange={e => setCustom({ ...mix, [c]: Number(e.target.value) })} />
                  <span className="w-[42px] text-right text-[13px] font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{mix[c]}%</span>
                </li>
              ))}
            </ul>
            <div className="text-[12px] mt-2.5 font-semibold" style={{ color: Math.round(sum) === 100 ? 'var(--pos-text)' : 'var(--amber-text)' }}>{Math.round(sum) === 100 ? '✓ Adds up to 100%' : `Adds up to ${Math.round(sum)}% — make it 100%`}</div>
            <p className="text-[11.5px] mt-1.5 leading-snug" style={{ color: 'var(--text4)' }}>Fixed income = FDs, PPF/EPF, bonds, debt funds. Cash = money beyond your emergency fund. {custom ? 'Your own mix — it replaces the suggestion.' : 'Suggested from your answers; drag to make it yours.'}</p>
          </Panel>

          {error && <div className="rounded-xl px-4 py-2.5 text-[12.5px]" style={{ background: '#FDECE8', color: '#B4231A' }}>{error}</div>}
          <button onClick={save} disabled={busy || !ready} className="wl-btn wl-btn-primary disabled:opacity-60" style={{ height: 44, fontSize: 14 }}>{busy ? 'Saving…' : 'Save and review my portfolio'}</button>
        </div>
      </div>
    </div>
  )
}
