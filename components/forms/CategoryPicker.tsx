'use client'
import { useMemo, useState } from 'react'
import { Search, X, HelpCircle } from 'lucide-react'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { groupedCategories, groupOf, needOf, isGeneral, investKindOf, examplesOf, INVEST_KINDS, INVEST_KIND_ICON, type Category, type CatKind } from '@/lib/categories'
import CategoryGuide from './CategoryGuide'

// Pick a sub-category, grouped under its category (Food › Groceries…), with a
// search across both. The category comes with it — nothing else to choose.
// `extra`: chips that aren't categories (the card-bill shortcut), shown last.
// Investing is picked by kind (Mutual funds, FD…): Investment, with the kind
// as `sub` (lib/categories investKindOf).
export default function CategoryPicker({ rows, kind, value, onPick, extra, current, sub, merchant }: {
  rows: Category[]; kind: CatKind; value: string; onPick: (name: string, sub?: string) => void
  sub?: string; merchant?: string
  extra?: React.ReactNode
  current?: Category | null            // the saved name when it isn't in the list (an import)
}) {
  const [q, setQ] = useState('')
  const [guide, setGuide] = useState(false)
  const groups = useMemo(() => groupedCategories(rows, kind), [rows, kind])
  const query = q.trim().toLowerCase()
  const shown = query
    ? groups.map(g => ({ ...g, items: g.group.label.toLowerCase().includes(query) ? g.items
        : g.items.filter(c => c.name.toLowerCase().includes(query) || examplesOf(c.name, kind).toLowerCase().includes(query)
          || (c.name === 'Investment' && INVEST_KINDS.some(k => k.toLowerCase().includes(query)))) })).filter(g => g.items.length)
    : groups
  const picked = value ? groupOf(value, rows, kind) : null
  const need = kind === 'expense' && value ? needOf(value, rows) : null
  const investKind = value === 'Investment' ? investKindOf({ sub_category: sub, merchant }) : null
  const isInvest = (c: Category) => kind === 'expense' && c.name === 'Investment'

  const chip = (c: Category, label: string, asKind?: string) => {
    const on = value === c.name && (asKind == null || investKind === asKind)
    return (
      <button key={asKind ? `${c.id}:${asKind}` : c.id} type="button" role="radio" aria-checked={on} onClick={() => onPick(c.name, asKind)}
        className="inline-flex items-center gap-1.5 h-[34px] pl-1.5 pr-3 rounded-full text-[12.5px] transition-colors"
        style={on ? { background: c.color + '1A', boxShadow: `inset 0 0 0 1.5px ${c.color}`, color: c.color, fontWeight: 600 }
          : { background: '#fff', border: '1px solid var(--line)', color: 'var(--text2)', fontWeight: 500 }}>
        <span className="w-[22px] h-[22px] rounded-full flex items-center justify-center" style={{ background: c.color + (on ? '26' : '1A'), color: c.color }}><CategoryIcon icon={asKind ? INVEST_KIND_ICON[asKind as keyof typeof INVEST_KIND_ICON] : c.icon} size={12} /></span>
        {label}
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text4)' }} aria-hidden />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={kind === 'expense' ? 'Search: groceries, salik, school…' : 'Search: salary, interest…'}
          aria-label="Search categories" className="wl-input w-full" style={{ height: 38, fontSize: 13.5, paddingLeft: 32, paddingRight: q ? 34 : 12 }} />
        {q && <button type="button" onClick={() => setQ('')} aria-label="Clear search" className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg" style={{ color: 'var(--text3)' }}><X size={14} /></button>}
      </div>
      {value && (
        <div className="text-[12px] -mt-0.5 flex items-start justify-between gap-2" style={{ color: 'var(--text3)' }}>
          <span className="min-w-0">
          {picked ? <><b style={{ color: 'var(--text2)' }}>{picked.label}</b>{isGeneral(value) ? '' : <> › {investKind ?? value}</>}</> : <b style={{ color: 'var(--text2)' }}>{value}</b>}
          {need != null && <> · counts as a <b style={{ color: need ? '#1D5FA8' : '#9A3412' }}>{need ? 'need' : 'want'}</b></>}
          {kind === 'income' && value === 'Refund' && <> · money back, not counted as income</>}
          {examplesOf(value, kind) && <span className="block" style={{ color: 'var(--text4)' }}>{examplesOf(value, kind)}</span>}
          </span>
          <button type="button" onClick={() => setGuide(true)} className="inline-flex items-center gap-1 font-semibold flex-shrink-0 whitespace-nowrap" style={{ color: 'var(--accent2)' }}><HelpCircle size={12} />What goes where?</button>
        </div>
      )}
      {!value && <button type="button" onClick={() => setGuide(true)} className="self-start inline-flex items-center gap-1 text-[12px] font-semibold -mt-0.5" style={{ color: 'var(--accent2)' }}><HelpCircle size={12} />What goes where?</button>}
      {guide && <CategoryGuide rows={rows} initialKind={kind} onClose={() => setGuide(false)} onPick={(n, k) => { if (k === kind) { onPick(n); setQ('') } }} />}
      <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-0.5 -mr-0.5" role="radiogroup" aria-label="Category">
        {current && !query && (
          <div className="flex flex-wrap gap-1.5 items-center"><span className="text-[11px] font-semibold uppercase tracking-[0.05em] w-full" style={{ color: 'var(--text3)' }}>Saved as</span>{chip(current, current.name)}</div>
        )}
        {shown.map(({ group, items }) => (
          <div key={group.key} className="flex flex-col gap-1.5">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text3)' }}>
              <i className="w-2 h-2 rounded-sm" style={{ background: group.color }} />{group.label}{!group.spending && kind === 'expense' ? <span className="normal-case tracking-normal font-normal"> · not spending</span> : null}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {items.flatMap(c => isInvest(c) ? INVEST_KINDS.map(k => chip(c, k, k))
                : [chip(c, isGeneral(c.name) && items.length > 1 ? `${group.label} (general)` : c.name)])}
            </div>
          </div>
        ))}
        {shown.length === 0 && <div className="text-[12.5px] py-2" style={{ color: 'var(--text3)' }}>Nothing matches “{q}”. Add it as your own with New.</div>}
        {extra && !query && <div className="flex flex-wrap gap-1.5 pt-1">{extra}</div>}
      </div>
    </div>
  )
}

// The same grouping for a <select>: one <optgroup> per category.
// `only`: keep just these names (e.g. the ones that fit an import row).
export function CategoryOptgroups({ rows, kind, only, prefix = '' }: { rows: Category[]; kind: CatKind; only?: (name: string) => boolean; prefix?: string }) {
  return <>{groupedCategories(rows, kind).map(({ group, items }) => {
    const xs = items.filter(c => !only || only(c.name))
    return xs.length ? (
      <optgroup key={group.key} label={`${prefix}${group.label}`}>
        {xs.map(c => <option key={c.id} value={c.name}>{isGeneral(c.name) && xs.length > 1 ? `${group.label} (general)` : c.name}</option>)}
      </optgroup>
    ) : null
  })}</>
}
