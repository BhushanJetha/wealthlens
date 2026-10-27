'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { resolveNav } from '@/lib/nav'

// The current section's pages as an underline tab strip (plus sub-tab pills
// for Investments / Loans / Reports). Flush under the Topbar; hidden when a
// section has a single page. Phones get scrolling chip rows instead (the
// mobile design has no tab strip).
export default function SectionTabs() {
  const pathname = usePathname()
  const { section, tab, sub } = resolveNav(pathname)
  if (!section || section.tabs.length < 2) return null
  const tabs = section.tabs.filter(t => !t.hidden)

  const chips = (label: string, links: { label: string; href: string }[], current?: string) => (
    <nav aria-label={label} className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4">
      {links.map(l => (
        <Link key={l.href} href={l.href} className="wl-chip flex-shrink-0"
          aria-current={current === l.href ? 'page' : undefined}>{l.label}</Link>
      ))}
    </nav>
  )

  return (
    <>
      <div className="md:hidden no-print flex flex-col gap-2 mb-4">
        {chips(`${section.label} pages`, tabs, tab?.href)}
        {tab?.subs && chips(`${tab.label} sections`, tab.subs, sub?.href)}
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
            {tab.subs.map(s => (
              <Link key={s.href} href={s.href} className="wl-chip"
                aria-current={sub?.href === s.href ? 'page' : undefined}>
                {s.label}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </>
  )
}
