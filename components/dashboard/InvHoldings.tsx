'use client'
import { Pencil, Trash2, type LucideIcon } from 'lucide-react'
import { HeroStat, KpiTile, Bars, type Tone } from '@/components/ui/kit'
import { ListCard, ListRow, ListSearch } from '@/components/ui/list'
import { fmtDay } from '@/lib/insights'

// Body of every investment-type page (FD, RD, gold, bonds, NPS, LIC, ETF,
// PPF/EPF): headline number with a chart by holding (same card on desktop
// and phone), tiles, and the v2 holdings list with search + sort.

export interface InvItem {
  key: string; name: string; color: string           // hex
  sub?: string; tag?: string
  meta?: string; metaColor?: string
  value: number; valueText: string; valueSub?: string
  onEdit: () => void; onDelete: () => void
}
export interface InvTile { label: string; value: string; delta?: string; tone?: Tone; icon?: LucideIcon }

// "15 Sep 2027"
export const fullDate = (d?: string | null) => d ? `${fmtDay(d)} ${String(d).slice(0, 4)}` : '—'
export const pctText = (p: number) => `${p >= 0 ? '+' : ''}${p.toFixed(1)}%`
export const pctColor = (p: number) => p >= 0 ? '#16A34A' : '#DC2626'

const shortLabel = (s: string) => {
  const t = String(s).replace(/\s*[–-]\s*.*/, '').trim()
  return t.length > 12 ? `${t.slice(0, 11)}…` : t
}

export default function InvHoldings({ hero, tiles, items, totalCount, listTitle, head, chartLabel, emptyMsg,
  search, onSearch, searchPlaceholder = 'Search…', sort, onSort, sortOptions }: {
  hero: { label: string; value: string; delta?: string; tone?: Tone }
  tiles: InvTile[]; items: InvItem[]; totalCount: number
  listTitle: string; head: [string, string, string, string]; chartLabel: string; emptyMsg: string
  search?: string; onSearch?: (v: string) => void; searchPlaceholder?: string
  sort?: string; onSort?: (v: string) => void; sortOptions?: { value: string; label: string }[]
}) {
  const bars = [...items].sort((a, b) => b.value - a.value).slice(0, 8)
    .map(i => ({ label: shortLabel(i.name), value: i.value, hi: true, tip: `${i.name}: ${i.valueText}` }))

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-3.5 md:gap-4">
        <HeroStat label={hero.label} value={hero.value} delta={hero.delta} tone={hero.tone}>
          {bars.length > 1 && <Bars data={bars} className="h-[110px] md:h-auto md:flex-1 md:min-h-[150px] mt-3" label={`${chartLabel}: ${bars.map(b => b.tip).join(', ')}`} />}
        </HeroStat>
        <div className="grid grid-cols-2 lg:grid-cols-1 gap-2.5 md:gap-3.5 lg:content-start">
          {tiles.map((t, i) => (
            <KpiTile key={t.label} label={t.label} value={t.value} delta={t.delta} tone={t.tone} tint={(i + 1) % 4} icon={t.icon}
              className={tiles.length % 2 === 1 && i === tiles.length - 1 ? 'max-lg:col-span-2' : ''} />
          ))}
        </div>
      </div>

      <ListCard title={listTitle} sub={items.length === totalCount ? `${totalCount} ${totalCount === 1 ? 'entry' : 'entries'}` : `${items.length} of ${totalCount}`}
        head={head}
        toolbar={onSearch && (
          <ListSearch value={search ?? ''} onChange={onSearch} placeholder={searchPlaceholder}>
            {onSort && sortOptions && (
              <select value={sort} onChange={e => onSort(e.target.value)} aria-label="Sort"
                className="wl-input max-w-[44%]" style={{ width: 'auto', height: 36, background: '#fff' }}>
                {sortOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )}
          </ListSearch>
        )}
        empty={items.length === 0
          ? <div className="text-center py-12 px-6 text-[13px]" style={{ color: 'var(--text3)', borderTop: '1px solid var(--line)' }}>{emptyMsg}</div>
          : undefined}>
        {items.map(i => (
          <ListRow key={i.key} color={i.color} title={i.name} sub={i.sub} tag={i.tag} meta={i.meta} metaColor={i.metaColor}
            amount={i.valueText} amountSub={i.valueSub} onOpen={i.onEdit}
            actions={[
              { label: 'Edit', icon: Pencil, onClick: i.onEdit },
              { label: 'Delete', icon: Trash2, onClick: i.onDelete, danger: true },
            ]} />
        ))}
      </ListCard>
    </>
  )
}
