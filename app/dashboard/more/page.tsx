'use client'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { SECTIONS } from '@/lib/nav'
import { useUiStore } from '@/store/uiStore'

// Phone "More" hub (design: mobile More) — every section's pages as grouped
// lists, reached from the bottom tab bar.
const ORDER = ['learn', 'insights', 'money', 'plan', 'wealth', 'settings']

export default function MorePage() {
  const { openAdvisor } = useUiStore()
  const groups = ORDER.map(k => SECTIONS.find(s => s.key === k)!).filter(Boolean)

  const row = (label: string, href: string) => (
    <Link key={href + label} href={href}
      className="flex items-center justify-between px-4 py-3.5 text-[14px] font-medium active:bg-slate-50"
      style={{ borderTop: '1px solid #F1F5F9', color: 'var(--text)' }}>
      {label}
      <ChevronRight size={16} style={{ color: 'var(--text4)' }} />
    </Link>
  )

  return (
    <div className="max-w-xl mx-auto space-y-5 animate-fade-up">
      <h1 className="text-[22px] font-bold" style={{ color: 'var(--text)' }}>More</h1>
      {groups.map(s => (
        <section key={s.key}>
          <div className="wl-eyebrow mx-1 mb-1.5">{s.label}</div>
          <div className="wl-card overflow-hidden" style={{ borderRadius: 14 }}>
            <div className="-mt-px">
              {s.tabs.length === 0 && row(s.label, s.href)}
              {s.tabs.map(t => row(t.label, t.href))}
              {s.key === 'insights' && (
                <button onClick={() => openAdvisor()}
                  className="w-full flex items-center justify-between px-4 py-3.5 text-[14px] font-medium text-left"
                  style={{ borderTop: '1px solid #F1F5F9', color: 'var(--text)' }}>
                  ✦ AI advisor
                  <ChevronRight size={16} style={{ color: 'var(--text4)' }} />
                </button>
              )}
            </div>
          </div>
        </section>
      ))}
    </div>
  )
}
