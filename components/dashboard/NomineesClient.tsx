'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserCheck, UserX, ListChecks } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { NomineeRow } from '@/lib/portfolio/protection'
import { PageHeader, InsightBar, KpiTile, KpiGrid, Segmented, Ring } from '@/components/ui/kit'

// Nominees (design v2): who gets each account, investment, policy and asset.
// This is your record — the nominee itself is registered with the bank, fund
// house or insurer (net banking or the branch); a will decides who finally gets it.
export default function NomineesClient({ rows: initial, ready, members }: { rows: NomineeRow[]; ready: boolean; members: string[] }) {
  const router = useRouter()
  const [rows, setRows] = useState(initial)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [show, setShow] = useState<'missing' | 'all'>(initial.some(r => !r.nominee) ? 'missing' : 'all')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [bulk, setBulk] = useState(members[0] ?? '')
  const key = (r: NomineeRow) => `${r.table}:${r.id}`
  const set = rows.filter(r => r.nominee).length, pct = rows.length ? set / rows.length * 100 : 0
  const shown = rows.filter(r => show === 'all' || !r.nominee)
  const groups = useMemo(() => Array.from(new Set(shown.map(r => r.label))).map(l => ({ label: l, rows: shown.filter(r => r.label === l) })), [shown])
  const names = Array.from(new Set([...members, ...rows.map(r => r.nominee).filter(Boolean) as string[]]))

  async function save(list: NomineeRow[], name: string) {
    const nominee = name.trim() || null
    setBusy(list.length > 1 ? 'bulk' : key(list[0])); setError('')
    const supabase = createClient()
    for (const r of list) {
      const { error } = await supabase.from(r.table).update({ nominee }).eq('id', r.id)
      if (error) { setBusy(''); setError(/nominee/.test(error.message) ? 'Run migration 032 in Supabase to record nominees.' : error.message); return }
    }
    setRows(prev => prev.map(r => (list.some(x => key(x) === key(r)) ? { ...r, nominee } : r)))
    setDraft(d => { const n = { ...d }; for (const r of list) delete n[key(r)]; return n })
    setBusy(''); router.refresh()
  }

  const insight = !ready ? 'Run migration 032 in Supabase to keep a record of nominees for every account, investment and policy.'
    : !rows.length ? 'Add your accounts and investments first — then record who the nominee is on each.'
    : set === rows.length ? `All ${rows.length} have a nominee recorded. Check them once a year, and after a marriage, birth or death in the family.`
    : `${rows.length - set} of ${rows.length} have no nominee recorded. Without one, family has to prove their claim with legal papers — slow and hard from India.`

  return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <PageHeader title="Nominees" sub="Who gets each account, investment and policy — make it easy for your family" />
      <InsightBar text={insight} prompt="Explain nominees vs a will for an NRI with accounts in India and the UAE, and what I should set up." />
      {error && <div className="rounded-xl px-4 py-2.5 text-[12.5px]" style={{ background: '#FDECE8', color: '#B4231A' }}>{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-3.5 md:gap-4 items-start">
        <section className="wl-card px-5 py-5 flex flex-col items-center gap-3 text-center">
          <Ring pct={pct} size={120} stroke={4} color={pct >= 100 ? 'var(--pos)' : '#F29A2E'} label="Nominees recorded">
            <span className="text-[24px] font-bold leading-none" style={{ color: 'var(--text)' }}>{set}/{rows.length}</span>
            <span className="text-[10.5px] mt-1" style={{ color: 'var(--text3)' }}>recorded</span>
          </Ring>
          <p className="text-[12.5px] leading-snug" style={{ color: 'var(--text3)' }}>
            Record here who you’ve named. Register the nominee itself in net banking, with the fund house (CAMS / KFintech) or the insurer.
          </p>
          <ul className="text-left text-[12px] leading-snug flex flex-col gap-1.5 w-full" style={{ color: 'var(--text2)' }}>
            <li>• <b>Nominee</b> = who can claim quickly. <b>Will</b> = who finally gets it. Have both.</li>
            <li>• UAE accounts: non-Muslims can register a will with the DIFC or Abu Dhabi courts — otherwise UAE rules can apply.</li>
            <li>• Shares and mutual funds: up to 10 nominees, with shares in %.</li>
          </ul>
        </section>

        <div className="flex flex-col gap-3 min-w-0">
          <KpiGrid>
            <KpiTile label="Recorded" value={String(set)} tint={1} icon={UserCheck} tone="good" />
            <KpiTile label="Missing" value={String(rows.length - set)} tint={2} icon={UserX} tone={rows.length - set ? 'bad' : 'good'} />
            <KpiTile label="Everything" value={String(rows.length)} tint={0} icon={ListChecks} />
            <KpiTile label="Done" value={`${Math.round(pct)}%`} tint={3} icon={UserCheck} />
          </KpiGrid>
          <div className="flex flex-wrap items-center gap-2.5">
            <Segmented label="Show" value={show} onChange={setShow} options={[{ value: 'missing', label: `Missing · ${rows.length - set}` }, { value: 'all', label: `All · ${rows.length}` }]} />
            {ready && rows.length - set > 1 && (
              <span className="flex items-center gap-2 text-[12.5px]" style={{ color: 'var(--text2)' }}>
                Fill all missing with
                <input list="wl-nominee-names" value={bulk} onChange={e => setBulk(e.target.value)} placeholder="Name" className="wl-input" style={{ height: 34, width: 150 }} aria-label="Nominee for all missing" />
                <button onClick={() => save(rows.filter(r => !r.nominee), bulk)} disabled={!bulk.trim() || busy === 'bulk'} className="wl-btn wl-btn-primary disabled:opacity-60" style={{ height: 34 }}>{busy === 'bulk' ? 'Saving…' : 'Apply'}</button>
              </span>
            )}
          </div>
          <datalist id="wl-nominee-names">{names.map(n => <option key={n} value={n} />)}</datalist>
          {groups.length === 0 ? (
            <div className="wl-card px-5 py-8 text-center text-[13px]" style={{ color: 'var(--text3)' }}>{rows.length ? '✓ Nothing missing.' : 'Nothing to show yet.'}</div>
          ) : groups.map(g => (
            <section key={g.label} className="wl-card px-4 md:px-5 py-3">
              <h2 className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{g.label} <span style={{ color: 'var(--text4)' }}>· {g.rows.length}</span></h2>
              <ul className="mt-1">
                {g.rows.map(r => {
                  const k = key(r), val = draft[k] ?? r.nominee ?? ''
                  return (
                    <li key={k} className="flex items-center gap-3 py-2" style={{ borderTop: '1px solid var(--track)' }}>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13px] font-medium truncate" style={{ color: 'var(--text)' }}>{r.name}</span>
                        <span className="block text-[11px]" style={{ color: r.nominee ? 'var(--pos-text)' : 'var(--amber-text)' }}>{r.nominee ? `✓ ${r.nominee}` : 'No nominee recorded'} · {r.currency === 'AED' ? 'UAE' : 'India'}</span>
                      </span>
                      <input list="wl-nominee-names" value={val} onChange={e => setDraft(d => ({ ...d, [k]: e.target.value }))} placeholder="Nominee" disabled={!ready}
                        className="wl-input flex-shrink-0" style={{ height: 34, width: 140 }} aria-label={`Nominee for ${r.name}`} />
                      <button onClick={() => save([r], val)} disabled={!ready || busy === k || val === (r.nominee ?? '')} className="wl-btn flex-shrink-0 disabled:opacity-50" style={{ height: 34 }}>{busy === k ? '…' : 'Save'}</button>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
