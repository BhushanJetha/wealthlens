'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { resolveNav } from '@/lib/nav'

// The current section's pages as an underline tab strip (plus sub-tab pills
// for Investments / Loans / Reports). Flush under the Topbar; hidden when a
// section has a single page.
export default function SectionTabs() {
  const pathname = usePathname()
  const { section, tab, sub } = resolveNav(pathname)
  if (!section || section.tabs.length < 2) return null

  return (
    <div className="no-print -mx-4 md:-mx-7 -mt-4 md:-mt-6 mb-5 md:mb-6">
      <nav aria-label={`${section.label} pages`} className="wl-tabs flex items-end px-4 md:px-7"
        style={{ borderBottom: '1px solid var(--border)', background: '#fff' }}>
        {section.tabs.map(t => (
          <Link key={t.href} href={t.href} className="wl-tab"
            aria-current={tab?.href === t.href ? 'page' : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>
      {tab?.subs && (
        <nav aria-label={`${tab.label} sections`} className="wl-tabs flex items-center gap-2 px-4 md:px-7 pt-4">
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
