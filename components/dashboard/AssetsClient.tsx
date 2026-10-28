'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Home, Landmark, Scale, Boxes, RefreshCw, Plus, Briefcase } from 'lucide-react'
import { useViewStore } from '@/store/viewStore'
import { createClient } from '@/lib/supabase/client'
import { fmtMoney, fmtCompact } from '@/lib/format'
import { fmtDay } from '@/lib/insights'
import { viewAmount } from '@/lib/netWorth'
import { OTHER_KINDS, otherKind, otherAssetValue, gratuityValue, type Gratuity } from '@/lib/otherAssets'
import { PageHeader, InsightBar, KpiTile, KpiGrid, Panel } from '@/components/ui/kit'
import AssetSheet from '@/components/forms/AssetSheet'

const yearsAgo = (d: string, today: string) => (Date.parse(today) - Date.parse(d)) / (365.25 * 864e5)
const addMonth = (d: string) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCMonth(x.getUTCMonth() + 1); return x.toISOString().slice(0, 10) }

// Property & assets (design v2): everything you own that has no page of its
// own — homes and land (with the loan on them), vehicles, jewellery, global /
// UAE investments, ESOPs, crypto — and UAE gratuity. All of it counts in net
// worth; estimates are labelled as yours.
export default function AssetsClient({ today, assets, ready, gratuity, loans }: {
  today: string; assets: any[]; ready: boolean; gratuity: Gratuity | null; loans: any[]
}) {
  const router = useRouter()
  const { view, fxRate: FX } = useViewStore()
  const cur = view === 'uae' ? 'AED' : 'INR'
  const short = (n: number) => fmtCompact(n, cur)
  const inView = (c: string) => view === 'consolidated' || (view === 'uae' ? c !== 'INR' : c === 'INR')
  const [sheet, setSheet] = useState<{ asset?: any; defaults?: Record<string, any> } | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [grat, setGrat] = useState<Gratuity>({ basic: Number(gratuity?.basic) || 0, joined: gratuity?.joined ?? '', include: gratuity?.include !== false })

  // Each asset's value in the view's money
  const rows = useMemo(() => assets.filter(a => inView(a.currency)).map(a => {
    const v = otherAssetValue(a, today), k = otherKind(a.kind)
    const loan = a.loan_id ? loans.find(l => l.id === a.loan_id) : null
    return { a, k, ...v, shown: viewAmount(v.value, v.currency, view, FX), owed: loan ? viewAmount(Number(loan.outstanding_amt) || 0, loan.currency ?? 'INR', view, FX) : 0, loan }
  }), [assets, loans, view, FX, today]) // eslint-disable-line react-hooks/exhaustive-deps
  const property = rows.filter(r => r.k.group === 'property'), investments = rows.filter(r => r.k.priced), things = rows.filter(r => r.k.group !== 'property' && !r.k.priced)
  const sum = (xs: typeof rows, f: (r: typeof rows[number]) => number) => xs.reduce((s, r) => s + f(r), 0)
  const propVal = sum(property, r => r.shown), owed = sum(property, r => r.owed)
  const gratAed = grat.include === false ? 0 : gratuityValue(grat, today)
  const gratShown = inView('AED') ? viewAmount(gratAed, 'AED', view, FX) : 0
  const otherVal = sum(investments, r => r.shown) + sum(things, r => r.shown) + gratShown

  // Home loans with no home recorded against them
  const linked = new Set(assets.map(a => a.loan_id).filter(Boolean))
  const unhomed = loans.filter(l => (l.loan_type ?? 'home_loan') === 'home_loan' && !linked.has(l.id) && inView(l.currency ?? 'INR'))
  const stale = property.filter(r => r.a.value_as_of && yearsAgo(r.a.value_as_of, today) > 1)

  async function refreshPrices() {
    setBusy('prices'); setError('')
    const supabase = createClient()
    let n = 0
    for (const r of investments.filter(r => r.a.symbol)) {
      try {
        const res = await fetch(`/api/stock-price?symbol=${encodeURIComponent(r.a.symbol)}&exact=1`)
        const q = await res.json()
        const want = r.a.currency === 'USD' ? 'USD' : r.a.currency
        if (!(q?.price > 0) || (q.currency && q.currency !== want)) continue
        await supabase.from('other_assets').update({ price: q.price, current_value: q.price * (Number(r.a.units) || 0), value_as_of: today }).eq('id', r.a.id)
        n++
      } catch {}
    }
    setBusy('')
    if (!n) setError('No prices updated — check the tickers (as on Yahoo Finance, e.g. AAPL, VWRA.L, BTC-USD) and that the currency matches.')
    router.refresh()
  }
  async function saveGratuity() {
    setBusy('grat'); setError('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('investor_profile').upsert({ user_id: user!.id, gratuity: grat, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    setBusy('')
    if (error) setError(/investor_profile/.test(error.message) ? 'Run migration 032 in Supabase to save gratuity.' : error.message); else router.refresh()
  }

  const insight = !ready ? 'Run migration 032 in Supabase to add your home, land, car, jewellery and investments held abroad — they’ll count in your net worth.'
    : !rows.length && !gratAed ? 'Your home loan counts as debt, but the home it bought doesn’t count yet. Add your property, car, jewellery and investments held abroad so your net worth is complete.'
    : [propVal > 0 && `Property worth about ${short(propVal)}${owed > 0 ? `, ${short(owed)} still owed on it — your share is ${short(propVal - owed)} (${Math.round(owed / propVal * 100)}% borrowed)` : ', fully yours'}.`,
       otherVal > 0 && `Other assets ${short(otherVal)}${gratShown > 0 ? `, including ${short(gratShown)} of UAE gratuity` : ''}.`,
       'Estimates are yours — update them once a year.'].filter(Boolean).join(' ')

  const row = (r: typeof rows[number]) => (
    <li key={r.a.id}>
      <button onClick={() => setSheet({ asset: r.a })} className="w-full flex items-center gap-3 py-2.5 text-left" style={{ borderTop: '1px solid var(--track)' }}>
        <span className="w-9 h-9 rounded-xl flex items-center justify-center text-[17px] flex-shrink-0" style={{ background: 'var(--bg2)' }}>{r.k.icon}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-[13.5px] font-semibold truncate" style={{ color: 'var(--text)' }}>{r.a.name}</span>
          <span className="block text-[11.5px] truncate" style={{ color: 'var(--text4)' }}>
            {r.k.priced ? `${Number(r.a.units).toLocaleString('en-US')} × ${r.a.currency === 'USD' ? '$' : r.a.currency === 'AED' ? 'AED ' : '₹'}${Number(r.a.price || 0).toLocaleString('en-US')}${r.a.platform ? ` · ${r.a.platform}` : ''}${r.a.value_as_of ? ` · ${fmtDay(r.a.value_as_of)}` : ''}`
              : `${r.k.label} · your estimate${r.a.value_as_of ? `, ${fmtDay(r.a.value_as_of)} ${String(r.a.value_as_of).slice(0, 4)}` : ''}${Number(r.a.growth_pct) ? ` · ${Number(r.a.growth_pct) > 0 ? '+' : ''}${r.a.growth_pct}%/yr` : ''}`}
            {r.a.kind === 'esop' && Number(r.a.unvested_units) > 0 ? ` · +${r.a.unvested_units} unvested${r.a.next_vest_date ? ` (next ${fmtDay(r.a.next_vest_date)})` : ''}, not counted yet` : ''}
          </span>
          {r.loan && <span className="block text-[11.5px] mt-0.5" style={{ color: 'var(--text3)' }}>{r.loan.name}: {short(r.owed)} owed · your share <b style={{ color: 'var(--text)' }}>{short(Math.max(0, r.shown - r.owed))}</b></span>}
        </span>
        <span className="text-right flex-shrink-0">
          <span className="block text-[14px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{short(r.shown)}</span>
          {r.k.priced && r.cost > 0 && r.cost !== r.value && <span className="block text-[11px] tabular-nums" style={{ color: r.value >= r.cost ? 'var(--pos-text)' : '#DC2626' }}>{r.value >= r.cost ? '+' : '−'}{Math.round(Math.abs(r.value - r.cost) / r.cost * 100)}%</span>}
        </span>
      </button>
    </li>
  )

  return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">
      <PageHeader title="Property & assets" sub="Homes, land, vehicles, jewellery and investments held elsewhere — all part of your net worth" onAdd={ready ? () => setSheet({}) : undefined} addLabel="Add asset"
        actions={ready ? <button onClick={() => setSheet({})} className="wl-btn wl-btn-primary" style={{ height: 36 }}><Plus size={14} />Add asset</button> : undefined} />
      <InsightBar text={insight} prompt={`Look at my property and other assets and tell me what to watch. Property ${short(propVal)}, owed ${short(owed)}, other ${short(otherVal)}.`} />
      {error && <div className="rounded-xl px-4 py-2.5 text-[12.5px]" style={{ background: '#FDECE8', color: '#B4231A' }}>{error}</div>}

      <KpiGrid>
        <KpiTile label="Property" value={short(propVal)} tint={0} icon={Home} delta={property.length ? `${property.length} home${property.length === 1 ? '' : 's'} & plot${property.length === 1 ? '' : 's'} · your estimates` : 'Nothing added yet'} />
        <KpiTile label="Owed on it" value={short(owed)} tint={2} icon={Landmark} delta={owed > 0 ? 'Loans linked to property' : 'No linked loans'} />
        <KpiTile label="Your share" value={short(Math.max(0, propVal - owed))} tint={1} icon={Scale} tone={propVal > 0 ? 'good' : 'neutral'} delta={propVal > 0 ? `${Math.round((propVal - owed) / propVal * 100)}% of its value is yours` : '—'} />
        <KpiTile label="Other assets" value={short(otherVal)} tint={3} icon={Boxes} delta="Investments abroad, vehicles, jewellery, gratuity" />
      </KpiGrid>

      {(unhomed.length > 0 || stale.length > 0) && ready && (
        <section className="wl-card px-4 md:px-5 py-3.5">
          <h2 className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>Needs you</h2>
          <ul className="mt-1">
            {unhomed.map(l => (
              <li key={l.id} className="flex items-start gap-3 py-2.5" style={{ borderTop: '1px solid var(--track)' }}>
                <span className="text-[18px]">🏠</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{l.name} counts as debt — add the home it bought</span>
                  <span className="block text-[12px]" style={{ color: 'var(--text3)' }}>{fmtMoney(Number(l.outstanding_amt) || 0, l.currency ?? 'INR')} owed is in your net worth; the home isn’t yet{Number(l.property_cost) > 0 ? ` (bought for ${fmtMoney(Number(l.property_cost), l.currency ?? 'INR')})` : ''}.</span>
                </span>
                <button onClick={() => setSheet({ defaults: { kind: 'property', name: String(l.name ?? 'Home').replace(/\s*(home\s*)?loan\s*/i, ' ').trim() || 'Home', currency: l.currency ?? 'INR', current_value: Number(l.property_cost) || undefined, purchase_price: Number(l.property_cost) || undefined, loan_id: l.id } })}
                  className="wl-btn flex-shrink-0" style={{ height: 30, fontSize: 12 }}>Add home</button>
              </li>
            ))}
            {stale.map(r => (
              <li key={r.a.id} className="flex items-start gap-3 py-2.5" style={{ borderTop: '1px solid var(--track)' }}>
                <span className="text-[18px]">🗓️</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-semibold" style={{ color: 'var(--text)' }}>Update what {r.a.name} is worth</span>
                  <span className="block text-[12px]" style={{ color: 'var(--text3)' }}>Last set {fmtDay(r.a.value_as_of)} {String(r.a.value_as_of).slice(0, 4)} — check recent prices nearby.</span>
                </span>
                <button onClick={() => setSheet({ asset: r.a })} className="wl-btn flex-shrink-0" style={{ height: 30, fontSize: 12 }}>Update</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 md:gap-4 items-start">
        <div className="flex flex-col gap-3.5 md:gap-4 min-w-0">
          <Panel title="Property & land" right={ready ? <button onClick={() => setSheet({ defaults: { kind: 'property' } })} className="text-[12px] font-semibold flex items-center gap-1" style={{ color: 'var(--accent)' }}><Plus size={13} />Add</button> : undefined}>
            {property.length ? <ul className="mt-1">{property.map(row)}</ul>
              : <p className="text-[12.5px] mt-2 leading-snug" style={{ color: 'var(--text3)' }}>Your flat in India, a plot, a home in the UAE. Link the loan on it to see how much is really yours.</p>}
          </Panel>
          <Panel title="Investments held elsewhere" right={investments.some(r => r.a.symbol) ? <button onClick={refreshPrices} disabled={busy === 'prices'} className="text-[12px] font-semibold flex items-center gap-1 disabled:opacity-60" style={{ color: 'var(--accent)' }}><RefreshCw size={13} className={busy === 'prices' ? 'animate-spin' : ''} />Prices</button> : undefined}>
            {investments.length ? <ul className="mt-1">{investments.map(row)}</ul>
              : <p className="text-[12.5px] mt-2 leading-snug" style={{ color: 'var(--text3)' }}>US / global stocks and ETFs (Interactive Brokers, Stake), UAE investments (Sarwa, ADX/DFM), ESOPs and RSUs, crypto. Add a ticker and prices refresh with one tap.</p>}
          </Panel>
        </div>
        <div className="flex flex-col gap-3.5 md:gap-4">
          <Panel title="UAE gratuity" right={<Briefcase size={15} style={{ color: 'var(--text4)' }} />}>
            <p className="text-[12px] mt-1.5 leading-snug" style={{ color: 'var(--text3)' }}>End-of-service pay grows with every month you work — 21 days’ basic a year for 5 years, 30 days after, up to 2 years’ basic.</p>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <label className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text3)' }}>Basic salary / month
                <input value={grat.basic || ''} onChange={e => setGrat(g => ({ ...g, basic: Number(e.target.value.replace(/[^0-9.]/g, '')) || 0 }))} inputMode="decimal" placeholder="AED 12000" className="wl-input w-full mt-1.5 normal-case tracking-normal" style={{ height: 40 }} />
              </label>
              <label className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text3)' }}>Joined
                <input type="date" value={grat.joined} onChange={e => setGrat(g => ({ ...g, joined: e.target.value }))} className="wl-input w-full mt-1.5" style={{ height: 40 }} />
              </label>
            </div>
            <label className="flex items-center gap-2 text-[12.5px] mt-2.5 cursor-pointer" style={{ color: 'var(--text2)' }}>
              <input type="checkbox" checked={grat.include !== false} onChange={e => setGrat(g => ({ ...g, include: e.target.checked }))} className="accent-[var(--accent)] w-4 h-4" />Count it in my net worth
            </label>
            <div className="flex items-center justify-between gap-3 mt-3 rounded-xl px-3.5 py-2.5" style={{ background: 'var(--bg2)' }}>
              <span>
                <span className="block text-[18px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{fmtMoney(gratuityValue(grat, today), 'AED')}</span>
                <span className="block text-[11.5px]" style={{ color: 'var(--text3)' }}>{grat.basic && grat.joined ? (gratuityValue(grat, today) > 0 ? `+${fmtMoney(gratuityValue(grat, addMonth(today)) - gratuityValue(grat, today), 'AED')} a month · estimate, basic salary only` : 'Under a year of service — none is due yet') : 'Enter your basic salary and joining date'}</span>
              </span>
              <button onClick={saveGratuity} disabled={busy === 'grat' || !ready} className="wl-btn wl-btn-primary flex-shrink-0 disabled:opacity-60" style={{ height: 34 }}>{busy === 'grat' ? 'Saving…' : 'Save'}</button>
            </div>
          </Panel>
          <Panel title="Vehicles, jewellery & other">
            {things.length ? <ul className="mt-1">{things.map(row)}</ul>
              : <p className="text-[12.5px] mt-2 leading-snug" style={{ color: 'var(--text3)' }}>Your car (its resale value), gold jewellery at home, a business share, money you lent someone.</p>}
          </Panel>
          {ready && !rows.length && (
            <div className="flex flex-wrap gap-1.5">
              {OTHER_KINDS.map(k => <button key={k.key} onClick={() => setSheet({ defaults: { kind: k.key, currency: k.key === 'us_stocks' || k.key === 'crypto' ? 'USD' : undefined } })} className="wl-chip" style={{ height: 32 }}><span>{k.icon}</span>{k.label}</button>)}
            </div>
          )}
        </div>
      </div>

      {sheet && <AssetSheet asset={sheet.asset} defaults={sheet.defaults} loans={loans} onClose={() => setSheet(null)} onSaved={() => { setSheet(null); router.refresh() }} />}
    </div>
  )
}
