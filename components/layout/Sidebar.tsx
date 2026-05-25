'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Receipt, TrendingUp, Building2,
  CreditCard, Shield, Target, Upload, MessageSquare,
  LogOut, Settings
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const NAV = [
  { label: 'Overview', items: [
    { href: '/dashboard', icon: LayoutDashboard, label: 'Executive Dashboard' },
  ]},
  { label: 'Finance', items: [
    { href: '/dashboard/expenses',    icon: Receipt,        label: 'Expenses',    badge: null },
    { href: '/dashboard/investments', icon: TrendingUp,     label: 'Investments'  },
    { href: '/dashboard/loans',       icon: Building2,      label: 'Home Loans'   },
  ]},
  { label: 'Liabilities', items: [
    { href: '/dashboard/cards',       icon: CreditCard,     label: 'Credit Cards' },
  ]},
  { label: 'Planning', items: [
    { href: '/dashboard/insurance',   icon: Shield,         label: 'Insurance'    },
    { href: '/dashboard/budgets',     icon: Target,         label: 'Budgets & Goals' },
  ]},
  { label: 'Tools', items: [
    { href: '/dashboard/ingest',      icon: Upload,         label: 'Upload Statements' },
  ]},
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="w-[220px] min-w-[220px] bg-[#162032] border-r border-white/7 flex flex-col overflow-y-auto">
      {/* Logo */}
      <div className="p-4 border-b border-white/7">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-black font-bold text-sm"
            style={{ background: 'linear-gradient(135deg,#00C9A7,#4A90D9)' }}>◈</div>
          <div>
            <div className="text-sm font-bold text-[#00C9A7] tracking-wider">WEALTHLENS</div>
            <div className="text-[9px] text-slate-500 uppercase tracking-widest">Finance OS</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3">
        {NAV.map(section => (
          <div key={section.label} className="mb-1">
            <div className="px-4 py-2 text-[9px] uppercase tracking-[0.12em] text-slate-600 font-bold">
              {section.label}
            </div>
            {section.items.map(item => {
              const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
              return (
                <Link key={item.href} href={item.href}
                  className={`flex items-center gap-2.5 px-4 py-2.5 text-[12.5px] transition-all border-l-2 ${
                    active
                      ? 'bg-[#00C9A7]/10 text-[#00C9A7] border-[#00C9A7]'
                      : 'text-slate-400 border-transparent hover:bg-white/4 hover:text-slate-200'
                  }`}>
                  <item.icon size={14} className="flex-shrink-0" />
                  {item.label}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div className="border-t border-white/7 p-3 space-y-1">
        <Link href="/dashboard/settings"
          className="flex items-center gap-2.5 px-3 py-2 text-[12px] text-slate-400 hover:text-slate-200 rounded-lg hover:bg-white/4 transition-all">
          <Settings size={13} /> Settings
        </Link>
        <button onClick={signOut}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-slate-400 hover:text-rose-400 rounded-lg hover:bg-rose-500/8 transition-all">
          <LogOut size={13} /> Sign Out
        </button>
      </div>
    </aside>
  )
}
