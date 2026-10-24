'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useViewStore } from '@/store/viewStore'
import { GOAL_INTERESTS } from '@/lib/goalInterests'
import { ErrorBox, PrimaryButton, REGION_VIEW, type Region } from '@/components/auth/AuthUI'

type Source = 'upload' | 'add' | 'manual'

const REGION_CARDS: { key: Region; name: string; sub: string }[] = [
  { key: 'UAE',   name: 'UAE',                sub: 'Dirham accounts, UAE banks and cards' },
  { key: 'India', name: 'India',              sub: 'Rupee accounts, mutual funds, tax tools' },
  { key: 'Both',  name: 'Both UAE and India', sub: 'Consolidated net worth and FX tools' },
]
const SOURCE_CARDS: { key: Source; name: string; sub: string; next: string }[] = [
  { key: 'upload', name: 'Upload a PDF statement',     sub: 'Bank and credit card PDFs are read and every transaction is tagged',
    next: 'The statement upload opens as soon as you land.' },
  { key: 'add',    name: 'Type or speak transactions', sub: 'Add a few by hand now — later just tap Speak it on Home',
    next: 'The add-transaction form opens as soon as you land.' },
  { key: 'manual', name: 'Add accounts manually',      sub: 'Start with balances; add detail later',
    next: 'You start on Bank accounts to enter balances.' },
]
const REGION_LABEL: Record<Region, string> = { UAE: 'UAE · AED', India: 'India · INR', Both: 'UAE + India, consolidated' }
const DEST: Record<Source, string> = { upload: '/dashboard?start=upload', add: '/dashboard?start=add', manual: '/dashboard/accounts' }

interface Props { userId: string; firstName: string | null; initialRegion: Region; initialGoals: string[] }

// Four quick choices after sign-up: region → first data source → goals → summary.
// Saves the default view and goal picks, then drops the user straight into
// the first step they chose.
export default function OnboardingClient({ userId, firstName, initialRegion, initialGoals }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const setView = useViewStore(s => s.setView)
  const [step, setStep] = useState(0)
  const [region, setRegion] = useState<Region>(initialRegion)
  const [source, setSource] = useState<Source>('upload')
  const [goals, setGoals] = useState<string[]>(initialGoals)
  const [saving, setSaving] = useState<null | 'finish' | 'skip'>(null)
  const [error, setError] = useState('')

  async function finish(skip: boolean) {
    setSaving(skip ? 'skip' : 'finish'); setError('')
    const profile = skip ? { onboarded: true } : { onboarded: true, default_view: REGION_VIEW[region] }
    const { error } = await supabase.from('profiles').update(profile).eq('id', userId)
    if (error) { setSaving(null); setError(`Couldn't save your setup: ${error.message}`); return }
    if (!skip) {
      // Goal picks live on the auth user — Home offers each as "set up this goal"
      await supabase.auth.updateUser({ data: { region, goal_interests: goals } })
      setView(REGION_VIEW[region])
    }
    router.push(skip ? '/dashboard' : DEST[source])
    router.refresh()
  }

  const next = () => step < 3 ? setStep(step + 1) : finish(false)
  const chosen = SOURCE_CARDS.find(c => c.key === source)!

  return (
    <div>
      <div className="flex gap-1.5 mb-2" aria-hidden>
        {[0, 1, 2, 3].map(i => <div key={i} className="flex-1 h-1 rounded-sm transition-colors" style={{ background: i <= step ? 'var(--accent)' : 'var(--border)' }} />)}
      </div>
      <div className="flex items-center justify-between mb-[18px]">
        <span className="text-[12px] font-semibold" style={{ color: 'var(--text3)' }}>Step {step + 1} of 4</span>
        <button type="button" onClick={() => finish(true)} disabled={!!saving}
          className="text-[12px] font-semibold hover:underline disabled:opacity-60" style={{ color: 'var(--text3)' }}>
          {saving === 'skip' ? 'Skipping…' : 'Skip for now'}
        </button>
      </div>

      {error && <ErrorBox>{error}</ErrorBox>}

      {step === 0 && (
        <Step title="Where do you manage money?" sub="We set currencies, banks and tax tools to match.">
          <Choices items={REGION_CARDS} value={region} onChange={setRegion} label="Region" />
        </Step>
      )}

      {step === 1 && (
        <Step title="Bring your data in" sub="Pick the easiest start — you can add the rest later.">
          <Choices items={SOURCE_CARDS} value={source} onChange={setSource} label="First data source" />
        </Step>
      )}

      {step === 2 && (
        <Step title="What are you working towards?" sub="Pick any. Each one becomes a goal you can set up in a click.">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Goals">
            {GOAL_INTERESTS.map(g => {
              const on = goals.includes(g)
              return (
                <button key={g} type="button" aria-pressed={on}
                  onClick={() => setGoals(gs => gs.includes(g) ? gs.filter(x => x !== g) : [...gs, g])}
                  className="px-4 py-2.5 rounded-full text-[13.5px] font-medium transition-colors"
                  style={on
                    ? { background: 'var(--accent)', color: '#fff', border: '1px solid var(--accent)' }
                    : { border: '1px solid var(--border)', color: 'var(--text2)' }}>
                  {g}
                </button>
              )
            })}
          </div>
        </Step>
      )}

      {step === 3 && (
        <Step title={`You are set${firstName ? `, ${firstName}` : ''}`} sub="Here is what we will build for you.">
          <dl className="rounded-xl p-4 flex flex-col gap-2.5 text-[13.5px]" style={{ border: '1px solid var(--border)', color: 'var(--text2)' }}>
            <div><dt className="inline font-bold" style={{ color: 'var(--text)' }}>View: </dt><dd className="inline">{REGION_LABEL[region]}</dd></div>
            <div><dt className="inline font-bold" style={{ color: 'var(--text)' }}>Data: </dt><dd className="inline">{chosen.name}</dd></div>
            <div><dt className="inline font-bold" style={{ color: 'var(--text)' }}>Goals: </dt><dd className="inline">{goals.join(', ') || 'None yet'}</dd></div>
          </dl>
          <div className="rounded-xl px-4 py-3.5 mt-3 text-[13px] leading-normal"
            style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', color: 'var(--accent2)' }}>
            <b>Next:</b> {chosen.next} Once your first statement is in, Home shows your net worth, a 30-day cash-flow forecast and what needs attention.
          </div>
        </Step>
      )}

      <div className="flex gap-2.5 mt-6">
        {step > 0 && (
          <button type="button" onClick={() => setStep(step - 1)} disabled={!!saving}
            className="h-12 px-5 rounded-[10px] text-[14px] font-semibold transition-colors hover:bg-slate-50"
            style={{ border: '1px solid var(--border)', color: 'var(--text2)' }}>
            Back
          </button>
        )}
        <PrimaryButton type="button" onClick={next} loading={saving === 'finish'} loadingText="Setting up…" disabled={!!saving} className="flex-1">
          {step < 3 ? 'Continue' : 'Open my dashboard'}
        </PrimaryButton>
      </div>
    </div>
  )
}

function Step({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <section>
      <h1 className="text-[22px] md:text-[24px] font-bold tracking-[-0.01em]" style={{ color: 'var(--text)' }}>{title}</h1>
      <p className="text-[14px] mt-1 mb-[18px]" style={{ color: 'var(--text3)' }}>{sub}</p>
      {children}
    </section>
  )
}

function Choices<K extends string>({ items, value, onChange, label }: {
  items: { key: K; name: string; sub: string }[]; value: K; onChange: (k: K) => void; label: string
}) {
  return (
    <div className="flex flex-col gap-2.5" role="radiogroup" aria-label={label}>
      {items.map(it => {
        const on = it.key === value
        return (
          <button key={it.key} type="button" role="radio" aria-checked={on} onClick={() => onChange(it.key)}
            className="flex justify-between items-center gap-3 px-4 py-3.5 rounded-xl text-left transition-colors"
            style={on ? { background: 'var(--accent-bg)', border: '1px solid var(--accent)' } : { border: '1px solid var(--border)' }}>
            <span>
              <span className="block text-[15px] font-semibold" style={{ color: 'var(--text)' }}>{it.name}</span>
              <span className="block text-[12.5px] mt-0.5" style={{ color: 'var(--text3)' }}>{it.sub}</span>
            </span>
            <span className="w-[18px] h-[18px] rounded-full flex-none" aria-hidden
              style={on ? { background: 'var(--accent)', boxShadow: 'inset 0 0 0 4px var(--accent-bg)' } : { border: '1.5px solid #CBD5E1' }} />
          </button>
        )
      })}
    </div>
  )
}
