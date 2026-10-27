'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { PiggyBank, Landmark, BadgePercent, CalendarClock } from 'lucide-react'
import { localToday } from '@/lib/insights'
import { planTax, taxSuggestions, LIMITS, type TaxInput } from '@/lib/tax'
import { fmtMoney, fmtCompact } from '@/lib/format'
import { PageHeader, InsightBar, AiActions, LearnStrip, KpiTile, Panel, ProgressRow, Segmented, PALETTE } from '@/components/ui/kit'

// Marginal slab + 4% health & education cess
const SLABS = { '5': 0.052, '20': 0.208, '30': 0.312 } as const
type Slab = keyof typeof SLABS

// Tax planner (design v2): India, old regime. Deductions come from the
// holdings you've added; all figures are estimates, not tax advice.
export default function TaxClient({ input }: { input: TaxInput }) {
  const [today, setToday] = useState('')
  const [slab, setSlab] = useState<Slab>('30')
  useEffect(() => { setToday(localToday()) }, [])

  const money = (n: number) => fmtMoney(n, 'INR')
  const short = (n: number) => fmtCompact(n, 'INR')
  const p = useMemo(() => planTax(input, today || localToday()), [input, today])
  const rate = SLABS[slab]
  const sugg = taxSuggestions(p, rate, short)
  const saved = Math.round(p.deductions * rate)
  const c80Room = LIMITS.c80 - p.claim.c80
  const monthly = Math.ceil(c80Room / p.monthsLeft / 100) * 100
  const c80Lines = p.lines.filter(l => l.section === '80C').sort((a, b) => b.amount - a.amount)
  const linesOf = (s: string) => p.lines.filter(l => l.section === s).map(l => l.name).join(', ')

  const sections = [
    { k: '80C', name: '80C', sub: 'ELSS, PPF, EPF, life cover, home-loan principal, tagged fees', used: p.claim.c80, raw: p.raw.c80, limit: LIMITS.c80 },
    { k: '80CCD(1B)', name: '80CCD(1B)', sub: 'NPS Tier I, extra', used: p.claim.ccd1b, raw: p.raw.ccd1b, limit: LIMITS.ccd1b },
    { k: '80D', name: '80D', sub: 'Health cover, self & family', used: p.claim.d80, raw: p.raw.d80, limit: LIMITS.d80 },
    { k: '80D parents', name: '80D', sub: 'Parents', used: p.claim.d80p, raw: p.raw.d80p, limit: LIMITS.d80 },
    { k: '24(b)', name: '24(b)', sub: 'Home-loan interest', used: p.claim.b24, raw: p.raw.b24, limit: LIMITS.b24 },
  ]

  const counted = p.lines.map(l => `${l.name} ${money(l.amount)} (${l.section}, ${l.basis.toLowerCase()})`).join('; ')
  const insight = c80Room > 0
    ? `You have ${short(c80Room)} of 80C room left and ${p.daysLeft} days until 31 March. About ${money(monthly)} a month into ${p.hasElss ? 'your ELSS fund' : 'an ELSS fund'} fills it.`
    : `Your 80C limit is full for ${p.fy.label}.${LIMITS.ccd1b - p.claim.ccd1b > 0 ? ` NPS can still take ${short(LIMITS.ccd1b - p.claim.ccd1b)} more under 80CCD(1B).` : ''}`

  return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <PageHeader title="Tax planner" sub={`India · ${p.fy.label} · old regime · built from what you've added`}
        actions={<Link href="/dashboard/investments" className="wl-btn" style={{ height: 34 }}>Add investment</Link>} />

      <InsightBar text={insight} prompt={`Explain my India tax-saving position for ${p.fy.label} (old regime, estimates). Counted: ${counted || 'nothing yet'}. 80C room left ${money(c80Room)}, ${p.daysLeft} days to 31 March.`} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-3.5">
        <KpiTile label="80C planned" value={short(p.claim.c80)} tint={0} icon={PiggyBank}
          delta={`of ₹1.5L · ${Math.round(p.claim.c80 / LIMITS.c80 * 100)}% used`} />
        <KpiTile label="NPS · 80CCD(1B)" value={short(p.claim.ccd1b)} tint={3} icon={Landmark} delta="of ₹50K" />
        <KpiTile label="Tax saved (est.)" value={short(saved)} tint={1} icon={BadgePercent} tone="good" delta={`at the ${slab}% slab + cess`} />
        <KpiTile label="Days to 31 March" value={String(p.daysLeft)} tint={2} icon={CalendarClock} delta={`${p.fy.label} deadline`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-3.5 md:gap-4 items-start">
        <div className="flex flex-col gap-3.5 md:gap-4 min-w-0">
          <Panel title="Suggestions" right={<Segmented label="Your tax slab" value={slab} onChange={setSlab} options={[{ value: '5', label: '5%' }, { value: '20', label: '20%' }, { value: '30', label: '30%' }]} />}>
            <p className="text-[11.5px] mt-1" style={{ color: 'var(--text4)' }}>Pick your slab to see what each step saves.</p>
            {sugg.length === 0
              ? <p className="text-[12.5px] mt-3" style={{ color: 'var(--text3)' }}>Every deduction we track is full. Nice work.</p>
              : <div className="mt-1.5">
                {sugg.map((s, i) => {
                  const body = (
                    <div className="flex items-start gap-3 py-3" style={{ borderTop: i ? '1px solid var(--track)' : undefined }}>
                      <span className="mt-0.5 rounded-full px-2 py-0.5 text-[10.5px] font-semibold flex-shrink-0 whitespace-nowrap" style={{ background: 'var(--accent-bg)', color: 'var(--accent2)' }}>{s.section}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{s.title}</div>
                        <div className="text-[12px] leading-snug mt-0.5" style={{ color: 'var(--text3)' }}>{s.detail}</div>
                      </div>
                      {s.saves != null && (
                        <div className="text-right flex-shrink-0">
                          <div className="text-[10.5px]" style={{ color: 'var(--text4)' }}>saves up to</div>
                          <div className="text-[13px] font-bold tabular-nums" style={{ color: '#1E8F5F' }}>{short(s.saves)}</div>
                        </div>
                      )}
                    </div>
                  )
                  return s.href ? <Link key={s.key} href={s.href} className="block hover:opacity-90">{body}</Link> : <div key={s.key}>{body}</div>
                })}
              </div>}
          </Panel>

          <Panel title="Deductions by section">
            <div className="flex flex-col gap-3.5 mt-3">
              {sections.map((s, i) => (
                <div key={s.k}>
                  <ProgressRow name={s.name} sub={s.sub} value={short(s.used)} right={`of ${short(s.limit)}`} pct={s.used / s.limit * 100} color={PALETTE[i % PALETTE.length]} />
                  <div className="text-[11px] mt-1 truncate" style={{ color: 'var(--text4)' }}>
                    {s.raw > s.limit && <span style={{ color: '#B96A0B' }}>{short(s.raw - s.limit)} above the cap · </span>}
                    {linesOf(s.k) || 'Nothing counted yet'}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <div className="flex flex-col gap-3.5 md:gap-4 min-w-0">
          <Panel title="80C instruments">
            {c80Lines.length === 0
              ? <p className="text-[12.5px] mt-2 leading-normal" style={{ color: 'var(--text3)' }}>Nothing yet. Add an ELSS fund, PPF or EPF, LIC or term cover, or a home loan to see it counted here.</p>
              : <div className="flex flex-col gap-3 mt-3">
                {c80Lines.map((l, i) => (
                  <Link key={l.key} href={l.href} className="block hover:opacity-90">
                    <ProgressRow name={l.name} value={short(l.amount)} pct={l.amount / LIMITS.c80 * 100} color={PALETTE[i % PALETTE.length]} />
                    <div className="text-[11px] mt-1" style={{ color: 'var(--text4)' }}>{l.basis}</div>
                  </Link>
                ))}
              </div>}
          </Panel>

          <Panel title="Living in the UAE?">
            <p className="text-[12.5px] leading-normal mt-1.5" style={{ color: 'var(--text3)' }}>
              The UAE has no personal income tax. As a non-resident, India taxes only income earned in India, such as NRO interest, rent and capital gains.
              These deductions help only if you file in India under the old regime. NRIs can&apos;t open new PPF accounts or claim the 87A rebate.
            </p>
          </Panel>

          <Panel title="About these numbers">
            <p className="text-[12.5px] leading-normal mt-1.5" style={{ color: 'var(--text3)' }}>
              Estimates from the holdings you&apos;ve added, not tax advice. SIPs count as 12 instalments, and home-loan figures are worked out from your next 12 EMIs.
              The Income-tax Act, 2025 renumbers these sections from {p.fy.label} (80C is now section 123), so we use the familiar names. Check with a tax adviser before you file.
            </p>
          </Panel>
        </div>
      </div>

      <AiActions actions={['Old or new regime: which suits me?', 'Plan my 80C']}
        context={`India tax, ${p.fy.label}, estimates. Counted: ${counted || 'nothing yet'}. 80C room left ${money(c80Room)}; ${p.daysLeft} days to 31 March.`} />
      <LearnStrip title="Try the SIP calculator" href="/dashboard/learn/calculators?c=sip" />
    </div>
  )
}
