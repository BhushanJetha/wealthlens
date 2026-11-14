'use client'
// The "?" next to a page title: what the page shows, where its numbers come
// from, and its guide (lib/help). Nothing shows on pages without one.
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { helpFor } from '@/lib/help'

export default function HelpButton() {
  const path = usePathname()
  const h = helpFor(path)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const out = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', out); window.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', out); window.removeEventListener('keydown', esc) }
  }, [open])
  if (!h) return null
  return (
    <span ref={ref} className="relative inline-flex align-middle ml-2">
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label="What this page shows"
        className="w-[22px] h-[22px] rounded-full inline-flex items-center justify-center text-[12px] font-bold"
        style={{ border: '1.5px solid var(--accent)', color: 'var(--accent)', background: open ? 'var(--accent-bg)' : 'transparent' }}>?</button>
      {open && (
        <span role="dialog" aria-label="About this page" className="absolute left-0 top-[30px] z-40 w-[300px] max-w-[calc(100vw-40px)] rounded-xl bg-white p-3.5 text-[12.5px] leading-relaxed font-normal tracking-normal flex flex-col gap-1.5"
          style={{ border: '1px solid var(--line)', boxShadow: '0 14px 32px rgba(20,23,43,.14)', color: 'var(--text2)' }}>
          <span><b style={{ color: 'var(--text)' }}>What this page shows:</b> {h.what}</span>
          <span><b style={{ color: 'var(--text)' }}>Where it comes from:</b> {h.from}</span>
          {h.guide && <Link href={h.guide.href} onClick={() => setOpen(false)} className="font-semibold" style={{ color: 'var(--accent)' }}>Read: {h.guide.label} →</Link>}
        </span>
      )}
    </span>
  )
}
