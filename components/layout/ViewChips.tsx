'use client'
// The views of one page (lib/nav VIEWS) as chips at its top: Reports by type,
// Forecast by month or by day, Loans by type. They replace a row of sub-tabs.
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { VIEWS } from '@/lib/nav'

export default function ViewChips({ of, label }: { of: keyof typeof VIEWS; label: string }) {
  const path = usePathname()
  const items = VIEWS[of]
  // The longest matching path wins (so /dashboard/loans/home isn't "All")
  const on = items.reduce<string | null>((best, it) => ((path === it.href || path.startsWith(it.href + '/')) && it.href.length > (best?.length ?? -1) ? it.href : best), null)
  return (
    <nav aria-label={label} className="flex gap-1.5 overflow-x-auto no-scrollbar -mb-1">
      {items.map(it => {
        const active = on === it.href
        return (
          <Link key={it.href} href={it.href} aria-current={active ? 'page' : undefined} className="h-9 px-3.5 rounded-full text-[13px] whitespace-nowrap flex items-center flex-shrink-0"
            style={active ? { background: '#14172B', color: '#fff', fontWeight: 600 } : { background: '#fff', border: '1px solid var(--line)', color: 'var(--text2)' }}>{it.label}</Link>
        )
      })}
    </nav>
  )
}

// A page with its view chips on top
export function WithViews({ of, label, children }: { of: keyof typeof VIEWS; label: string; children: React.ReactNode }) {
  return <div className="flex flex-col gap-3 md:gap-3.5"><ViewChips of={of} label={label} />{children}</div>
}
