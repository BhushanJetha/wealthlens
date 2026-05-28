'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  LayoutDashboard, Receipt, TrendingUp, Building2,
  CreditCard, Shield, Target, Upload, LogOut, Settings,
  ChevronDown, BarChart2, RefreshCw, Landmark, Briefcase,
  FileText, Activity, Gem, Car, Home, User, CircleDollarSign,
  ArrowDownCircle, ArrowUpCircle, PieChart
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const INV_SUBS = [
  { href: '/dashboard/investments',                    icon: BarChart2,        label: 'Overview'            },
  { href: '/dashboard/investments/mutual-funds',       icon: TrendingUp,       label: 'Mutual Funds'        },
  { href: '/dashboard/investments/stocks',             icon: Activity,         label: 'Stocks'              },
  { href: '/dashboard/investments/etf',                icon: BarChart2,        label: 'ETF'                 },
  { href: '/dashboard/investments/fixed-deposits',     icon: Landmark,         label: 'Fixed Deposits'      },
  { href: '/dashboard/investments/recurring-deposits', icon: RefreshCw,        label: 'Recurring Deposits'  },
  { href: '/dashboard/investments/gold',               icon: Gem,              label: 'Gold'                },
  { href: '/dashboard/investments/bonds',              icon: CircleDollarSign, label: 'Bonds'               },
  { href: '/dashboard/investments/nps',                icon: Briefcase,        label: 'NPS'                 },
  { href: '/dashboard/investments/lic',                icon: FileText,         label: 'LIC'                 },
]

const LOAN_SUBS = [
  { href: '/dashboard/loans',          icon: BarChart2,  label: 'Overview'      },
  { href: '/dashboard/loans/home',     icon: Home,       label: 'Home Loan'     },
  { href: '/dashboard/loans/car',      icon: Car,        label: 'Car / Bike'    },
  { href: '/dashboard/loans/personal', icon: User,       label: 'Personal Loan' },
  { href: '/dashboard/loans/gold',     icon: Gem,        label: 'Gold Loan'     },
  { href: '/dashboard/loans/card',     icon: CreditCard, label: 'Loan on Card'  },
  { href: '/dashboard/loans/other',    icon: Building2,  label: 'Other Loans'   },
]

const TXN_SUBS = [
  { href: '/dashboard/income',          icon: ArrowUpCircle,   label: 'Income'          },
  { href: '/dashboard/income/report',   icon: PieChart,        label: 'Income Report'   },
  { href: '/dashboard/expenses',        icon: ArrowDownCircle, label: 'Expenses'        },
  { href: '/dashboard/expenses/report', icon: PieChart,        label: 'Expense Report'  },
]

const MAIN_NAV = [
  { href: '/dashboard',            icon: LayoutDashboard, label: 'Dashboard'         },
  { href: '/dashboard/income',     icon: Receipt,         label: 'Transactions',     sub: 'txn'  },
  { href: '/dashboard/investments',icon: TrendingUp,      label: 'Investments',      sub: 'inv'  },
  { href: '/dashboard/loans',      icon: Building2,       label: 'Loans',            sub: 'loan' },
  { href: '/dashboard/cards',      icon: CreditCard,      label: 'Credit Cards'      },
  { href: '/dashboard/budgets',    icon: Target,          label: 'Budgets & Goals'   },
]

const OTHER_NAV = [
  { href: '/dashboard/insurance',  icon: Shield,          label: 'Insurance'         },
  { href: '/dashboard/ingest',     icon: Upload,          label: 'Upload Statements' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router   = useRouter()
  const supabase = createClient()
  const isInvActive  = pathname.startsWith('/dashboard/investments')
  const isLoanActive = pathname.startsWith('/dashboard/loans')
  const isTxnActive  = pathname.startsWith('/dashboard/income') || pathname.startsWith('/dashboard/expenses') || pathname.startsWith('/dashboard/expenses/report') || pathname.startsWith('/dashboard/income/report')
  const [invOpen,  setInvOpen]  = useState(isInvActive)
  const [loanOpen, setLoanOpen] = useState(isLoanActive)
  const [txnOpen,  setTxnOpen]  = useState(isTxnActive)

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  function NavItem({ href, icon: Icon, label, active }: { href: string; icon: any; label: string; active: boolean }) {
    return (
      <Link href={href}
        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all mx-2"
        style={active ? {
          background: 'var(--sage-bg)',
          color: 'var(--sage)',
        } : {
          color: '#6B7280',
        }}
        onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg2)' }}
        onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}>
        <Icon size={16} className="flex-shrink-0" />
        {label}
      </Link>
    )
  }

  function ExpandItem({ label, icon: Icon, active, open, onToggle }: { label: string; icon: any; active: boolean; open: boolean; onToggle: () => void }) {
    return (
      <button onClick={onToggle}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all mx-2"
        style={{
          width: 'calc(100% - 16px)',
          background: active ? 'var(--sage-bg)' : 'transparent',
          color: active ? 'var(--sage)' : '#6B7280',
        }}
        onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg2)' }}
        onMouseLeave={e => { if (!active) e.currentTarget.style.background = active ? 'var(--sage-bg)' : 'transparent' }}>
        <Icon size={16} className="flex-shrink-0" />
        <span className="flex-1 text-left">{label}</span>
        <ChevronDown size={13} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', opacity: 0.5 }} />
      </button>
    )
  }

  function SubItem({ href, icon: Icon, label }: { href: string; icon: any; label: string }) {
    const active = pathname === href
    return (
      <Link href={href}
        className="flex items-center gap-2.5 pl-9 pr-3 py-2 rounded-xl text-[12px] font-medium transition-all mx-2"
        style={active ? {
          background: 'var(--sage-bg)',
          color: 'var(--sage)',
        } : {
          color: '#9CA3AF',
        }}
        onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg2)' }}
        onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}>
        <Icon size={12} className="flex-shrink-0" />
        {label}
      </Link>
    )
  }

  function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
      <div className="px-5 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#D1D5DB' }}>
        {children}
      </div>
    )
  }

  return (
    <aside className="w-[230px] min-w-[230px] flex flex-col overflow-y-auto"
      style={{ background: '#fff', borderRight: '1px solid var(--border)' }}>

      {/* Logo */}
      <div className="px-5 py-4 flex items-center gap-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm text-white flex-shrink-0"
          style={{ background: 'var(--sage)' }}>◈</div>
        <div>
          <div className="text-[14px] font-bold tracking-tight" style={{ color: 'var(--text)' }}>WealthLens</div>
          <div className="text-[9px] uppercase tracking-widest" style={{ color: 'var(--text3)' }}>Finance OS</div>
        </div>
      </div>

      {/* Main Menu */}
      <div className="flex-1 py-2">
        <SectionLabel>Main Menu</SectionLabel>
        <div className="space-y-0.5">
          {MAIN_NAV.map(item => {
            if (item.sub === 'txn') {
              return (
                <div key={item.href}>
                  <ExpandItem label={item.label} icon={item.icon} active={isTxnActive} open={txnOpen} onToggle={() => setTxnOpen(p => !p)} />
                  {txnOpen && (
                    <div className="space-y-0.5 py-0.5">
                      {TXN_SUBS.map(sub => <SubItem key={sub.href} {...sub} />)}
                    </div>
                  )}
                </div>
              )
            }
            if (item.sub === 'inv') {
              return (
                <div key={item.href}>
                  <ExpandItem label={item.label} icon={item.icon} active={isInvActive} open={invOpen} onToggle={() => setInvOpen(p => !p)} />
                  {invOpen && (
                    <div className="space-y-0.5 py-0.5">
                      {INV_SUBS.map(sub => <SubItem key={sub.href} {...sub} />)}
                    </div>
                  )}
                </div>
              )
            }
            if (item.sub === 'loan') {
              return (
                <div key={item.href}>
                  <ExpandItem label={item.label} icon={item.icon} active={isLoanActive} open={loanOpen} onToggle={() => setLoanOpen(p => !p)} />
                  {loanOpen && (
                    <div className="space-y-0.5 py-0.5">
                      {LOAN_SUBS.map(sub => <SubItem key={sub.href} {...sub} />)}
                    </div>
                  )}
                </div>
              )
            }
            const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
            return <NavItem key={item.href} href={item.href} icon={item.icon} label={item.label} active={active} />
          })}
        </div>

        <SectionLabel>Tools</SectionLabel>
        <div className="space-y-0.5">
          {OTHER_NAV.map(item => {
            const active = pathname.startsWith(item.href)
            return <NavItem key={item.href} href={item.href} icon={item.icon} label={item.label} active={active} />
          })}
        </div>

        <SectionLabel>Account</SectionLabel>
        <div className="space-y-0.5">
          <NavItem href="/dashboard/settings" icon={Settings} label="Settings" active={pathname.startsWith('/dashboard/settings')} />
          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all mx-2"
            style={{ width: 'calc(100% - 16px)', color: '#6B7280' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--rose-bg)'; e.currentTarget.style.color = 'var(--rose)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#6B7280' }}>
            <LogOut size={16} className="flex-shrink-0" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-3" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="text-[9px] font-medium" style={{ color: '#D1D5DB' }}>© WealthLens 2026</div>
        <div className="text-[9px]" style={{ color: '#D1D5DB' }}>Personal Finance OS for UAE & India</div>
      </div>
    </aside>
  )
}
