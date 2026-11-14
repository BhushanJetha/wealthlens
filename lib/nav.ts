// App navigation — one definition shared by the Sidebar, the section tab strip,
// the mobile tab bar, the More hub and the Ctrl+K command palette. Grouping
// follows the Claude Design spec (WealthLens UI.dc.html): Home / Money / Wealth
// / Plan / Insights / Learn / Settings, each with tabs (and optional sub-tabs).
// URLs are unchanged.
import {
  House, Receipt, Wallet, Target, Sparkles, BookOpen, SlidersHorizontal, type LucideIcon,
} from 'lucide-react'

export interface NavLink { label: string; href: string; also?: string[]; group?: string }   // also = extra paths that activate it; group = small heading before it in a sub-tab row
export interface NavTab extends NavLink { subs?: NavLink[]; hidden?: true }   // hidden = no tab, still resolves (breadcrumb, palette)
export interface NavSection { key: string; label: string; desc: string; icon: LucideIcon; href: string; tabs: NavTab[] }

export const SECTIONS: NavSection[] = [
  { key: 'home', label: 'Home', desc: 'Overview and what needs attention', icon: House, href: '/dashboard', tabs: [] },
  { key: 'money', label: 'Money', desc: 'Spending, income and transfers', icon: Receipt, href: '/dashboard/money', tabs: [
    { label: 'Overview', href: '/dashboard/money' },
    { label: 'Expenses', href: '/dashboard/expenses', subs: [
      { label: 'Transactions',      href: '/dashboard/expenses' },
      { label: 'Spending',          href: '/dashboard/analysis' },
    ] },
    { label: 'Income',     href: '/dashboard/income' },
    { label: 'Money flow', href: '/dashboard/transfers', subs: [
      { label: 'Transfers',    href: '/dashboard/transfers' },
      { label: 'FX optimizer', href: '/dashboard/fx' },
    ] },
    { label: 'Friends',    href: '/dashboard/money/friends' },
    // One Reports page: the type is picked on the page (VIEWS.reports)
    { label: 'Reports',    href: '/dashboard/reports', also: ['/dashboard/expenses/report', '/dashboard/income/report', '/dashboard/reports/cards'] },
    { label: 'Review', href: '/dashboard/money/review', hidden: true },
    { label: 'Import', href: '/dashboard/ingest', hidden: true },
  ] },
  { key: 'wealth', label: 'Wealth', desc: 'Net worth, portfolio manager, investments and debt', icon: Wallet, href: '/dashboard/net-worth', tabs: [
    // Net worth and debt vs equity are on the overview; the health check moved here from Insights
    { label: 'Overview', href: '/dashboard/net-worth', subs: [
      { label: 'Overview',     href: '/dashboard/net-worth' },
      { label: 'Health check', href: '/dashboard/financial-health' },
    ] },
    { label: 'Debt vs equity', href: '/dashboard/debt-equity', hidden: true },
    { label: 'Portfolio manager', href: '/dashboard/portfolio', subs: [
      { label: 'Review',      href: '/dashboard/portfolio' },
      { label: 'Need money?', href: '/dashboard/portfolio/need-money' },
      { label: 'Reports',     href: '/dashboard/portfolio/reviews' },
      { label: 'My profile',  href: '/dashboard/portfolio/profile' },
    ] },
    { label: 'Investments', href: '/dashboard/investments', subs: [
      { label: 'Overview',           href: '/dashboard/investments' },
      { label: 'All market-linked',  href: '/dashboard/investments/market-linked', group: 'Market-linked' },
      { label: 'Mutual funds',       href: '/dashboard/investments/mutual-funds' },
      { label: 'Stocks',             href: '/dashboard/stocks', also: ['/dashboard/investments/stocks'] },
      { label: 'ETF',                href: '/dashboard/investments/etf' },
      { label: 'Fixed deposits',     href: '/dashboard/investments/fixed-deposits', group: 'Fixed income' },
      { label: 'Recurring deposits', href: '/dashboard/investments/recurring-deposits' },
      { label: 'Bonds / SGB',        href: '/dashboard/investments/bonds' },
      { label: 'PPF / EPF',          href: '/dashboard/investments/ppf-epf', group: 'Retirement' },
      { label: 'NPS',                href: '/dashboard/investments/nps' },
      { label: 'Gold',               href: '/dashboard/investments/gold', group: 'Gold & insurance' },
      { label: 'LIC',                href: '/dashboard/investments/lic' },
    ] },
    { label: 'Property & assets', href: '/dashboard/assets' },
    // Loan types are chips on the Loans page (VIEWS.loans)
    { label: 'Loans', href: '/dashboard/loans' },
    { label: 'Accounts & cards', href: '/dashboard/accounts', subs: [
      { label: 'Bank accounts', href: '/dashboard/accounts' },
      { label: 'Credit cards',  href: '/dashboard/cards' },
    ] },
    { label: 'Insurance', href: '/dashboard/insurance', subs: [
      { label: 'Policies', href: '/dashboard/insurance' },
      { label: 'Nominees', href: '/dashboard/nominees' },
    ] },
  ] },
  { key: 'plan', label: 'Plan', desc: 'Budgets, goals and forecasts', icon: Target, href: '/dashboard/plan', tabs: [
    { label: 'Overview',           href: '/dashboard/plan' },
    { label: 'Budgets',            href: '/dashboard/budgets' },
    { label: 'Bills',              href: '/dashboard/bills' },
    { label: 'Goals',              href: '/dashboard/goals' },
    // Year ahead and the day-by-day cash flow: one Forecast, two views (VIEWS.forecast)
    { label: 'Forecast',           href: '/dashboard/plan/year', also: ['/dashboard/cashflow'] },
    { label: 'What if',            href: '/dashboard/plan/what-if' },
    { label: 'Events & trips',     href: '/dashboard/events' },
    { label: 'Tax planner',        href: '/dashboard/tax' },
  ] },
  { key: 'insights', label: 'Insights', desc: 'Health checks and NRI tools', icon: Sparkles, href: '/dashboard/nri-toolkit', tabs: [
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

// Views of one page, picked by chips on the page itself (components/layout/ViewChips)
export const VIEWS: Record<'reports' | 'forecast' | 'loans', NavLink[]> = {
  reports: [
    { label: 'Money', href: '/dashboard/reports' },
    { label: 'Expenses', href: '/dashboard/expenses/report' },
    { label: 'Income', href: '/dashboard/income/report' },
    { label: 'Cards', href: '/dashboard/reports/cards' },
  ],
  forecast: [
    { label: 'By month, 12 months', href: '/dashboard/plan/year' },
    { label: 'By day', href: '/dashboard/cashflow' },
  ],
  loans: [
    { label: 'All', href: '/dashboard/loans' },
    { label: 'Home', href: '/dashboard/loans/home' },
    { label: 'Car / bike', href: '/dashboard/loans/car' },
    { label: 'Personal', href: '/dashboard/loans/personal' },
    { label: 'Gold', href: '/dashboard/loans/gold' },
    { label: 'On a card', href: '/dashboard/loans/card' },
    { label: 'Other', href: '/dashboard/loans/other' },
  ],
}

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
        // A tab's own first view ("Overview", "Transactions") is listed under the tab's name
        const label = s.label === 'Overview' ? `${tab.label} overview` : s.href === tab.href ? tab.label : s.label
        out.push({ label, crumb: `${section.label} › ${tab.label}`, href: s.href, section })
      }
    }
  }
  out.push({ label: 'To do', crumb: 'Everything that needs you', href: '/dashboard/todo', section: SECTIONS[0] })
  // Views picked by chips on a page (a report type, a loan type, the day-by-day forecast)
  const named: [keyof typeof VIEWS, string, (l: string) => string][] = [['reports', 'money', l => `${l} report`], ['loans', 'wealth', l => `${l} loans`], ['forecast', 'plan', l => (l === 'By day' ? 'Cash-flow forecast' : 'Year ahead')]]
  for (const [k, sec, name] of named) {
    const section = SECTIONS.find(x => x.key === sec)!
    for (const v of VIEWS[k]) if (!out.some(o => o.href === v.href)) out.push({ label: name(v.label), crumb: `${section.label} › ${k === 'reports' ? 'Reports' : k === 'loans' ? 'Loans' : 'Forecast'}`, href: v.href, section })
  }
  return out
}

// Pages that read the period in the top bar. Plan looks ahead (only Budgets
// reads a month), holdings and balances are always "today", and Insights,
// Learn and Settings have no period: the picker isn't shown there.
export function followsPeriod(pathname: string): boolean {
  if (matches(pathname, '/dashboard/todo')) return false
  const { section } = resolveNav(pathname)
  if (!section) return true
  if (section.key === 'plan') return matches(pathname, '/dashboard/budgets')
  if (section.key === 'wealth') return matches(pathname, '/dashboard/net-worth')
  return section.key === 'home' || section.key === 'money'
}
