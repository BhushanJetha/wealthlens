// App navigation — one definition shared by the Sidebar, the section tab strip,
// the mobile tab bar, the More hub and the Ctrl+K command palette. Grouping
// follows the Claude Design spec (WealthLens UI.dc.html): Home / Money / Wealth
// / Plan / Insights / Learn / Settings, each with tabs (and optional sub-tabs).
// URLs are unchanged.
import {
  House, Receipt, Wallet, Target, Sparkles, BookOpen, SlidersHorizontal, type LucideIcon,
} from 'lucide-react'

export interface NavLink { label: string; href: string; also?: string[] }   // also = extra paths that activate it
export interface NavTab extends NavLink { subs?: NavLink[] }
export interface NavSection { key: string; label: string; desc: string; icon: LucideIcon; href: string; tabs: NavTab[] }

export const SECTIONS: NavSection[] = [
  { key: 'home', label: 'Home', desc: 'Overview and what needs attention', icon: House, href: '/dashboard', tabs: [] },
  { key: 'money', label: 'Money', desc: 'Spending, income and transfers', icon: Receipt, href: '/dashboard/expenses', tabs: [
    { label: 'Expenses',     href: '/dashboard/expenses' },
    { label: 'Spending analysis', href: '/dashboard/analysis' },
    { label: 'Bills & subscriptions', href: '/dashboard/bills' },
    { label: 'Income',       href: '/dashboard/income' },
    { label: 'Transfers',    href: '/dashboard/transfers' },
    { label: 'Reports',      href: '/dashboard/reports', subs: [
      { label: 'Money report',   href: '/dashboard/reports' },
      { label: 'Expense report', href: '/dashboard/expenses/report' },
      { label: 'Income report',  href: '/dashboard/income/report' },
    ] },
    { label: 'FX optimizer', href: '/dashboard/fx' },
    { label: 'Import',       href: '/dashboard/ingest' },
  ] },
  { key: 'wealth', label: 'Wealth', desc: 'Net worth, investments and debt', icon: Wallet, href: '/dashboard/net-worth', tabs: [
    { label: 'Net worth',      href: '/dashboard/net-worth' },
    { label: 'Debt vs equity', href: '/dashboard/debt-equity' },
    { label: 'Investments', href: '/dashboard/investments', subs: [
      { label: 'Overview',           href: '/dashboard/investments' },
      { label: 'Market-linked',      href: '/dashboard/investments/market-linked' },
      { label: 'Mutual funds',       href: '/dashboard/investments/mutual-funds' },
      { label: 'Stocks',             href: '/dashboard/stocks', also: ['/dashboard/investments/stocks'] },
      { label: 'ETF',                href: '/dashboard/investments/etf' },
      { label: 'Fixed deposits',     href: '/dashboard/investments/fixed-deposits' },
      { label: 'Recurring deposits', href: '/dashboard/investments/recurring-deposits' },
      { label: 'PPF / EPF',          href: '/dashboard/investments/ppf-epf' },
      { label: 'Gold',               href: '/dashboard/investments/gold' },
      { label: 'Bonds / SGB',        href: '/dashboard/investments/bonds' },
      { label: 'NPS',                href: '/dashboard/investments/nps' },
      { label: 'LIC',                href: '/dashboard/investments/lic' },
    ] },
    { label: 'Loans', href: '/dashboard/loans', subs: [
      { label: 'Overview',     href: '/dashboard/loans' },
      { label: 'Home',         href: '/dashboard/loans/home' },
      { label: 'Car / bike',   href: '/dashboard/loans/car' },
      { label: 'Personal',     href: '/dashboard/loans/personal' },
      { label: 'Gold',         href: '/dashboard/loans/gold' },
      { label: 'Loan on card', href: '/dashboard/loans/card' },
      { label: 'Other',        href: '/dashboard/loans/other' },
    ] },
    { label: 'Credit cards',  href: '/dashboard/cards' },
    { label: 'Bank accounts', href: '/dashboard/accounts' },
    { label: 'Insurance',     href: '/dashboard/insurance' },
  ] },
  { key: 'plan', label: 'Plan', desc: 'Budgets, goals and forecasts', icon: Target, href: '/dashboard/budgets', tabs: [
    { label: 'Budgets',            href: '/dashboard/budgets' },
    { label: 'Goals',              href: '/dashboard/goals' },
    { label: 'Cash-flow forecast', href: '/dashboard/cashflow' },
    { label: 'Tax planner',        href: '/dashboard/tax' },
  ] },
  { key: 'insights', label: 'Insights', desc: 'Health checks and NRI tools', icon: Sparkles, href: '/dashboard/financial-health', tabs: [
    { label: 'Financial health', href: '/dashboard/financial-health' },
    { label: 'NRI toolkit',      href: '/dashboard/nri-toolkit' },
    { label: 'Money mindset',    href: '/dashboard/inspire' },
    { label: 'Market news',      href: '/dashboard/news' },
  ] },
  { key: 'learn', label: 'Learn', desc: 'Courses and guides for every part of WealthLens', icon: BookOpen, href: '/dashboard/learn', tabs: [
    { label: 'Courses', href: '/dashboard/learn', also: ['/dashboard/budgets/learn', '/dashboard/cards/learn', '/dashboard/expenses/learn', '/dashboard/goals/learn'] },
    { label: 'Calculators', href: '/dashboard/learn/calculators' },
  ] },
  { key: 'settings', label: 'Settings', desc: 'Profile, family and preferences', icon: SlidersHorizontal, href: '/dashboard/settings', tabs: [] },
]

// Bottom bar on phones: four sections + "More" (everything else, as a hub page)
export const MOBILE_TABS = ['home', 'money', 'wealth', 'plan']

const matches = (path: string, prefix: string) => path === prefix || path.startsWith(prefix + '/')
const linkPaths = (l: NavLink) => [l.href, ...(l.also ?? [])]

// Which section / tab / sub-tab a URL belongs to. The longest matching path wins,
// so /dashboard/expenses/report lands on Reports, not Expenses.
export function resolveNav(pathname: string): { section?: NavSection; tab?: NavTab; sub?: NavLink } {
  if (pathname === '/dashboard') return { section: SECTIONS[0] }
  let best: { len: number; section: NavSection; tab?: NavTab } | null = null
  for (const section of SECTIONS) {
    if (section.key === 'home') continue
    const candidates: { path: string; tab?: NavTab }[] = section.tabs.length
      ? section.tabs.flatMap(tab => [...linkPaths(tab), ...(tab.subs ?? []).flatMap(linkPaths)].map(path => ({ path, tab })))
      : [{ path: section.href }]
    for (const c of candidates) {
      if (matches(pathname, c.path) && (!best || c.path.length > best.len)) best = { len: c.path.length, section, tab: c.tab }
    }
  }
  if (!best) return {}
  const { section, tab } = best
  let sub: NavLink | undefined
  if (tab?.subs) {
    let subLen = -1
    for (const s of tab.subs) for (const p of linkPaths(s)) {
      if (matches(pathname, p) && p.length > subLen) { sub = s; subLen = p.length }
    }
  }
  return { section, tab, sub }
}

// Every destination, flattened with a breadcrumb — for the command palette
export function allDestinations(): { label: string; crumb: string; href: string; section: NavSection }[] {
  const out: { label: string; crumb: string; href: string; section: NavSection }[] = []
  for (const section of SECTIONS) {
    if (!section.tabs.length) { out.push({ label: section.label, crumb: section.desc, href: section.href, section }); continue }
    for (const tab of section.tabs) {
      if (!tab.subs) { out.push({ label: tab.label, crumb: section.label, href: tab.href, section }); continue }
      for (const s of tab.subs) {
        const label = s.label === 'Overview' ? `${tab.label} overview` : s.label
        out.push({ label, crumb: `${section.label} › ${tab.label}`, href: s.href, section })
      }
    }
  }
  return out
}
