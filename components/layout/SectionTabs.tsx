'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { resolveNav } from '@/lib/nav'

// The current section's pages as an underline tab strip (plus sub-tab pills
// for Investments / Loans / Reports / Net worth). Flush under the Topbar.
export default function SectionTabs() {
  const pathname = usePathname()
  const { section, tab, sub } = resolveNav(pathname)
  if (!section || !section.tabs.length) return null

  return (
    <div className="no-print -mx-3 sm:-mx-5 -mt-3 sm:-mt-5 mb-4 sm:mb-5 px-3 sm:px-5" style={{ background: '#fff' }}>
      <nav aria-label={`${section.label} pages`} className="wl-tabs flex items-end"
        style={{ borderBottom: '1px solid var(--border)' }}>
        {section.tabs.map(t => (
          <Link key={t.href} href={t.href} className="wl-tab"
            aria-current={tab?.href === t.href ? 'page' : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>
      {tab?.subs && (
        <nav aria-label={`${tab.label} sections`} className="wl-tabs flex items-center gap-1.5 pt-3">
          {tab.subs.map(s => (
            <Link key={s.href} href={s.href} className="wl-chip"
              aria-current={sub?.href === s.href ? 'page' : undefined}>
              {s.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  )
}
