'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Upload, Globe, CornerDownLeft, type LucideIcon } from 'lucide-react'
import { useUiStore } from '@/store/uiStore'
import { useViewStore } from '@/store/viewStore'
import { allDestinations } from '@/lib/nav'

interface Item { id: string; label: string; hint: string; icon: LucideIcon; group: 'Actions' | 'Go to'; run: () => void }

// Ctrl/⌘+K (or "/") — jump to any page or run a quick action without hunting
// through menus.
export default function CommandPalette() {
  const router = useRouter()
  const { paletteOpen, setPaletteOpen, setUploadOpen } = useUiStore()
  const { setView } = useViewStore()
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef  = useRef<HTMLDivElement>(null)

  // Global shortcut
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName) || (e.target as HTMLElement)?.isContentEditable
      if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); setPaletteOpen(!useUiStore.getState().paletteOpen) }
      else if (e.key === '/' && !typing && !useUiStore.getState().paletteOpen) { e.preventDefault(); setPaletteOpen(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setPaletteOpen])

  useEffect(() => {
    if (paletteOpen) { setQ(''); setActive(0); setTimeout(() => inputRef.current?.focus(), 0) }
  }, [paletteOpen])

  const close = () => setPaletteOpen(false)

  const items = useMemo<Item[]>(() => {
    const actions: Item[] = [
      { id: 'a-import', label: 'Import bank statement', hint: 'PDF or Excel — adds transactions', icon: Upload, group: 'Actions', run: () => setUploadOpen(true) },
      { id: 'a-uae',    label: 'Switch view to UAE',    hint: 'AED only',                 icon: Globe, group: 'Actions', run: () => setView('uae') },
      { id: 'a-india',  label: 'Switch view to India',  hint: 'INR only',                 icon: Globe, group: 'Actions', run: () => setView('india') },
      { id: 'a-all',    label: 'Switch view to All',    hint: 'Consolidated in INR',      icon: Globe, group: 'Actions', run: () => setView('consolidated') },
    ]
    const pages: Item[] = allDestinations().map(d => ({
      id: `p-${d.href}`, label: d.label, hint: d.crumb, icon: d.section.icon, group: 'Go to', run: () => router.push(d.href),
    }))
    const all = [...actions, ...pages]
    const needle = q.trim().toLowerCase()
    if (!needle) return [...actions.slice(0, 1), ...pages]
    const score = (it: Item) => {
      const l = it.label.toLowerCase(), h = it.hint.toLowerCase()
      if (l.startsWith(needle)) return 3
      if (l.split(/\s|\//).some(w => w.startsWith(needle))) return 2
      if (l.includes(needle) || h.includes(needle)) return 1
      return 0
    }
    return all.map(it => ({ it, s: score(it) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s).map(x => x.it)
  }, [q, router, setUploadOpen, setView])

  useEffect(() => { setActive(0) }, [q])
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!paletteOpen) return null

  function run(it: Item) { close(); it.run() }
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, items.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (items[active]) run(items[active]) }
    else if (e.key === 'Escape') { e.preventDefault(); close() }
  }

  let lastGroup = ''
  return (
    <div className="fixed inset-0 z-[60] wl-popup-overlay" style={{ background: 'rgba(15,23,42,0.4)' }} onMouseDown={close}>
      <div className="mx-auto mt-[12vh] w-[min(560px,calc(100%-32px))] rounded-2xl overflow-hidden wl-popup-panel"
        style={{ background: '#fff', border: '1px solid var(--border)', boxShadow: '0 24px 48px -12px rgba(15,23,42,0.25)' }}
        onMouseDown={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Search">
        <div className="flex items-center gap-3 px-4 h-14" style={{ borderBottom: '1px solid var(--border)' }}>
          <Search size={17} style={{ color: 'var(--text3)' }} />
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKeyDown}
            placeholder="Search pages and actions…" aria-label="Search pages and actions"
            className="flex-1 bg-transparent outline-none text-[15px]" style={{ color: 'var(--text)' }} />
          <span className="wl-kbd">Esc</span>
        </div>
        <div ref={listRef} className="max-h-[min(420px,60vh)] overflow-y-auto py-2" role="listbox">
          {items.length === 0 && (
            <div className="px-4 py-8 text-center text-[13px]" style={{ color: 'var(--text3)' }}>No matches for “{q}”</div>
          )}
          {items.map((it, i) => {
            const header = it.group !== lastGroup ? it.group : null
            lastGroup = it.group
            const Icon = it.icon
            const on = i === active
            return (
              <div key={it.id}>
                {header && <div className="px-4 pt-2 pb-1 wl-eyebrow">{header}</div>}
                <button data-idx={i} role="option" aria-selected={on}
                  onMouseEnter={() => setActive(i)} onClick={() => run(it)}
                  className="w-full flex items-center gap-3 px-4 h-11 text-left"
                  style={{ background: on ? 'var(--accent-bg)' : 'transparent' }}>
                  <Icon size={16} style={{ color: on ? 'var(--accent)' : 'var(--text3)' }} className="flex-shrink-0" />
                  <span className="text-[13.5px] font-medium truncate" style={{ color: 'var(--text)' }}>{it.label}</span>
                  <span className="text-[12px] truncate ml-auto pl-3" style={{ color: 'var(--text3)' }}>{it.hint}</span>
                  {on && <CornerDownLeft size={13} className="flex-shrink-0" style={{ color: 'var(--accent)' }} />}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
