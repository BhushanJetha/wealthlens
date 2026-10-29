'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Check, ChevronDown, X } from 'lucide-react'
import { resolveNav, type NavLink, type NavTab } from '@/lib/nav'

// The current section's pages as an underline tab strip (plus sub-tab pills
// for Investments / Loans / Reports). Flush under the Topbar; hidden when a
// section has a single page. Phones get one row of underline tabs, then the
// sub-pages as a segmented switch (2–3 of them) or a picker that opens a
// bottom sheet (4 or more) — never two rows of scrolling chips.
export default function SectionTabs() {
  const pathname = usePathname()
  const { section, tab, sub } = resolveNav(pathname)
  if (!section || section.tabs.length < 2) return null
  const tabs = section.tabs.filter(t => !t.hidden)

  // A small heading where a group of sub-tabs starts (Investments: Market-linked, Fixed income…)
  const groupLabel = (l: { group?: string }) => l.group
    ? <span key={`g-${l.group}`} className="flex-shrink-0 self-center text-[10.5px] font-semibold uppercase tracking-[0.05em] pl-2 pr-0.5" style={{ color: 'var(--text4)' }}>{l.group}</span>
    : null

  return (
    <>
      <div className="md:hidden no-print flex flex-col gap-3 mb-4">
        <PhoneTabs label={`${section.label} pages`} tabs={tabs} current={tab?.href} />
        {tab?.subs && (tab.subs.length <= 3
          ? <PhoneSwitch tab={tab} current={sub?.href} />
          : <PhonePicker tab={tab} current={sub} />)}
      </div>

      <div className="hidden md:block no-print -mx-7 -mt-6 mb-6">
        <nav aria-label={`${section.label} pages`} className="wl-tabs flex items-end px-7"
          style={{ borderBottom: '1px solid var(--line)', background: '#fff' }}>
          {tabs.map(t => (
            <Link key={t.href} href={t.href} className="wl-tab"
              aria-current={tab?.href === t.href ? 'page' : undefined}>
              {t.label}
            </Link>
          ))}
        </nav>
        {tab?.subs && (
          <nav aria-label={`${tab.label} sections`} className="wl-tabs flex items-center gap-2 px-7 pt-4">
            {tab.subs.flatMap(s => [groupLabel(s),
              <Link key={s.href} href={s.href} className="wl-chip"
                aria-current={sub?.href === s.href ? 'page' : undefined}>
                {s.label}
              </Link>])}
          </nav>
        )}
      </div>
    </>
  )
}

// Underline tabs that scroll sideways; the current one is brought into view
// and an edge fades while there's more to see that way.
function PhoneTabs({ label, tabs, current }: { label: string; tabs: NavTab[]; current?: string }) {
  const ref = useRef<HTMLElement>(null)
  const [more, setMore] = useState({ left: false, right: false })
  const check = () => {
    const el = ref.current
    if (el) setMore({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 })
  }
  const mask = more.left || more.right
    ? `linear-gradient(90deg, ${more.left ? 'transparent, #000 14%' : '#000'}, ${more.right ? '#000 82%, transparent' : '#000'})` : undefined
  useEffect(() => {
    const el = ref.current
    const on = el?.querySelector<HTMLElement>('[aria-current="page"]')
    if (el && on) el.scrollLeft = on.offsetLeft - (el.clientWidth - on.offsetWidth) / 2
    check()
  }, [current])
  return (
    <nav ref={ref} aria-label={label} onScroll={check} className="flex gap-5 overflow-x-auto no-scrollbar -mx-4 px-4"
      style={{ borderBottom: '1px solid var(--line)', ...(mask ? { maskImage: mask, WebkitMaskImage: mask } : {}) }}>
      {tabs.map(t => {
        const on = t.href === current
        return (
          <Link key={t.href} href={t.href} aria-current={on ? 'page' : undefined}
            className="relative flex-shrink-0 h-10 flex items-center text-[14px] whitespace-nowrap"
            style={{ color: on ? 'var(--text)' : 'var(--text3)', fontWeight: on ? 650 : 500 }}>
            {t.label}
            {on && <span className="absolute left-0 right-0 -bottom-px h-[2.5px] rounded-full" style={{ background: 'var(--accent)' }} />}
          </Link>
        )
      })}
    </nav>
  )
}

// 2–3 sub-pages: one segmented switch across the screen
function PhoneSwitch({ tab, current }: { tab: NavTab; current?: string }) {
  return (
    <nav aria-label={`${tab.label} sections`} className="flex p-1 rounded-xl" style={{ background: '#E8E6F3' }}>
      {tab.subs!.map(s => {
        const on = s.href === current
        return (
          <Link key={s.href} href={s.href} aria-current={on ? 'page' : undefined}
            className="flex-1 min-w-0 h-9 px-2 rounded-lg flex items-center justify-center text-[13px] truncate transition-colors"
            style={on ? { background: '#fff', color: 'var(--text)', fontWeight: 600, boxShadow: '0 1px 2px rgba(0,0,0,.12)' } : { color: 'var(--text3)', fontWeight: 500 }}>
            <span className="truncate">{s.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

// 4+ sub-pages: the current one on a button; tap for all of them, grouped, in a bottom sheet
function PhonePicker({ tab, current }: { tab: NavTab; current?: NavLink }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  useEffect(() => { setOpen(false) }, [pathname])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Groups as the desktop row shows them: a heading starts a group, pages before the first heading have none
  const groups: { label?: string; items: NavLink[] }[] = []
  for (const s of tab.subs!) {
    if (s.group || !groups.length) groups.push({ label: s.group, items: [] })
    groups[groups.length - 1].items.push(s)
  }
  const here = current ?? tab.subs![0]
  const hereGroup = groups.find(g => g.items.includes(here))?.label ?? tab.label
  const at = tab.subs!.indexOf(here) + 1

  return (
    <>
      <button onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}
        className="w-full flex items-center gap-3 rounded-2xl px-3.5 h-[54px] text-left"
        style={{ background: '#fff', border: '1px solid var(--line)', boxShadow: 'var(--shadow-card)' }}>
        <span className="flex-1 min-w-0">
          <span className="block text-[10.5px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text4)' }}>{hereGroup}</span>
          <span className="block text-[14.5px] font-semibold truncate" style={{ color: 'var(--text)' }}>{here.label}</span>
        </span>
        <span className="text-[11.5px] tabular-nums flex-shrink-0" style={{ color: 'var(--text4)' }}>{at} of {tab.subs!.length}</span>
        <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}><ChevronDown size={16} /></span>
      </button>

      {open && (
        <div className="fixed inset-0 wl-sheet z-50" style={{ background: 'rgba(15,23,42,0.45)' }} onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label={`${tab.label} sections`} className="wl-sheet-panel" style={{ background: 'var(--card)' }} onClick={e => e.stopPropagation()}>
            <div className="mx-auto mt-2 w-10 h-1 rounded-full" style={{ background: 'var(--line)' }} />
            <div className="flex items-center justify-between px-5 pt-2.5 pb-1">
              <span className="text-[16px] font-bold" style={{ color: 'var(--text)' }}>{tab.label}</span>
              <button onClick={() => setOpen(false)} aria-label="Close" className="p-2 -mr-2 rounded-xl" style={{ color: 'var(--text3)' }}><X size={16} /></button>
            </div>
            <nav aria-label={`${tab.label} sections`} className="px-3 pb-5">
              {groups.map((g, gi) => (
                <div key={g.label ?? gi}>
                  {g.label && <div className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text4)' }}>{g.label}</div>}
                  {g.items.map(s => {
                    const on = s.href === here.href
                    return (
                      <Link key={s.href} href={s.href} onClick={() => setOpen(false)} aria-current={on ? 'page' : undefined}
                        className="flex items-center justify-between gap-3 px-3 h-12 rounded-xl text-[14.5px]"
                        style={on ? { background: 'var(--accent-bg)', color: 'var(--accent2)', fontWeight: 600 } : { color: 'var(--text)', fontWeight: 500 }}>
                        {s.label}
                        {on && <Check size={17} />}
                      </Link>
                    )
                  })}
                </div>
              ))}
            </nav>
          </div>
        </div>
      )}
    </>
  )
}
