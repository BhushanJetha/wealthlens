'use client'
import Link from 'next/link'
import { ChevronRight, Timer, Globe2, ShieldCheck } from 'lucide-react'
import { fmtCompact } from '@/lib/format'
import { Panel } from '@/components/ui/kit'

export interface Overview {
  needs: { id: string; icon: string; tone: 'warn' | 'info' | 'good'; title: string; detail: string; href: string }[]
  access: { key: string; label: string; sub: string; color: string; value: number; count: number; top: string[] }[]
  currency: { aed: number; inr: number; total: number; aedPct: number; inrPct: number }
  returnPlan: string | null
  protection: { gap: number; cover: number; need: number; dependents: number; health: { amount: number; count: number } }
  nominees: { missing: number; total: number; ready: boolean }
  keepInr: number
}

// Wealth overview's "Needs you" — maturities, premiums, missing nominees,
// idle cash, a drifting mix, the home a loan bought, and the review
export function WealthNeeds({ needs }: { needs: Overview['needs'] }) {
  if (!needs.length) return null
  return (
    <section className="wl-card px-4 md:px-5 py-3.5 md:py-4">
      <h2 className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Needs you</h2>
      <ul className="mt-1.5">
        {needs.map(n => (
          <li key={n.id}>
            <Link href={n.href} className="flex items-start gap-3 py-2.5" style={{ borderTop: '1px solid var(--track)' }}>
              <span className="text-[18px] leading-none mt-0.5">{n.icon}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-semibold" style={{ color: n.tone === 'warn' ? 'var(--amber-text)' : n.tone === 'good' ? 'var(--pos-text)' : 'var(--text)' }}>{n.title}</span>
                <span className="block text-[12px] mt-px" style={{ color: 'var(--text3)' }}>{n.detail}</span>
              </span>
              <ChevronRight size={16} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--text4)' }} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

// How quickly your money can be reached, the AED / ₹ split (with what a 10%
// fall in the rupee would do), and protection — in the view's currency
export function WealthPanels({ o, view, fx }: { o: Overview; view: string; fx: number }) {
  const cur = view === 'uae' ? 'AED' : 'INR'
  const show = (inr: number) => fmtCompact(view === 'uae' ? inr / fx : inr, cur)
  const total = o.access.reduce((s, a) => s + a.value, 0)
  const reachable = o.access.filter(a => a.key === 'now' || a.key === 'week').reduce((s, a) => s + a.value, 0)
  const c = o.currency
  const rupeeHit = c.inr / fx * 0.1   // in AED, if ₹ falls 10%
  const staying = o.returnPlan === 'no' || o.returnPlan === 'later'
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5 md:gap-4 items-start">
      <Panel title={<span className="flex items-center gap-1.5"><Timer size={15} style={{ color: 'var(--accent)' }} />How quickly you can reach it</span>}>
        <div className="flex h-3 rounded-full overflow-hidden gap-[2px] mt-3" role="img" aria-label={o.access.map(a => `${a.label} ${show(a.value)}`).join(', ')}>
          {o.access.filter(a => a.value > 0).map(a => <div key={a.key} style={{ width: `${a.value / (total || 1) * 100}%`, background: a.color }} />)}
        </div>
        <ul className="mt-2.5 flex flex-col gap-2">
          {o.access.map(a => (
            <li key={a.key} className="text-[12.5px]">
              <div className="flex justify-between gap-2">
                <span style={{ color: 'var(--text2)' }}><i className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: a.color }} />{a.label}</span>
                <span className="font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{show(a.value)}</span>
              </div>
              <div className="text-[11px] pl-3.5 truncate" style={{ color: 'var(--text4)' }}>{a.top.length ? a.top.join(', ') : a.sub}</div>
            </li>
          ))}
        </ul>
        <p className="text-[11.5px] mt-2.5 leading-snug" style={{ color: 'var(--text3)' }}>
          {show(reachable)} can be yours within a week without breaking anything{o.keepInr > 0 ? `; keep ${show(o.keepInr)} of it as your emergency fund` : ''}.{' '}
          <Link href="/dashboard/portfolio/need-money" className="font-semibold" style={{ color: 'var(--accent)' }}>Need money?</Link>
        </p>
      </Panel>

      <Panel title={<span className="flex items-center gap-1.5"><Globe2 size={15} style={{ color: 'var(--accent)' }} />Dirhams or rupees</span>}>
        <div className="flex h-3 rounded-full overflow-hidden gap-[2px] mt-3" role="img" aria-label={`AED ${Math.round(c.aedPct)}%, rupees ${Math.round(c.inrPct)}%`}>
          {c.aedPct > 0 && <div style={{ width: `${c.aedPct}%`, background: '#2a78d6' }} />}
          {c.inrPct > 0 && <div style={{ width: `${c.inrPct}%`, background: '#eb6834' }} />}
        </div>
        <div className="flex justify-between text-[12.5px] mt-2">
          <span style={{ color: 'var(--text2)' }}><i className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: '#2a78d6' }} />In dirhams <b style={{ color: 'var(--text)' }}>{Math.round(c.aedPct)}%</b></span>
          <span style={{ color: 'var(--text2)' }}><i className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: '#eb6834' }} />In rupees <b style={{ color: 'var(--text)' }}>{Math.round(c.inrPct)}%</b></span>
        </div>
        <p className="text-[12px] mt-2.5 leading-snug" style={{ color: 'var(--text2)' }}>
          If the rupee falls 10% against the dirham, your rupee holdings are worth about <b>{fmtCompact(rupeeHit, 'AED')}</b> less in dirhams.
        </p>
        <p className="text-[11.5px] mt-1.5 leading-snug" style={{ color: 'var(--text3)' }}>
          {o.returnPlan === 'soon' || o.returnPlan === 'india' ? 'You plan to spend it in India, so rupee holdings are the right home for most of it.'
            : staying ? 'You plan to stay abroad — the rupee has lost about 2–4% a year against the dirham over the long run, so keep some growth money outside rupees too.'
            : 'Where you’ll spend the money decides the right split — answer “Do you plan to move back?” in your profile.'}
        </p>
      </Panel>

      <Panel title={<span className="flex items-center gap-1.5"><ShieldCheck size={15} style={{ color: 'var(--accent)' }} />Is it protected?</span>}>
        <ul className="mt-2 flex flex-col gap-2 text-[12.5px]">
          <li className="flex justify-between gap-2">
            <span style={{ color: 'var(--text2)' }}>Life cover</span>
            <span className="font-semibold text-right" style={{ color: o.protection.gap > 0 && o.protection.dependents > 0 ? 'var(--amber-text)' : 'var(--pos-text)' }}>
              {o.protection.dependents === 0 ? (o.protection.cover > 0 ? `${show(o.protection.cover)}` : 'No one depends on you') : o.protection.gap > 0 ? `${show(o.protection.gap)} short` : `✓ ${show(o.protection.cover)}`}
            </span>
          </li>
          <li className="flex justify-between gap-2">
            <span style={{ color: 'var(--text2)' }}>Health cover</span>
            <span className="font-semibold" style={{ color: o.protection.health.count ? 'var(--text)' : 'var(--amber-text)' }}>{o.protection.health.count ? `${show(o.protection.health.amount)} · ${o.protection.health.count} polic${o.protection.health.count === 1 ? 'y' : 'ies'}` : 'None recorded'}</span>
          </li>
          <li className="flex justify-between gap-2">
            <span style={{ color: 'var(--text2)' }}>Nominees</span>
            <span className="font-semibold" style={{ color: o.nominees.ready && o.nominees.missing ? 'var(--amber-text)' : 'var(--text)' }}>{!o.nominees.ready ? 'Run migration 032' : o.nominees.missing ? `${o.nominees.missing} of ${o.nominees.total} missing` : `✓ All ${o.nominees.total} set`}</span>
          </li>
        </ul>
        <div className="flex gap-3 mt-3 text-[12px] font-semibold">
          <Link href="/dashboard/insurance" style={{ color: 'var(--accent)' }}>Insurance</Link>
          <Link href="/dashboard/nominees" style={{ color: 'var(--accent)' }}>Nominees</Link>
        </div>
      </Panel>
    </div>
  )
}
