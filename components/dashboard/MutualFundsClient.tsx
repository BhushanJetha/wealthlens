'use client'
import { PageHeader, InsightBar, AiActions, HeroStat, KpiTile, Bars, EmptyState } from '@/components/ui/kit'
import { ListSearch } from '@/components/ui/list'
import { Wallet as IcWallet, TrendingUp as IcUp, CalendarClock as IcCal } from 'lucide-react'
import { useState, useEffect, useMemo } from 'react'
import { useViewStore } from '@/store/viewStore'
import { createClient } from '@/lib/supabase/client'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList,
  LineChart, Line, Area, AreaChart,
} from 'recharts'
import {
  RefreshCw, Plus, Pencil, CalendarClock, CheckCircle,
  XCircle, X, IndianRupee, ChevronDown, ChevronUp,
  TrendingUp, TrendingDown, Newspaper, BarChart2,
  ListFilter, ArrowUpDown, FileUp, Trash2, Rocket, Search, GraduationCap, ChevronRight,
} from 'lucide-react'
import Link from 'next/link'
import EditHoldingModal from '@/components/forms/EditHoldingModal'
import BatchPurchaseModal from '@/components/forms/BatchPurchaseModal'
import EditLotModal from '@/components/forms/EditLotModal'
import HoldingsUploadModal from '@/components/forms/HoldingsUploadModal'
import InvestmentTimeline from '@/components/dashboard/InvestmentTimeline'
import InvestmentMatrix from '@/components/dashboard/InvestmentMatrix'
import MfAnalytics from '@/components/dashboard/MfAnalytics'
import SipProjector from '@/components/dashboard/SipProjector'
import Pagination from '@/components/dashboard/Pagination'
import { holdingHref, xirr } from '@/lib/holding'
import { useRouter } from 'next/navigation'
import { recordSip, claimSipMonth, navOf } from '@/lib/sipAuto'
import { sipsOf, type Sip } from '@/lib/sips'
import SipsEditor from '@/components/forms/SipsEditor'
import { localToday } from '@/lib/insights'

// ─── constants ────────────────────────────────────────────────────────────────
const TYPE_COLORS: Record<string, string> = {
  equity: '#16A34A', debt: '#3B8EF0', hybrid: '#D97706',
  elss: '#7C3AED', index: '#0891B2', liquid: '#64748B',
}
const TYPE_LABELS: Record<string, string> = {
  equity: 'Equity', debt: 'Debt', hybrid: 'Hybrid',
  elss: 'ELSS', index: 'Index', liquid: 'Liquid',
}
// Typical category benchmark annual returns — used only for the in-app
// (WealthLens) heuristic rating & benchmark comparison, NOT an agency rating.
const BENCH: Record<string, number> = { equity: 12, debt: 7, hybrid: 10, elss: 12, index: 11, liquid: 6 }

// ─── helpers ──────────────────────────────────────────────────────────────────
function getReturn(f: any, navs: Record<string, number>): number {
  const nav = navs[f.id] ?? Number(f.current_nav ?? f.avg_nav)
  const invested = Number(f.invested_amount)
  return invested > 0 ? (Number(f.units) * nav - invested) / invested * 100 : 0
}

function computeRating(ret: number | null, type: string) {
  if (ret === null) return { stars: 0, label: 'Unrated' }
  const bench: Record<string, number> = { equity: 12, debt: 7, hybrid: 10, elss: 12, index: 11, liquid: 6 }
  const d = ret - (bench[type] ?? 10)
  if (d > 5)  return { stars: 5, label: 'Excellent' }
  if (d > 0)  return { stars: 4, label: 'Good' }
  if (d > -3) return { stars: 3, label: 'Average' }
  if (d > -8) return { stars: 2, label: 'Below Avg' }
  return { stars: 1, label: 'Underperforming' }
}

function fmt(n: number) {
  const a = Math.abs(n)
  if (a >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)}Cr`
  if (a >= 100_000)    return `₹${(n / 100_000).toFixed(2)}L`
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}

// SIP Future Value: P × [(1+r)^n - 1] / r × (1+r)
function sipFV(monthly: number, annualRate: number, months: number): number {
  if (monthly <= 0 || months <= 0) return 0
  const r = annualRate / 100 / 12
  if (r === 0) return monthly * months
  return monthly * ((Math.pow(1 + r, months) - 1) / r) * (1 + r)
}

// Long-run expectation per category: 4% floor, at most 4 points above the category default
function saneRate(r: number, fundType: string): number {
  const def = ({ equity: 13, debt: 7, hybrid: 10, elss: 13, index: 12, liquid: 6 } as Record<string, number>)[fundType] ?? 10
  return Math.round(Math.min(Math.max(r, 4, def - 4), def + 4) * 10) / 10
}

// Expected annual return rate from fund type and actual returns
function expectedRate(fundType: string, actualRetPct: number | null): number {
  const defaults: Record<string, number> = { equity: 13, debt: 7, hybrid: 10, elss: 13, index: 12, liquid: 6 }
  const def = defaults[fundType] ?? 10
  if (actualRetPct !== null && actualRetPct > -30 && actualRetPct < 100) {
    // Blend actual (60%) with category default (40%), then keep it within 4
    // points of the category's long-run return: past gains rarely repeat
    return saneRate(actualRetPct * 0.6 + def * 0.4, fundType)
  }
  return def
}

type Tab = 'portfolio' | 'analytics' | 'growth' | 'projection' | 'news'
type SortKey = 'name' | 'return' | 'value' | 'invested' | 'nav'

// ─── component ────────────────────────────────────────────────────────────────
export default function MutualFundsClient({ funds: initialFunds }: { funds: any[] }) {
  const { fxRate: FX } = useViewStore()
  const router  = useRouter()
  const supabase = createClient()

  const [funds, setFunds]             = useState(initialFunds)
  const [tab, setTab]                 = useState<Tab>('portfolio')
  const [liveNavs, setLiveNavs]       = useState<Record<string, number>>({})
  const [navLoading, setNavLoading]   = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [navError, setNavError] = useState('')
  // Funds AMFI couldn't be matched to for sure: the closest schemes, to pick from
  const [unmatched, setUnmatched] = useState<Record<string, any[]>>({})
  const [news, setNews]               = useState<any[]>([])
  const [newsLoading, setNewsLoading] = useState(true)
  const [expandedId, setExpandedId]   = useState<string | null>(null)
  const [sortBy, setSortBy]           = useState<SortKey>('value')
  const [sortDir, setSortDir]         = useState<'asc' | 'desc'>('desc')
  const [showAdd, setShowAdd]         = useState(false)
  const [showImport, setShowImport]   = useState(false)
  const [txnsByFund, setTxnsByFund]   = useState<Record<string, any[]>>({})
  const [allMfTxns, setAllMfTxns]     = useState<any[]>([])
  const [editFund, setEditFund]       = useState<any | null>(null)
  const [deleteFund, setDeleteFund]   = useState<any | null>(null)
  const [projFund, setProjFund]       = useState<string | null>(null)
  const [navCagr, setNavCagr]         = useState<Record<string, number>>({}) // fund.id → CAGR from NAV history
  const [query, setQuery]             = useState('')
  const [page, setPage]               = useState(1)
  const [pageSize, setPageSize]       = useState(20)
  const [repickFund, setRepickFund]   = useState<any | null>(null)
  const [repickQuery, setRepickQuery] = useState('')
  const [repickResults, setRepickResults] = useState<any[]>([])
  const [repickSearching, setRepickSearching] = useState(false)
  const [deleting, setDeleting]       = useState(false)
  const [sipModal, setSipModal]       = useState<any | null>(null)
  // One SIP due today (a fund can have several — lib/sips)
  const [sipReminder, setSipReminder] = useState<{ fund: any; sip: Sip } | null>(null)
  const [markingPaid, setMarkingPaid] = useState(false)
  const [addLotsFund, setAddLotsFund] = useState<any | null>(null)
  const [editLot, setEditLot]         = useState<{ fund: any; lot: any } | null>(null)
  const [lumpsumFund, setLumpsumFund] = useState<any | null>(null)
  const [lumpsumAmt, setLumpsumAmt]   = useState('')
  const [lumpsumDate, setLumpsumDate] = useState(new Date().toISOString().slice(0, 10))
  const [lumpsumNav, setLumpsumNav]   = useState('')
  const [lumpsumSaving, setLumpsumSaving] = useState(false)
  const [fundHistory, setFundHistory] = useState<Record<string, any[]>>({})
  const [schemeCodes, setSchemeCodes] = useState<Record<string, number>>({}) // fund.id → schemeCode
  const [historicalNavs, setHistoricalNavs] = useState<Record<string, Array<{ month: string; nav: number }>>>({})
  const [historyLoading, setHistoryLoading] = useState(false)

  // ── live NAV ─────────────────────────────────────────────────────────────────
  // NAVs from AMFI's official daily file, matched to each fund by its scheme
  // code, ISIN or (only when it's clear) its name, and saved (app/api/prices).
  // A fund that can't be matched keeps its NAV until you pick its scheme.
  async function fetchLiveNavs(ids?: string[]) {
    setNavLoading(true); setNavError('')
    try {
      const res = await fetch('/api/prices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'mf', ...(ids ? { ids } : {}) }) })
      const j = await res.json()
      if (!res.ok) { setNavError(j.error ?? 'NAVs couldn’t be updated just now.'); return }
      const got: Record<string, any> = {}
      for (const r of j.results ?? []) got[r.id] = r
      setLiveNavs(prev => { const n = { ...prev }; for (const r of j.results ?? []) if (r.ok) n[r.id] = r.price; return n })
      setSchemeCodes(prev => { const n = { ...prev }; for (const r of j.results ?? []) if (r.ok) n[r.id] = r.code; return n })
      setFunds(prev => prev.map(f => got[f.id]?.ok ? { ...f, current_nav: got[f.id].price, nav_date: got[f.id].date, scheme_code: got[f.id].code } : f))
      setUnmatched(prev => { const n = { ...prev }; for (const r of j.results ?? []) { if (r.ok) delete n[r.id]; else if (r.candidates) n[r.id] = r.candidates } return n })
      setLastUpdated(new Date())
    } catch { setNavError('NAVs couldn’t be updated just now.') } finally { setNavLoading(false) }
  }

  async function fetchHistoricalNavs() {
    setHistoryLoading(true)
    const hist: Record<string, Array<{ month: string; nav: number }>> = {}
    await Promise.allSettled(funds.map(async f => {
      const code = schemeCodes[f.id]
      if (!code) return
      try {
        const res = await fetch(`/api/mf-nav?schemeCode=${code}&months=24`)
        const d = await res.json()
        if (Array.isArray(d.data) && d.data.length > 0) hist[f.id] = d.data
      } catch {}
    }))
    setHistoricalNavs(hist)
    setHistoryLoading(false)
  }

  // Fetch history when analytics tab opens and scheme codes are available
  useEffect(() => {
    if (tab === 'analytics' && Object.keys(schemeCodes).length > 0 && Object.keys(historicalNavs).length === 0) {
      fetchHistoricalNavs()
    }
  }, [tab, schemeCodes]) // eslint-disable-line

  // ── fund investment history (from transactions) ───────────────────────────────
  async function loadFundHistory(fund: any) {
    if (fundHistory[fund.id]) return
    const { data } = await supabase
      .from('transactions')
      .select('txn_date, amount, description, sub_category')
      .ilike('merchant', `%${fund.fund_name.split(' ').slice(0, 2).join(' ')}%`)
      .in('txn_type', ['expense'])
      .eq('category', 'Investment')
      .order('txn_date', { ascending: false })
      .limit(20)
    setFundHistory(prev => ({ ...prev, [fund.id]: data ?? [] }))
  }

  useEffect(() => { if (funds.length > 0) fetchLiveNavs() }, []) // eslint-disable-line

  // Sync when the server sends fresh data (e.g. after a PDF import → router.refresh())
  useEffect(() => { setFunds(initialFunds) }, [initialFunds])

  // ── investment transaction history (re-runnable so it refreshes after a buy) ──
  async function loadMfTxns() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    try {
      const { data } = await supabase
        .from('investment_transactions')
        .select('*').eq('user_id', user.id).eq('asset_type', 'mutual_fund')
        .order('txn_date', { ascending: true })
      const grouped: Record<string, any[]> = {}
      ;(data ?? []).forEach((t: any) => { const k = t.asset_id ?? 'none'; (grouped[k] ||= []).push(t) })
      setTxnsByFund(grouped)
      setAllMfTxns(data ?? [])
    } catch { /* table not migrated yet */ }
  }
  useEffect(() => { loadMfTxns() }, []) // eslint-disable-line

  async function confirmDelete() {
    if (!deleteFund) return
    setDeleting(true)
    await supabase.from('investment_transactions').delete().eq('asset_id', deleteFund.id).then(() => {}, () => {})
    const { error } = await supabase.from('mutual_funds').delete().eq('id', deleteFund.id)
    if (!error) setFunds(prev => prev.filter(x => x.id !== deleteFund.id))
    setDeleting(false); setDeleteFund(null); router.refresh()
  }

  // ── re-pick the correct scheme for live NAV (fixes wrong returns/value) ────────
  async function searchSchemes(q: string) {
    if (!q.trim()) return
    setRepickSearching(true)
    try {
      const r = await fetch(`/api/mf-nav?q=${encodeURIComponent(q)}`).then(x => x.json())
      setRepickResults(Array.isArray(r) ? r.slice(0, 40) : [])
    } catch { setRepickResults([]) }
    setRepickSearching(false)
  }
  async function applyScheme(fund: any, scheme: any) {
    const code = Number(scheme.schemeCode)
    let nav = 0
    try { const nd = await fetch(`/api/mf-nav?schemeCode=${code}`).then(x => x.json()); nav = Number(nd?.data?.[0]?.nav) || 0 } catch {}
    setSchemeCodes(prev => ({ ...prev, [fund.id]: code }))
    if (nav > 0) setLiveNavs(prev => ({ ...prev, [fund.id]: nav }))
    setFunds(prev => prev.map(f => f.id === fund.id ? { ...f, scheme_code: code, ...(nav > 0 ? { current_nav: nav } : {}) } : f))
    // Save the scheme, then take its NAV (and date) from AMFI
    await supabase.from('mutual_funds').update({ scheme_code: code }).eq('id', fund.id)
    fetchLiveNavs([fund.id])
    setRepickFund(null); setRepickResults([])
  }
  useEffect(() => {
    setNewsLoading(true)
    // Filter news to the user's AMCs / fund houses (first word of each fund name)
    const terms = Array.from(new Set(funds.map(f => String(f.fund_name ?? '').trim().split(/\s+/)[0]).filter(w => w && w.length > 2))).slice(0, 10).join(',')
    fetch(`/api/market-news?topic=mf${terms ? `&terms=${encodeURIComponent(terms)}` : ''}`).then(r => r.json())
      .then(d => setNews(d.articles?.slice(0, 10) ?? []))
      .catch(() => setNews([]))
      .finally(() => setNewsLoading(false))
  }, []) // eslint-disable-line
  useEffect(() => {
    const today = new Date(); const day = today.getDate()
    const mk = `${today.getFullYear()}-${today.getMonth() + 1}`
    const ym = localToday().slice(0, 7)
    outer: for (const f of funds) for (const s of sipsOf(f)) {
      // Tracked in the database (migration 028): done once recorded or skipped this month
      if ('sip_last_month' in f && s.last_month && s.last_month >= ym) continue
      if (day >= s.day && day <= s.day + 1 && !localStorage.getItem(`sip-${f.id}-${s.id}-${mk}`)) {
        setSipReminder({ fund: f, sip: s }); break outer
      }
    }
  }, [funds])

  const navAsOf = useMemo(() => {
    const d = funds.map(f => String(f.nav_date ?? '')).filter(Boolean).sort().slice(-1)[0]
    return d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : ''
  }, [funds])

  // ── sort ──────────────────────────────────────────────────────────────────────
  const sorted = useMemo(() => {
    const arr = [...funds]
    arr.sort((a, b) => {
      let va = 0, vb = 0
      if (sortBy === 'name')     { va = a.fund_name.localeCompare(b.fund_name); vb = 0 }
      if (sortBy === 'return')   { va = getReturn(a, liveNavs); vb = getReturn(b, liveNavs) }
      if (sortBy === 'value')    { va = Number(a.units) * (liveNavs[a.id] ?? Number(a.current_nav ?? a.avg_nav)); vb = Number(b.units) * (liveNavs[b.id] ?? Number(b.current_nav ?? b.avg_nav)) }
      if (sortBy === 'invested') { va = Number(a.invested_amount); vb = Number(b.invested_amount) }
      if (sortBy === 'nav')      { va = liveNavs[a.id] ?? Number(a.current_nav ?? a.avg_nav); vb = liveNavs[b.id] ?? Number(b.current_nav ?? b.avg_nav) }
      return sortBy === 'name' ? (sortDir === 'asc' ? va : -va) : (sortDir === 'desc' ? vb - va : va - vb)
    })
    return arr
  }, [funds, liveNavs, sortBy, sortDir])

  function toggleSort(key: SortKey) {
    if (sortBy === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(key); setSortDir('desc') }
  }

  // Portfolio search filter (name or folio)
  const visible = useMemo(() =>
    query.trim() ? sorted.filter(f => `${f.fund_name} ${f.folio_number ?? ''}`.toLowerCase().includes(query.toLowerCase().trim())) : sorted,
    [sorted, query])
  useEffect(() => { setPage(1) }, [query, sortBy, sortDir])
  const paged = useMemo(() => visible.slice((page - 1) * pageSize, page * pageSize), [visible, page, pageSize])

  // Projection: expected return from the selected fund's OWN ~3y NAV history (CAGR)
  useEffect(() => {
    if (tab !== 'growth') return
    const f = funds.find(x => x.id === (projFund ?? sorted[0]?.id))
    if (!f) return
    const code = schemeCodes[f.id] ?? (f.scheme_code ? Number(f.scheme_code) : null)
    if (!code || navCagr[f.id] != null) return
    fetch(`/api/mf-nav?schemeCode=${code}&months=37`).then(r => r.json()).then(d => {
      const arr = Array.isArray(d?.data) ? d.data : []          // ascending by month (oldest first)
      if (arr.length >= 2) {
        const first = Number(arr[0].nav), last = Number(arr[arr.length - 1].nav)
        const yrs = Math.max(0.5, arr.length / 12)
        if (first > 0 && last > 0) setNavCagr(prev => ({ ...prev, [f.id]: Math.round(((Math.pow(last / first, 1 / yrs) - 1) * 100) * 10) / 10 }))
      }
    }).catch(() => {})
  }, [tab, projFund]) // eslint-disable-line

  // ── totals (only compute returns for funds with real NAV) ─────────────────────
  function getEffectiveNav(f: any): number | null {
    if (liveNavs[f.id]) return liveNavs[f.id]
    const stored = Number(f.current_nav)
    if (stored > 0 && Math.abs(stored - Number(f.avg_nav)) > 0.01) return stored
    return null // avg_nav fallback gives 0% return — don't mislead
  }

  const totalInvested   = funds.reduce((a, f) => a + Number(f.invested_amount), 0)
  const fundsWithNav    = funds.filter(f => getEffectiveNav(f) !== null)
  const investedWithNav = fundsWithNav.reduce((a, f) => a + Number(f.invested_amount), 0)
  const currentWithNav  = fundsWithNav.reduce((a, f) => a + Number(f.units) * getEffectiveNav(f)!, 0)
  // For display: show current_value = live value for known funds + invested for pending funds
  const currentValue    = currentWithNav + funds.filter(f => !getEffectiveNav(f)).reduce((a, f) => a + Number(f.invested_amount), 0)
  const totalRet        = investedWithNav > 0 ? (currentWithNav - investedWithNav) / investedWithNav * 100 : null
  const absRet          = currentWithNav - investedWithNav
  const hasAnyNav       = fundsWithNav.length > 0
  const activeSIPs      = funds.reduce((a, f) => a + sipsOf(f).length, 0)

  const byType = useMemo(() => {
    const m: Record<string, number> = {}
    funds.forEach(f => {
      const v = Number(f.units) * (liveNavs[f.id] ?? Number(f.current_nav ?? f.avg_nav))
      m[f.fund_type] = (m[f.fund_type] ?? 0) + v
    })
    return Object.entries(m).map(([type, value]) => ({
      type, value: Math.round(value), label: TYPE_LABELS[type] ?? type,
      color: TYPE_COLORS[type] ?? '#6B7280',
      pct: currentValue > 0 ? Math.round(value / currentValue * 100) : 0,
    })).sort((a, b) => b.value - a.value)
  }, [funds, liveNavs, currentValue])

  // ── SIP ───────────────────────────────────────────────────────────────────────
  function openSipModal(f: any) { setSipModal(f) }
  async function markSipPaid({ fund, sip }: { fund: any; sip: Sip }, status: 'paid' | 'skipped') {
    setMarkingPaid(true)
    // With migration 028 the month is tracked in the database (lib/sipAuto),
    // so the automatic recording on Investments never adds it again
    if ('sip_last_month' in fund) {
      const ds = localToday(), d = { fund: { ...fund }, sip, month: ds.slice(0, 7), date: ds, amount: Number(sip.amount), nav: liveNavs[fund.id] ?? navOf(fund) }
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        if (status === 'paid') await recordSip(supabase, user.id, d, { moneyRow: true })
        else await claimSipMonth(supabase, d)
        setFunds(prev => prev.map(f => f.id === fund.id ? d.fund : f))
      }
      setSipReminder(null); setMarkingPaid(false); router.refresh()
      return
    }
    const today = new Date(); const ds = today.toISOString().slice(0, 10)
    const mk = `${today.getFullYear()}-${today.getMonth() + 1}`
    if (status === 'paid') {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const nav = liveNavs[fund.id] ?? Number(fund.current_nav ?? fund.avg_nav)
        const newUnits = nav > 0 ? Number(fund.units) + Number(sip.amount) / nav : Number(fund.units)
        await Promise.all([
          supabase.from('transactions').insert({ user_id: user.id, txn_date: ds, merchant: fund.fund_name, description: `Monthly SIP - ${fund.fund_name}`, category: 'Investment', sub_category: 'SIP', amount: Number(sip.amount), currency: fund.currency ?? 'INR', country: fund.country ?? 'India', txn_type: 'expense', source: 'manual' }),
          supabase.from('mutual_funds').update({ units: newUnits, invested_amount: Number(fund.invested_amount) + Number(sip.amount) }).eq('id', fund.id),
          // Dated record so the monthly investment chart shows this SIP
          supabase.from('investment_transactions').insert({ user_id: user.id, asset_type: 'mutual_fund', asset_id: fund.id, asset_name: fund.fund_name, txn_date: ds, txn_type: 'sip', amount: Number(sip.amount), units: nav > 0 ? Number(sip.amount) / nav : null, nav, currency: fund.currency ?? 'INR', source: 'buy_action' }).then(() => {}, () => {}),
        ])
        setFunds(prev => prev.map(f => f.id === fund.id ? { ...f, units: Number(f.units) + Number(sip.amount) / nav, invested_amount: Number(f.invested_amount) + Number(sip.amount) } : f))
      }
    }
    localStorage.setItem(`sip-${fund.id}-${sip.id}-${mk}`, status)
    setSipReminder(null); setMarkingPaid(false)
    if (status === 'paid') router.refresh()
  }

  // ── lumpsum ───────────────────────────────────────────────────────────────────
  async function saveLumpsum() {
    if (!lumpsumFund || !lumpsumAmt) return
    setLumpsumSaving(true)
    // Use the NAV the user entered (for a historical buy), else the live/current NAV
    const nav = Number(lumpsumNav) > 0
      ? Number(lumpsumNav)
      : (liveNavs[lumpsumFund.id] ?? Number(lumpsumFund.current_nav ?? lumpsumFund.avg_nav))
    const amt = Number(lumpsumAmt)
    const addUnits = nav > 0 ? amt / nav : 0
    const newUnits = Number(lumpsumFund.units) + addUnits
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const ds = lumpsumDate || new Date().toISOString().slice(0, 10)
      await Promise.all([
        supabase.from('mutual_funds').update({ units: newUnits, invested_amount: Number(lumpsumFund.invested_amount) + amt }).eq('id', lumpsumFund.id),
        supabase.from('transactions').insert({ user_id: user.id, txn_date: ds, merchant: lumpsumFund.fund_name, description: `Lumpsum - ${lumpsumFund.fund_name}`, category: 'Investment', sub_category: 'Lumpsum', amount: amt, currency: lumpsumFund.currency ?? 'INR', country: lumpsumFund.country ?? 'India', txn_type: 'expense', source: 'manual' }),
        // Record in the unified buy history so it shows in the Growth timeline
        supabase.from('investment_transactions').insert({ user_id: user.id, asset_type: 'mutual_fund', asset_id: lumpsumFund.id, asset_name: lumpsumFund.fund_name, txn_date: ds, txn_type: 'purchase', amount: amt, units: addUnits, nav, currency: lumpsumFund.currency ?? 'INR', source: 'buy_action' }).then(() => {}, () => {}),
      ])
      setFunds(prev => prev.map(f => f.id === lumpsumFund.id ? { ...f, units: newUnits, invested_amount: Number(f.invested_amount) + amt } : f))
    }
    setLumpsumFund(null); setLumpsumAmt(''); setLumpsumNav(''); setLumpsumDate(new Date().toISOString().slice(0, 10)); setLumpsumSaving(false); router.refresh()
  }

  const sym = '₹'

  // ── empty state ───────────────────────────────────────────────────────────────
  if (funds.length === 0) return (
    <div>
      <EmptyState message="Add your first fund, or import a CAMS / KFintech statement, to track NAV, returns and SIP payments."
        cta="Add a fund" onCta={() => setShowAdd(true)} onImport={() => setShowImport(true)} />
      {showAdd && <BatchPurchaseModal kind="mutual_fund" onClose={() => { setShowAdd(false); router.refresh(); loadMfTxns() }} />}
      {showImport && <HoldingsUploadModal kind="mutual_funds" onClose={() => { setShowImport(false); router.refresh() }} />}
    </div>
  )

  // ── modals ────────────────────────────────────────────────────────────────────
  const Overlay = ({ children }: { children: React.ReactNode }) => (
    <div className="fixed inset-0 wl-sheet z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>{children}</div>
  )
  const Modal = ({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) => (
    <div className="wl-sheet-panel rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4" style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
      <div className="flex items-center justify-between">
        <div className="text-[15px] font-bold" style={{ color: 'var(--text)' }}>{title}</div>
        <button onClick={onClose} style={{ color: 'var(--text3)' }}><X size={16} /></button>
      </div>
      {children}
    </div>
  )

  return (
    <div className="space-y-4 animate-fade-up">

      {/* SIP Reminder */}
      {sipReminder && (
        <Overlay>
          <Modal title="SIP due today" onClose={() => setSipReminder(null)}>
            <div className="p-4 rounded-xl" style={{ background: 'var(--sage-bg)', border: '1px solid var(--sage)30' }}>
              <div className="text-[12px]" style={{ color: 'var(--text3)' }}>Monthly SIP due today</div>
              <div className="text-[14px] font-bold mt-1" style={{ color: 'var(--text)' }}>{sipReminder.fund.fund_name}</div>
              <div className="text-[22px] font-bold tabular-nums mt-1" style={{ color: 'var(--sage)' }}>
                {sym}{Number(sipReminder.sip.amount).toLocaleString('en-IN')}
              </div>
              <div className="text-[11px] mt-1" style={{ color: 'var(--text3)' }}>SIP date: {sipReminder.sip.day}th of every month{sipReminder.sip.note ? ` · ${sipReminder.sip.note}` : ''}</div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => markSipPaid(sipReminder, 'paid')} disabled={markingPaid}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-white text-[13px] font-bold"
                style={{ background: 'var(--income)' }}>
                <CheckCircle size={15} /> {markingPaid ? 'Saving…' : 'Yes, Paid ✓'}
              </button>
              <button onClick={() => markSipPaid(sipReminder, 'skipped')} disabled={markingPaid}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[13px] font-semibold border"
                style={{ borderColor: 'var(--line)', color: 'var(--text3)', background: 'var(--bg2)' }}>
                <XCircle size={15} /> Not Yet
              </button>
            </div>
          </Modal>
        </Overlay>
      )}

      {/* SIPs: as many as the fund has */}
      {sipModal && <SipsEditor fund={sipModal} onClose={() => setSipModal(null)}
        onSaved={f => { setFunds(prev => prev.map(x => (x.id === f.id ? f : x))); setSipModal(null); router.refresh() }} />}

      {/* Lumpsum */}
      {lumpsumFund && (
        <Overlay>
          <Modal title="Add Lumpsum Investment" onClose={() => { setLumpsumFund(null); setLumpsumAmt(''); setLumpsumNav(''); setLumpsumDate(new Date().toISOString().slice(0, 10)) }}>
            <div className="text-[11px] font-semibold truncate" style={{ color: 'var(--text3)' }}>{lumpsumFund.fund_name}</div>
            <div className="p-3 rounded-xl space-y-1" style={{ background: 'var(--bg2)' }}>
              <div className="text-[11px]" style={{ color: 'var(--text3)' }}>Current NAV</div>
              <div className="text-[20px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>
                {sym}{(liveNavs[lumpsumFund.id] ?? Number(lumpsumFund.current_nav ?? lumpsumFund.avg_nav)).toFixed(2)}
                {liveNavs[lumpsumFund.id] && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ background: '#D1FAE5', color: '#065F46' }}>Live</span>}
              </div>
            </div>
            <div>
              <label className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Purchase Date</label>
              <input type="date" value={lumpsumDate} max={new Date().toISOString().slice(0, 10)} onChange={e => setLumpsumDate(e.target.value)} className="wl-input mt-1 w-full" style={{ background: 'var(--bg2)' }} />
              <div className="text-[10px] mt-1" style={{ color: 'var(--text3)' }}>Pick a past date to log a historical purchase for your investment history.</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Amount (₹)</label>
                <input type="number" value={lumpsumAmt} onChange={e => setLumpsumAmt(e.target.value)} placeholder="25000" className="wl-input mt-1 w-full" style={{ background: 'var(--bg2)' }} />
              </div>
              <div>
                <label className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>NAV on that date</label>
                <input type="number" value={lumpsumNav} onChange={e => setLumpsumNav(e.target.value)}
                  placeholder={(liveNavs[lumpsumFund.id] ?? Number(lumpsumFund.current_nav ?? lumpsumFund.avg_nav)).toFixed(2)}
                  className="wl-input mt-1 w-full" style={{ background: 'var(--bg2)' }} />
              </div>
            </div>
            {lumpsumAmt && (() => {
              const navUsed = Number(lumpsumNav) > 0 ? Number(lumpsumNav) : (liveNavs[lumpsumFund.id] ?? Number(lumpsumFund.current_nav ?? lumpsumFund.avg_nav))
              return (
                <div className="text-[11px]" style={{ color: 'var(--text3)' }}>
                  ≈ {navUsed > 0 ? (Number(lumpsumAmt) / navUsed).toFixed(3) : '0'} units at {sym}{navUsed.toFixed(2)}/unit
                </div>
              )
            })()}
            <div className="flex gap-2">
              <button onClick={() => { setLumpsumFund(null); setLumpsumAmt(''); setLumpsumNav(''); setLumpsumDate(new Date().toISOString().slice(0, 10)) }} className="flex-1 py-2.5 rounded-xl border text-[12px] font-semibold" style={{ borderColor: 'var(--line)', color: 'var(--text3)', background: 'var(--bg2)' }}>Cancel</button>
              <button onClick={saveLumpsum} disabled={lumpsumSaving || !lumpsumAmt} className="flex-1 py-2.5 rounded-xl text-white text-[12px] font-bold" style={{ background: 'var(--sage)', opacity: !lumpsumAmt ? 0.5 : 1 }}>{lumpsumSaving ? 'Saving…' : 'Invest'}</button>
            </div>
          </Modal>
        </Overlay>
      )}

      <PageHeader title="Mutual funds" sub={navLoading ? 'Getting the latest NAVs from AMFI…' : navAsOf ? `NAV of ${navAsOf} · from AMFI, the same in every app` : 'NAVs from AMFI'}
        onAdd={() => setShowAdd(true)} addLabel="Add fund"
        actions={<>
          <button onClick={() => fetchLiveNavs()} disabled={navLoading} className="wl-btn" style={{ height: 34 }}><RefreshCw size={13} className={navLoading ? 'animate-spin' : ''} />{navLoading ? 'Updating…' : 'Refresh NAV'}</button>
          <button onClick={() => setShowImport(true)} className="wl-btn" style={{ height: 34 }}><FileUp size={13} />Import PDF</button>
          <Link href="/dashboard/learn" className="wl-btn" style={{ height: 34 }}><GraduationCap size={13} />Learn</Link>
          <button onClick={() => setShowAdd(true)} className="wl-btn wl-btn-primary" style={{ height: 34 }}><Plus size={14} />Add fund</button>
        </>} />
      {/* Phone: header actions are desktop-only */}
      <div className="md:hidden flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4">
        <button onClick={() => fetchLiveNavs()} disabled={navLoading} className="wl-chip flex-shrink-0">{navLoading ? 'Updating…' : 'Refresh NAV'}</button>
        <button onClick={() => setShowImport(true)} className="wl-chip flex-shrink-0">Import PDF</button>
        <Link href="/dashboard/learn" className="wl-chip flex-shrink-0">Learn</Link>
      </div>
      {navError && <div className="wl-card px-4 py-3 text-[12.5px]" style={{ background: '#FFF7E6', borderColor: '#F8DDB8', color: '#92560B' }}>{navError} The values below use the last NAV saved.</div>}
      {Object.keys(unmatched).length > 0 && (
        <div className="wl-card px-4 py-3 flex flex-col gap-2" style={{ background: '#FFF8EC', borderColor: '#F6DDB4' }}>
          <div className="text-[13px] font-semibold" style={{ color: '#7A4A06' }}>Pick the exact scheme for {Object.keys(unmatched).length === 1 ? 'this fund' : `these ${Object.keys(unmatched).length} funds`}</div>
          <div className="text-[12.5px] leading-snug" style={{ color: '#8A5A12' }}>The name doesn’t say for sure whether it’s the Direct or Regular plan, Growth or IDCW — and each has a different NAV. Until you pick, its value uses the last NAV saved.</div>
          {funds.filter(f => unmatched[f.id]).map(f => (
            <div key={f.id} className="flex items-center justify-between gap-3 py-1" style={{ borderTop: '1px solid #F6E3C4' }}>
              <span className="text-[13px] min-w-0 truncate" style={{ color: 'var(--text)' }}>{f.fund_name}</span>
              <button onClick={() => { setRepickFund(f); setRepickQuery(String(f.fund_name).split(/\s+-\s+|\s+/).slice(0, 4).join(' ')); setRepickResults(unmatched[f.id].map((c: any) => ({ schemeCode: c.code, schemeName: [c.name, c.plan === 'direct' ? 'Direct' : c.plan === 'regular' ? 'Regular' : null, c.option].filter(Boolean).join(' · '), nav: c.nav }))) }}
                className="wl-btn flex-shrink-0" style={{ height: 32, fontSize: 12.5 }}>Pick</button>
            </div>
          ))}
        </div>
      )}
      {funds.length > 0 && <InsightBar text={`${funds.length} fund${funds.length === 1 ? '' : 's'} worth ${fmt(currentValue)}${totalRet != null ? `, ${totalRet >= 0 ? 'up' : 'down'} ${Math.abs(totalRet).toFixed(1)}% on what you put in` : ''}. ${activeSIPs ? `${activeSIPs} SIP${activeSIPs === 1 ? '' : 's'} running.` : 'No SIPs running yet.'}`} prompt={`My mutual funds: ${funds.slice(0, 15).map(f => `${f.fund_name} (${f.fund_type})`).join(', ')}. Invested ${fmt(totalInvested)}, worth ${fmt(currentValue)}, ${activeSIPs} active SIPs.`} />}
      {funds.length > 0 && <AiActions actions={['Check my fund overlap', 'Is my SIP enough for my goals?']} context={`My mutual funds: ${funds.slice(0, 15).map(f => `${f.fund_name} (${f.fund_type})`).join(', ')}. Invested ${fmt(totalInvested)}, worth ${fmt(currentValue)}, ${activeSIPs} active SIPs.`} />}

      {/* ── Summary: value, gain, yearly return, invested, SIPs, and the mix ── */}
      {funds.length > 0 && (() => {
        const MIX = [{ k: 'Equity', c: '#6A55E8' }, { k: 'Debt', c: '#2E8FD8' }, { k: 'Hybrid', c: '#E58A2B' }, { k: 'Gold', c: '#C9A227' }]
        const mixOf = (f: any) => /gold|silver/i.test(String(f.fund_name)) ? 'Gold' : ['debt', 'liquid'].includes(f.fund_type) ? 'Debt' : f.fund_type === 'hybrid' ? 'Hybrid' : 'Equity'
        const valOf = (f: any) => { const n = getEffectiveNav(f); return n != null ? Number(f.units) * n : Number(f.invested_amount) }
        const mix = MIX.map(x => ({ ...x, v: funds.filter(f => mixOf(f) === x.k).reduce((s, f) => s + valOf(f), 0) })).filter(x => x.v > 0)
        const mixTotal = mix.reduce((s, x) => s + x.v, 0)
        // Yearly return across all funds, from dated purchases (only when they explain most of what went in)
        const dated = allMfTxns.filter((t: any) => ['purchase', 'sip', 'switch_in'].includes(t.txn_type)).reduce((s: number, t: any) => s + (Number(t.amount) || 0), 0)
        const yearly = hasAnyNav && totalInvested > 0 && dated >= totalInvested * 0.8
          ? xirr([...allMfTxns.filter((t: any) => Number(t.amount) > 0 && t.txn_type !== 'dividend').map((t: any) => ({ t: Date.parse(t.txn_date), a: ['redemption', 'switch_out'].includes(t.txn_type) ? Number(t.amount) : -Number(t.amount) })), { t: Date.now(), a: currentValue }])
          : null
        const sipMonthly = funds.filter(f => f.has_sip && f.sip_amount).reduce((a, f) => a + Number(f.sip_amount), 0)
        return (
          <section className="wl-card p-4 md:p-6 flex flex-col gap-4 md:gap-5">
            <div className="flex justify-between gap-4 md:gap-6 flex-wrap">
              <div>
                <div className="text-[12.5px] md:text-[13px]" style={{ color: 'var(--text3)' }}>Value today</div>
                <div className="text-[28px] md:text-[36px] font-bold tracking-[-0.02em] tabular-nums" style={{ color: 'var(--text)' }}>{hasAnyNav ? fmt(currentValue) : `${fmt(totalInvested)}*`}</div>
                <div className="text-[13px] md:text-[14px] font-semibold mt-0.5" style={{ color: totalRet == null ? 'var(--text3)' : totalRet >= 0 ? 'var(--pos-text)' : '#B4231A' }}>
                  {totalRet == null ? 'Refresh NAV to see returns' : `${absRet >= 0 ? '+' : '−'}${fmt(Math.abs(absRet))} · ${totalRet >= 0 ? '+' : ''}${totalRet.toFixed(1)}% on what you put in`}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 md:gap-3 w-full md:w-auto md:min-w-[440px]">
                {[['Invested', fmt(totalInvested)], ['Yearly return', yearly != null ? `${yearly}%` : '—'], ['SIPs a month', sipMonthly ? `${fmt(sipMonthly)} · ${activeSIPs}` : 'None']].map(([k, v]) => (
                  <div key={k} className="rounded-xl px-3 py-2.5" style={{ background: 'var(--bg2)' }}>
                    <div className="text-[11.5px] md:text-[12px]" style={{ color: 'var(--text3)' }}>{k}</div>
                    <div className="text-[14px] md:text-[17px] font-bold tabular-nums mt-0.5 truncate" style={{ color: 'var(--text)' }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
            {mixTotal > 0 && (
              <div>
                <div className="flex h-2.5 rounded-full overflow-hidden gap-[2px]" role="img" aria-label={mix.map(x => `${x.k} ${Math.round(x.v / mixTotal * 100)}%`).join(', ')}>
                  {mix.map(x => <div key={x.k} style={{ width: `${x.v / mixTotal * 100}%`, background: x.c }} />)}
                </div>
                <div className="flex gap-x-4 gap-y-1 mt-2 text-[12px] md:text-[12.5px] flex-wrap" style={{ color: 'var(--text2)' }}>
                  {mix.map(x => <span key={x.k}><i className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: x.c }} />{x.k} {Math.round(x.v / mixTotal * 100)}%</span>)}
                  <Link href="/dashboard/portfolio" className="md:ml-auto font-semibold" style={{ color: 'var(--accent2)' }}>Check against your target</Link>
                </div>
              </div>
            )}
            {!hasAnyNav && <p className="text-[11.5px]" style={{ color: 'var(--text4)' }}>* What you put in, until live NAV loads.</p>}
          </section>
        )
      })()}

      {/* ── Three views ─────────────────────────────────────────────────────── */}
      <div className="flex gap-1 p-1 rounded-xl w-fit max-w-full overflow-x-auto no-scrollbar max-md:sticky max-md:top-0 max-md:z-20" style={{ background: '#EBEAF3' }} role="tablist" aria-label="Mutual fund views">
        {([['portfolio', 'Holdings'], ['analytics', 'Insights'], ['growth', 'Growth & future']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key as Tab)} role="tab" aria-selected={tab === key}
            className="h-9 px-3.5 md:px-[18px] rounded-[9px] text-[13px] font-semibold whitespace-nowrap"
            style={tab === key ? { background: '#fff', color: 'var(--text)', boxShadow: '0 1px 2px rgba(20,22,41,.08)' } : { color: 'var(--text3)' }}>{label}</button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* HOLDINGS: each fund opens its own page                                */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'portfolio' && (
        <div className="wl-card overflow-hidden">
          <div className="px-4 md:px-5 pt-3.5 md:pt-4 pb-3">
            <ListSearch value={query} onChange={setQuery} placeholder="Search fund or folio…">
              <select value={`${sortBy}-${sortDir}`} aria-label="Sort"
                onChange={e => { const [k, d] = e.target.value.split('-'); setSortBy(k as SortKey); setSortDir(d as 'asc' | 'desc') }}
                className="wl-input max-w-[44%]" style={{ background: '#fff', width: 'auto', height: 36 }}>
                <option value="value-desc">Value ↓</option>
                <option value="return-desc">Return ↓</option>
                <option value="return-asc">Return ↑</option>
                <option value="invested-desc">Invested ↓</option>
                <option value="name-asc">Name A–Z</option>
              </select>
            </ListSearch>
          </div>
          <div className="hidden md:grid grid-cols-[minmax(0,3fr)_repeat(3,minmax(0,1fr))_minmax(0,1.3fr)_20px] gap-3 px-5 py-2 text-[11px] font-semibold uppercase tracking-[.05em]" style={{ background: '#FAFAFE', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)', color: 'var(--text3)' }}>
            <span>Fund</span><span className="text-right">Invested</span><span className="text-right">Value</span><span className="text-right">Return</span><span>Share of funds</span><span />
          </div>
          {paged.map(f => {
            const eff = getEffectiveNav(f), invested = Number(f.invested_amount)
            const val = eff != null ? Number(f.units) * eff : invested
            const ret = eff != null && invested > 0 ? (val - invested) / invested * 100 : null
            const tc = TYPE_COLORS[f.fund_type] ?? '#6B7280'
            const share = currentValue > 0 ? val / currentValue * 100 : 0
            const meta = [TYPE_LABELS[f.fund_type] ?? f.fund_type, f.has_sip && f.sip_amount ? `${sipsOf(f).length > 1 ? `${sipsOf(f).length} SIPs` : 'SIP'} ₹${Number(f.sip_amount).toLocaleString('en-IN')}` : null].filter(Boolean).join(' · ')
            const retColor = ret == null ? 'var(--text3)' : ret >= 0 ? 'var(--pos-text)' : '#B4231A'
            return (
              <Link key={f.id} href={holdingHref('mutual_funds', f.id)} className="grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,3fr)_repeat(3,minmax(0,1fr))_minmax(0,1.3fr)_20px] gap-3 px-4 md:px-5 py-3 items-center hover:bg-[#FAFAFE] transition-colors" style={{ borderBottom: '1px solid #F1F0F7' }}>
                <span className="flex items-center gap-3 min-w-0">
                  <span className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0 text-[14px] font-bold" style={{ background: tc + '1A', color: tc }}>{String(f.fund_name).trim()[0]}</span>
                  <span className="min-w-0">
                    <span className="block text-[13.5px] md:text-[14px] font-semibold truncate" style={{ color: 'var(--text)' }}>{f.fund_name}</span>
                    <span className="block text-[11.5px] md:text-[12px] truncate mt-px" style={{ color: 'var(--text3)' }}>{meta}<span className="md:hidden"> · <b style={{ color: retColor }}>{ret == null ? 'no NAV' : `${ret >= 0 ? '+' : ''}${ret.toFixed(1)}%`}</b></span></span>
                  </span>
                </span>
                <span className="md:hidden text-right"><span className="block text-[13.5px] font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{fmt(val)}</span><span className="block text-[11px] tabular-nums" style={{ color: 'var(--text4)' }}>{share.toFixed(0)}% · {fmt(invested)} in</span></span>
                <span className="hidden md:block text-right text-[13px] tabular-nums" style={{ color: 'var(--text2)' }}>{fmt(invested)}</span>
                <span className="hidden md:block text-right text-[14px] font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{fmt(val)}</span>
                <span className="hidden md:block text-right"><span className="block text-[13.5px] font-semibold tabular-nums" style={{ color: retColor }}>{ret == null ? '—' : `${ret >= 0 ? '+' : ''}${ret.toFixed(1)}%`}</span><span className="block text-[11.5px] tabular-nums" style={{ color: 'var(--text3)' }}>{ret == null ? 'refresh NAV' : `${val - invested >= 0 ? '+' : '−'}${fmt(Math.abs(val - invested))}`}</span></span>
                <span className="hidden md:flex items-center gap-2"><span className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--track)' }}><span className="block h-full rounded-full" style={{ width: `${Math.min(100, share)}%`, background: 'var(--accent)' }} /></span><span className="text-[12px] tabular-nums w-9 text-right" style={{ color: 'var(--text3)' }}>{share.toFixed(0)}%</span></span>
                <ChevronRight size={16} className="hidden md:block" style={{ color: 'var(--text4)' }} />
              </Link>
            )
          })}
          {visible.length === 0 && <div className="px-5 py-8 text-center text-[13px]" style={{ color: 'var(--text3)' }}>{funds.length ? 'No fund matches your search.' : 'No funds yet. Add one, or import a CAMS / KFintech statement.'}</div>}
          <Pagination total={visible.length} page={page} pageSize={pageSize}
            onPage={setPage} onPageSize={s => { setPageSize(s); setPage(1) }} />
          {funds.length > 0 && <div className="px-5 py-3 text-[12px]" style={{ color: 'var(--text3)' }}>Open a fund for its NAV chart, every purchase, its SIP, tax if you redeem, and where it could go.</div>}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB 2: ANALYTICS                                                      */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'analytics' && (
        <MfAnalytics funds={funds} navOf={getEffectiveNav} txnsByFund={txnsByFund} allTxns={allMfTxns} currency="INR" />
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB 3: NEWS                                                           */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'analytics' && (
        <div className="wl-card px-4 md:px-5 py-4 md:py-[18px]">
          <div className="flex items-center gap-2.5 mb-3">
            <span className="w-8 h-8 rounded-[10px] flex items-center justify-center" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}><Newspaper size={15} /></span>
            <h3 className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Mutual fund news</h3>
          </div>
          {newsLoading ? (
            <div className="space-y-3">
              {[1,2,3,4,5].map(i => <div key={i} className="h-14 rounded-xl animate-pulse" style={{ background: '#E8EBF0' }} />)}
            </div>
          ) : news.length === 0 ? (
            <div className="text-center py-10 text-[13px]" style={{ color: 'var(--text3)' }}>News is unavailable right now. Try again in a moment.</div>
          ) : (
            <div className="-mx-4 md:-mx-5 -mb-1">
              {news.map((article, i) => (
                <a key={i} href={article.link} target="_blank" rel="noopener noreferrer"
                  className="flex items-start gap-3 px-4 md:px-5 py-3 hover:bg-[#FAFAFE] transition-colors"
                  style={{ borderTop: i ? '1px solid var(--track)' : '1px solid var(--line)' }}>
                  <span className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}><Newspaper size={14} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-semibold leading-snug" style={{ color: 'var(--text)' }}>{article.title}</span>
                    <span className="block text-[11.5px] mt-1" style={{ color: 'var(--text4)' }}>
                      {article.source} · {article.pubDate ? new Date(article.pubDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                    </span>
                  </span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: GROWTH (Month-on-Month / Year-on-Year)                          */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'growth' && (
        <div className="space-y-4">
          <div className="wl-card px-4 md:px-5 py-4 md:py-[18px]">
            <div className="flex items-center gap-2.5 mb-3.5">
              <span className="w-8 h-8 rounded-[10px] flex items-center justify-center" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}><TrendingUp size={15} /></span>
              <h3 className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>How your funds have grown</h3>
            </div>
            <InvestmentTimeline txns={allMfTxns} invested={totalInvested} currentValue={currentValue} />
          </div>

          {allMfTxns.length === 0 && (
            <div className="rounded-xl px-4 py-3 text-[12.5px] leading-snug" style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', color: 'var(--accent2)' }}>
              Import a CAMS statement (<b>Import PDF</b> above) to load your full history and see growth month by month and year by year.
            </div>
          )}

          <div className="wl-card px-4 md:px-5 py-4 md:py-[18px]">
            <h3 className="text-[14px] md:text-[15px] font-semibold mb-3" style={{ color: 'var(--text)' }}>Invested each year, by fund</h3>
            <InvestmentMatrix
              assets={sorted.map(f => {
                const eff = getEffectiveNav(f)
                return { id: f.id, name: f.fund_name, invested: Number(f.invested_amount), currentValue: eff != null ? Number(f.units) * eff : Number(f.invested_amount) }
              })}
              txnsByAsset={txnsByFund}
            />
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB: PROJECTION (future corpus)                                       */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'growth' && (() => {
        const fundVal = (f: any) => { const eff = getEffectiveNav(f); return eff != null ? Number(f.units) * eff : Number(f.invested_amount) }
        // Annualised (CAGR) return over the holding period — NOT the total/absolute return
        const fundCagr = (f: any): number | null => {
          const eff = getEffectiveNav(f); const inv = Number(f.invested_amount)
          if (eff == null || inv <= 0) return null
          const cur = Number(f.units) * eff
          const first = (txnsByFund[f.id] ?? []).map((t: any) => t.txn_date).filter(Boolean).sort()[0] ?? f.created_at
          const yrs = first ? Math.max(0.5, (Date.now() - new Date(first).getTime()) / (365.25 * 864e5)) : 1
          return (Math.pow(cur / inv, 1 / yrs) - 1) * 100
        }
        const fundRate = (f: any) => Math.round(expectedRate(f.fund_type, fundCagr(f)) * 10) / 10
        const sipTotal = funds.reduce((a, f) => a + (f.has_sip && f.sip_amount ? Number(f.sip_amount) : 0), 0)
        let wsum = 0, vsum = 0
        funds.forEach(f => { const v = fundVal(f); wsum += fundRate(f) * v; vsum += v })
        const blended = vsum > 0 ? Math.round((wsum / vsum) * 10) / 10 : 12
        const overallCorpus = funds.reduce((a, f) => a + fundVal(f), 0)
        const selFund = funds.find(x => x.id === (projFund ?? sorted[0]?.id)) ?? sorted[0]

        return (
          <div className="space-y-4">
            <div className="wl-card px-4 md:px-5 py-4 md:py-[18px]">
              <div className="flex items-center gap-2.5 mb-2">
                <span className="w-8 h-8 rounded-[10px] flex items-center justify-center" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}><Rocket size={15} /></span>
                <h3 className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Where all your funds are headed</h3>
              </div>
              {sipTotal === 0 ? (
                <p className="text-[12.5px] pb-2" style={{ color: 'var(--text3)' }}>
                  No SIPs running yet. Import a CAMS statement (SIPs are detected) or set a SIP on a fund, or type any amount below to try it.
                </p>
              ) : null}
              <SipProjector key={`ov-${Math.round(overallCorpus)}-${sipTotal}-${blended}`}
                currentValue={overallCorpus} monthlySip={sipTotal} annualRate={blended}
                subtitle={`${activeSIPs} active SIP${activeSIPs !== 1 ? 's' : ''} · ₹${sipTotal.toLocaleString('en-IN')}/mo · blended expected return ${blended}%/yr`} />
            </div>

            <div className="wl-card px-4 md:px-5 py-4 md:py-[18px]">
              <div className="mb-3.5">
                <div className="flex items-center gap-2.5 mb-2.5">
                  <span className="w-8 h-8 rounded-[10px] flex items-center justify-center" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}><Rocket size={15} /></span>
                  <h3 className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>One fund</h3>
                </div>
                <select value={selFund?.id ?? ''} onChange={e => setProjFund(e.target.value)} aria-label="Fund to project"
                  className="wl-input text-[13.5px] font-semibold w-full md:max-w-[460px]" style={{ background: '#fff' }}>
                  {sorted.map(f => <option key={f.id} value={f.id}>{f.fund_name}</option>)}
                </select>
                <p className="text-[11.5px] mt-1.5" style={{ color: 'var(--text4)' }}>Starts from the fund&apos;s value today and uses its expected return.</p>
              </div>
              {selFund && (() => {
                const selRate = saneRate(navCagr[selFund.id] ?? fundRate(selFund), selFund.fund_type)
                const basis = navCagr[selFund.id] != null ? "its 3-year NAV history, kept within its category's long-run range" : 'its category and your realised return'
                return (
                  <SipProjector key={`${selFund.id}-${selRate}`}
                    currentValue={fundVal(selFund)} monthlySip={selFund.has_sip && selFund.sip_amount ? Number(selFund.sip_amount) : 0}
                    annualRate={selRate} subtitle={`${selFund.fund_name} · expected ${selRate}%/yr (from ${basis})`} />
                )
              })()}
            </div>
          </div>
        )
      })()}

      {showAdd && <BatchPurchaseModal kind="mutual_fund" onClose={() => { setShowAdd(false); router.refresh(); loadMfTxns() }} />}
      {showImport && <HoldingsUploadModal kind="mutual_funds" onClose={() => { setShowImport(false); router.refresh() }} />}
      {addLotsFund && <BatchPurchaseModal kind="mutual_fund" existing={addLotsFund} onClose={() => { const f = addLotsFund; setAddLotsFund(null); router.refresh(); loadMfTxns(); if (f) loadFundHistory(f) }} />}
      {editLot && <EditLotModal kind="mutual_fund" holding={editLot.fund} lot={editLot.lot} onClose={() => { setEditLot(null); router.refresh(); loadMfTxns() }} />}
      {editFund && <EditHoldingModal kind="mutual_fund" row={editFund} onClose={() => { setEditFund(null); router.refresh() }} />}
      {repickFund && (
        <Overlay>
          <Modal title="Match the correct scheme" onClose={() => { setRepickFund(null); setRepickResults([]) }}>
            <div className="text-[11px]" style={{ color: 'var(--text3)' }}>
              Pick the exact scheme so live NAV, returns &amp; current value are accurate for <strong style={{ color: 'var(--text)' }}>{repickFund.fund_name}</strong>.
            </div>
            <div className="flex gap-2">
              <input value={repickQuery} onChange={e => setRepickQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && searchSchemes(repickQuery)}
                placeholder="Search scheme name…" className="wl-input flex-1" style={{ background: 'var(--bg2)' }} autoFocus />
              <button onClick={() => searchSchemes(repickQuery)} className="px-4 rounded-lg text-white text-[12px] font-bold" style={{ background: 'var(--sage)' }}>Search</button>
            </div>
            <div className="space-y-1 overflow-y-auto" style={{ maxHeight: 300 }}>
              {repickSearching ? (
                <div className="text-[12px] text-center py-6" style={{ color: 'var(--text3)' }}>Searching…</div>
              ) : repickResults.length === 0 ? (
                <div className="text-[12px] text-center py-6" style={{ color: 'var(--text3)' }}>No matches — try fewer words.</div>
              ) : repickResults.map((s: any) => (
                <button key={s.schemeCode} onClick={() => applyScheme(repickFund, s)}
                  className="w-full text-left px-3 py-2 rounded-lg border text-[11px] transition-colors hover:brightness-95"
                  style={{ borderColor: 'var(--line)', background: 'var(--bg2)', color: 'var(--text)' }}>
                  {s.schemeName}
                  <div className="text-[9px]" style={{ color: 'var(--text3)' }}>Code {s.schemeCode}{s.nav ? ` · NAV ₹${Number(s.nav).toLocaleString('en-IN', { maximumFractionDigits: 4 })}` : ''}</div>
                </button>
              ))}
            </div>
          </Modal>
        </Overlay>
      )}
      {deleteFund && (
        <Overlay>
          <Modal title="Delete Fund?" onClose={() => setDeleteFund(null)}>
            <div className="text-[12px]" style={{ color: 'var(--text2)' }}>
              Remove <strong style={{ color: 'var(--text)' }}>{deleteFund.fund_name}</strong> and its imported transaction history? This can't be undone.
            </div>
            <div className="flex gap-2">
              <button onClick={() => setDeleteFund(null)} className="flex-1 py-2.5 rounded-xl border text-[12px] font-semibold" style={{ borderColor: 'var(--line)', color: 'var(--text3)', background: 'var(--bg2)' }}>Cancel</button>
              <button onClick={confirmDelete} disabled={deleting} className="flex-1 py-2.5 rounded-xl text-white text-[12px] font-bold" style={{ background: 'var(--rose)' }}>{deleting ? 'Deleting…' : 'Delete'}</button>
            </div>
          </Modal>
        </Overlay>
      )}
    </div>
  )
}
