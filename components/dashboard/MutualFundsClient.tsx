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
  ListFilter, ArrowUpDown, FileUp, Trash2, Rocket, Search, GraduationCap,
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
import { useRouter } from 'next/navigation'

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

function pickBestScheme(schemes: any[], fundName: string): any | null {
  if (!schemes?.length) return null
  const lo = fundName.toLowerCase()
  return schemes.map((s: any) => {
    const sn = (s.schemeName || '').toLowerCase()
    let score = 0
    if (sn.includes('growth') && !sn.includes('idcw') && !sn.includes('dividend')) score += 30
    if (sn.includes('idcw') || sn.includes('dividend')) score -= 20
    if (sn.includes('direct')) score += 5
    if (sn.includes('regular')) score -= 5
    lo.split(/\s+/).filter((w: string) => w.length > 3).forEach((w: string) => { if (sn.includes(w)) score += 2 })
    return { ...s, score }
  }).sort((a: any, b: any) => b.score - a.score)[0]
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
  const [news, setNews]               = useState<any[]>([])
  const [newsLoading, setNewsLoading] = useState(true)
  const [expandedId, setExpandedId]   = useState<string | null>(null)
  const [sortBy, setSortBy]           = useState<SortKey>('return')
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
  const [sipForm, setSipForm]         = useState({ has_sip: false, sip_amount: '', sip_date: '5' })
  const [sipSaving, setSipSaving]     = useState(false)
  const [sipReminder, setSipReminder] = useState<any | null>(null)
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
  async function fetchLiveNavs() {
    setNavLoading(true)
    const r: Record<string, number> = {}
    const codes: Record<string, number> = { ...schemeCodes }
    const updates: Array<{ id: string; nav: number; code: number }> = []
    await Promise.allSettled(funds.map(async f => {
      try {
        // Use the cached scheme code first (exact match); only search by name if unknown
        let code: number | null = codes[f.id] ?? (f.scheme_code ? Number(f.scheme_code) : null)
        if (!code) {
          const q = f.fund_name.split(' ').slice(0, 4).join(' ')
          const schemes = await fetch(`/api/mf-nav?q=${encodeURIComponent(q)}`).then(x => x.json())
          const best = pickBestScheme(Array.isArray(schemes) ? schemes : [], f.fund_name)
          if (best) code = best.schemeCode
        }
        if (!code) return
        codes[f.id] = code
        const nd  = await fetch(`/api/mf-nav?schemeCode=${code}`).then(x => x.json())
        const nav = Number(nd?.data?.[0]?.nav)
        if (nav > 0) { r[f.id] = nav; updates.push({ id: f.id, nav, code }) }
      } catch {}
    }))
    setLiveNavs(r)
    setSchemeCodes(codes)
    setLastUpdated(new Date())
    setNavLoading(false)

    // Persist last-fetched NAV (shown instantly next visit) + matched scheme code.
    // Split into two updates so NAV still caches even before migration 013 adds scheme_code.
    const nowIso = new Date().toISOString()
    for (const u of updates) {
      supabase.from('mutual_funds').update({ current_nav: u.nav, last_updated: nowIso }).eq('id', u.id).then(() => {}, () => {})
      supabase.from('mutual_funds').update({ scheme_code: u.code }).eq('id', u.id).then(() => {}, () => {})
    }
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
    if (nav > 0) supabase.from('mutual_funds').update({ current_nav: nav, last_updated: new Date().toISOString() }).eq('id', fund.id).then(() => {}, () => {})
    supabase.from('mutual_funds').update({ scheme_code: code }).eq('id', fund.id).then(() => {}, () => {})
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
    for (const f of funds) {
      if (!f.has_sip || !f.sip_date) continue
      const sd = Number(f.sip_date)
      if (day >= sd && day <= sd + 1 && !localStorage.getItem(`sip-${f.id}-${mk}`)) {
        setSipReminder(f); break
      }
    }
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
    if (tab !== 'projection') return
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
  const activeSIPs      = funds.filter(f => f.has_sip && f.sip_amount).length

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
  function openSipModal(f: any) {
    setSipForm({ has_sip: !!f.has_sip, sip_amount: f.sip_amount ? String(f.sip_amount) : '', sip_date: f.sip_date ? String(f.sip_date) : '5' })
    setSipModal(f)
  }
  async function saveSip() {
    if (!sipModal) return
    setSipSaving(true)
    const payload = { has_sip: sipForm.has_sip, sip_amount: sipForm.has_sip && sipForm.sip_amount ? Number(sipForm.sip_amount) : null, sip_date: sipForm.has_sip && sipForm.sip_date ? Number(sipForm.sip_date) : null }
    const { error } = await supabase.from('mutual_funds').update(payload).eq('id', sipModal.id)
    if (!error) { setFunds(prev => prev.map(f => f.id === sipModal.id ? { ...f, ...payload } : f)); setSipModal(null) }
    setSipSaving(false)
  }
  async function markSipPaid(fund: any, status: 'paid' | 'skipped') {
    setMarkingPaid(true)
    const today = new Date(); const ds = today.toISOString().slice(0, 10)
    const mk = `${today.getFullYear()}-${today.getMonth() + 1}`
    if (status === 'paid') {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const nav = liveNavs[fund.id] ?? Number(fund.current_nav ?? fund.avg_nav)
        const newUnits = nav > 0 ? Number(fund.units) + Number(fund.sip_amount) / nav : Number(fund.units)
        await Promise.all([
          supabase.from('transactions').insert({ user_id: user.id, txn_date: ds, merchant: fund.fund_name, description: `Monthly SIP - ${fund.fund_name}`, category: 'Investment', sub_category: 'SIP', amount: Number(fund.sip_amount), currency: fund.currency ?? 'INR', country: fund.country ?? 'India', txn_type: 'expense', source: 'manual' }),
          supabase.from('mutual_funds').update({ units: newUnits, invested_amount: Number(fund.invested_amount) + Number(fund.sip_amount) }).eq('id', fund.id),
          // Dated record so the monthly investment chart shows this SIP
          supabase.from('investment_transactions').insert({ user_id: user.id, asset_type: 'mutual_fund', asset_id: fund.id, asset_name: fund.fund_name, txn_date: ds, txn_type: 'sip', amount: Number(fund.sip_amount), units: nav > 0 ? Number(fund.sip_amount) / nav : null, nav, currency: fund.currency ?? 'INR', source: 'buy_action' }).then(() => {}, () => {}),
        ])
        setFunds(prev => prev.map(f => f.id === fund.id ? { ...f, units: Number(f.units) + Number(fund.sip_amount) / nav, invested_amount: Number(f.invested_amount) + Number(fund.sip_amount) } : f))
      }
    }
    localStorage.setItem(`sip-${fund.id}-${mk}`, status)
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
              <div className="text-[14px] font-bold mt-1" style={{ color: 'var(--text)' }}>{sipReminder.fund_name}</div>
              <div className="text-[22px] font-bold tabular-nums mt-1" style={{ color: 'var(--sage)' }}>
                {sym}{Number(sipReminder.sip_amount).toLocaleString('en-IN')}
              </div>
              <div className="text-[11px] mt-1" style={{ color: 'var(--text3)' }}>SIP date: {sipReminder.sip_date}th of every month</div>
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

      {/* SIP Config */}
      {sipModal && (
        <Overlay>
          <Modal title="Configure SIP" onClose={() => setSipModal(null)}>
            <div className="text-[11px] font-semibold truncate" style={{ color: 'var(--text3)' }}>{sipModal.fund_name}</div>
            <label className="flex items-center gap-3 cursor-pointer py-2">
              <input type="checkbox" checked={sipForm.has_sip} onChange={e => setSipForm(p => ({ ...p, has_sip: e.target.checked }))} className="w-4 h-4 accent-green-600" />
              <span className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>I have a SIP in this fund</span>
            </label>
            {sipForm.has_sip && (
              <div className="space-y-3">
                <div>
                  <label className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Monthly SIP Amount (₹)</label>
                  <input type="number" value={sipForm.sip_amount} onChange={e => setSipForm(p => ({ ...p, sip_amount: e.target.value }))} placeholder="5000" className="wl-input mt-1 w-full" style={{ background: 'var(--bg2)' }} />
                </div>
                <div>
                  <label className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>SIP Date (1–28)</label>
                  <input type="number" min={1} max={28} value={sipForm.sip_date} onChange={e => setSipForm(p => ({ ...p, sip_date: e.target.value }))} className="wl-input mt-1 w-full" style={{ background: 'var(--bg2)' }} />
                  <div className="text-[10px] mt-1" style={{ color: 'var(--text3)' }}>You'll see a reminder on this day each month</div>
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setSipModal(null)} className="flex-1 py-2.5 rounded-xl border text-[12px] font-semibold" style={{ borderColor: 'var(--line)', color: 'var(--text3)', background: 'var(--bg2)' }}>Cancel</button>
              <button onClick={saveSip} disabled={sipSaving} className="flex-1 py-2.5 rounded-xl text-white text-[12px] font-bold" style={{ background: 'var(--sage)' }}>{sipSaving ? 'Saving…' : 'Save SIP'}</button>
            </div>
          </Modal>
        </Overlay>
      )}

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

      <PageHeader title="Mutual funds" sub={navLoading ? 'Fetching live NAV…' : lastUpdated ? `NAV updated ${lastUpdated.toLocaleTimeString()}` : 'Live NAV ready'}
        onAdd={() => setShowAdd(true)} addLabel="Add fund"
        actions={<>
          <button onClick={fetchLiveNavs} disabled={navLoading} className="wl-btn" style={{ height: 34 }}><RefreshCw size={13} className={navLoading ? 'animate-spin' : ''} />{navLoading ? 'Updating…' : 'Refresh NAV'}</button>
          <button onClick={() => setShowImport(true)} className="wl-btn" style={{ height: 34 }}><FileUp size={13} />Import PDF</button>
          <Link href="/dashboard/learn" className="wl-btn" style={{ height: 34 }}><GraduationCap size={13} />Learn</Link>
          <button onClick={() => setShowAdd(true)} className="wl-btn wl-btn-primary" style={{ height: 34 }}><Plus size={14} />Add fund</button>
        </>} />
      {/* Phone: header actions are desktop-only */}
      <div className="md:hidden flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4">
        <button onClick={fetchLiveNavs} disabled={navLoading} className="wl-chip flex-shrink-0">{navLoading ? 'Updating…' : 'Refresh NAV'}</button>
        <button onClick={() => setShowImport(true)} className="wl-chip flex-shrink-0">Import PDF</button>
        <Link href="/dashboard/learn" className="wl-chip flex-shrink-0">Learn</Link>
      </div>
      {funds.length > 0 && <InsightBar text={`${funds.length} fund${funds.length === 1 ? '' : 's'} worth ${fmt(currentValue)}${totalRet != null ? `, ${totalRet >= 0 ? 'up' : 'down'} ${Math.abs(totalRet).toFixed(1)}% on what you put in` : ''}. ${activeSIPs ? `${activeSIPs} SIP${activeSIPs === 1 ? '' : 's'} running.` : 'No SIPs running yet.'}`} prompt={`My mutual funds: ${funds.slice(0, 15).map(f => `${f.fund_name} (${f.fund_type})`).join(', ')}. Invested ${fmt(totalInvested)}, worth ${fmt(currentValue)}, ${activeSIPs} active SIPs.`} />}
      {funds.length > 0 && <AiActions actions={['Check my fund overlap', 'Is my SIP enough for my goals?']} context={`My mutual funds: ${funds.slice(0, 15).map(f => `${f.fund_name} (${f.fund_type})`).join(', ')}. Invested ${fmt(totalInvested)}, worth ${fmt(currentValue)}, ${activeSIPs} active SIPs.`} />}

      {/* ── Headline value + chart by fund (same card on desktop and phone), tiles ── */}
      {funds.length > 0 && (() => {
        const bars = funds.map(f => {
          const n = getEffectiveNav(f)
          const v = n != null ? Number(f.units) * n : Number(f.invested_amount)
          return { label: String(f.fund_name).split(' ').slice(0, 2).join(' '), value: v, hi: true, tip: `${f.fund_name}: ${fmt(v)}` }
        }).sort((a, b) => b.value - a.value).slice(0, 8)
        return (
          <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-3.5 md:gap-4">
            <HeroStat label="Value today" value={hasAnyNav ? fmt(currentValue) : `${fmt(totalInvested)}*`}
              tone={totalRet == null ? 'neutral' : totalRet >= 0 ? 'good' : 'bad'}
              delta={totalRet == null ? 'Refresh NAV to see returns' : `${totalRet >= 0 ? '▲' : '▼'} ${Math.abs(totalRet).toFixed(2)}% on ${fmt(investedWithNav)} invested`}
              right={<span className="text-[11.5px]" style={{ color: 'var(--text3)' }}>Value by fund</span>}>
              {bars.length > 1 && <Bars data={bars} className="h-[110px] md:h-auto md:flex-1 md:min-h-[150px] mt-3" label={`Value by fund: ${bars.map(b => b.tip).join(', ')}`} />}
            </HeroStat>
            <div className="grid grid-cols-2 lg:grid-cols-1 gap-2.5 md:gap-3.5 lg:content-start">
              <KpiTile label="Invested" value={fmt(totalInvested)} delta={`${funds.length} fund${funds.length === 1 ? '' : 's'}`} tint={1} icon={IcWallet} />
              <KpiTile label="Gain / loss" value={hasAnyNav ? `${absRet >= 0 ? '+' : '−'}${fmt(Math.abs(absRet))}` : '—'} tint={2} icon={IcUp}
                tone={!hasAnyNav ? 'neutral' : absRet >= 0 ? 'good' : 'bad'} delta={totalRet != null ? `${totalRet >= 0 ? '+' : ''}${totalRet.toFixed(2)}% overall` : 'needs live NAV'} />
              <KpiTile className="max-lg:col-span-2" label="Active SIPs" value={`${activeSIPs} of ${funds.length}`} tint={3} icon={IcCal}
                delta={activeSIPs ? `${fmt(funds.filter(f => f.has_sip && f.sip_amount).reduce((a, f) => a + Number(f.sip_amount), 0))} a month` : 'No SIPs running'} />
            </div>
          </div>
        )
      })()}

      {/* ── Tabs ─────────────────────────────────────────────────────────────── */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0 max-md:sticky max-md:top-0 max-md:z-20 max-md:py-2 max-md:bg-[var(--canvas-m)]" role="tablist" aria-label="Mutual fund views">
        {([['portfolio', 'Portfolio', ListFilter], ['analytics', 'Analytics', BarChart2], ['growth', 'Growth', TrendingUp], ['projection', 'Projection', Rocket], ['news', 'News', Newspaper]] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key as Tab)} role="tab" aria-selected={tab === key} aria-pressed={tab === key}
            className="wl-chip flex-shrink-0 gap-1.5" style={{ height: 32 }}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB 1: PORTFOLIO                                                      */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'portfolio' && (
        <div className="space-y-3">
          <div className="wl-card overflow-hidden">
          <div className="px-4 md:px-5 pt-3.5 md:pt-[18px] pb-2.5 flex flex-col gap-2.5">
            <div>
              <h2 className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Your funds</h2>
              <div className="text-[11.5px] md:text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>
                {visible.length === funds.length ? `${funds.length} fund${funds.length === 1 ? '' : 's'}` : `${visible.length} of ${funds.length}`} · tap a fund for details, SIP and purchases
              </div>
            </div>
            <ListSearch value={query} onChange={setQuery} placeholder="Search fund or folio…">
              <select value={`${sortBy}-${sortDir}`} aria-label="Sort"
                onChange={e => { const [k, d] = e.target.value.split('-'); setSortBy(k as SortKey); setSortDir(d as 'asc' | 'desc') }}
                className="wl-input max-w-[44%]" style={{ background: '#fff', width: 'auto', height: 36 }}>
                <option value="return-desc">Returns ↓</option>
                <option value="return-asc">Returns ↑</option>
                <option value="value-desc">Value ↓</option>
                <option value="invested-desc">Invested ↓</option>
                <option value="nav-desc">NAV ↓</option>
                <option value="name-asc">Name A–Z</option>
              </select>
            </ListSearch>
          </div>
          {/* Desktop holdings table */}
          <div className="overflow-x-auto hidden md:block">
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ background: '#FAFAFE', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
                  {([
                    ['name',     'Fund',          '280px', 'left'  ],
                    ['nav',      'NAV',           '90px',  'right' ],
                    ['return',   'Return',        '100px', 'right' ],
                    ['invested', 'Invested',      '100px', 'right' ],
                    ['value',    'Current Value', '110px', 'right' ],
                    [null,       'Units',         '80px',  'right' ],
                    [null,       'Actions',       '110px', 'center'],
                  ] as const).map(([key, label, w, align]) => (
                    <th key={label} className="px-4 py-2 font-semibold"
                      style={{ minWidth: w, textAlign: align, color: 'var(--text4)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.05em', cursor: key ? 'pointer' : 'default' }}
                      onClick={() => key && toggleSort(key as SortKey)}>
                      <span className="flex items-center gap-1" style={{ justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start' }}>
                        {label}
                        {key && <ArrowUpDown size={9} style={{ opacity: sortBy === key ? 1 : 0.3 }} />}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((f, idx) => {
                  const effectiveNav = getEffectiveNav(f)
                  const nav          = effectiveNav ?? Number(f.avg_nav)
                  const hasRealNav   = effectiveNav !== null
                  const currVal      = hasRealNav ? Number(f.units) * effectiveNav! : Number(f.invested_amount)
                  const invested     = Number(f.invested_amount)
                  const retPct       = hasRealNav && invested > 0 ? (Number(f.units) * effectiveNav! - invested) / invested * 100 : null
                  const absRt        = hasRealNav ? Number(f.units) * effectiveNav! - invested : 0
                  const hasLive      = !!liveNavs[f.id]
                  const tc           = TYPE_COLORS[f.fund_type] ?? '#6B7280'
                  const isExpanded   = expandedId === f.id
                  const retColor     = retPct === null ? 'var(--text3)' : retPct >= 0 ? 'var(--income)' : 'var(--rose)'

                  return [
                    <tr key={f.id}
                      className="transition-colors hover:bg-[#FAFAFE]"
                      style={{ borderBottom: isExpanded ? 'none' : '1px solid var(--track)', cursor: 'pointer' }}
                      onClick={async () => {
                        const next = isExpanded ? null : f.id
                        setExpandedId(next)
                        if (next) await loadFundHistory(f)
                      }}>

                      {/* Fund name */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="w-[34px] h-[34px] rounded-[10px] flex items-center justify-center flex-shrink-0 text-[14px] font-bold" style={{ background: tc + '1A', color: tc }}>{String(f.fund_name).trim()[0]}</span>
                          <div className="min-w-0">
                            <div className="font-semibold truncate max-w-[240px]" style={{ color: 'var(--text)', fontSize: 13 }}>{f.fund_name}</div>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ background: tc + '18', color: tc }}>
                                {TYPE_LABELS[f.fund_type] ?? f.fund_type}
                              </span>
                              {(() => {
                                const map: Record<string, { label: string; bg: string; color: string }> = {
                                  cams:     { label: 'CAMS',     bg: '#DBEAFE', color: '#1E40AF' },
                                  kfintech: { label: 'KFintech', bg: '#EDE9FE', color: '#6D28D9' },
                                  manual:   { label: 'Manual',   bg: 'var(--bg2)', color: 'var(--text3)' },
                                }
                                const s = f.source && map[f.source] ? map[f.source] : null
                                return s ? <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ background: s.bg, color: s.color }}>{s.label}</span> : null
                              })()}
                              {f.has_sip && f.sip_amount && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold flex items-center gap-0.5"
                                  style={{ background: '#7C5CBF18', color: '#7C5CBF' }}>
                                  <CalendarClock size={9} /> SIP ₹{Number(f.sip_amount).toLocaleString('en-IN')}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* NAV */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center gap-1 justify-end">
                          <div className="w-1.5 h-1.5 rounded-full" style={{ background: hasLive ? '#10B981' : 'var(--text3)', flexShrink: 0 }} />
                          <span className="tabular-nums font-semibold" style={{ color: 'var(--text)' }}>
                            {navLoading && !hasLive ? '…' : `₹${nav.toFixed(2)}`}
                          </span>
                        </div>
                        <div className="text-[10px]" style={{ color: 'var(--text3)' }}>Avg ₹{Number(f.avg_nav).toFixed(2)}</div>
                      </td>

                      {/* Return */}
                      <td className="px-4 py-3 text-right">
                        <div className="font-bold tabular-nums" style={{ color: retColor, fontSize: 13 }}>
                          {retPct === null ? '— (fetch NAV)' : `${retPct >= 0 ? '+' : ''}${retPct.toFixed(2)}%`}
                        </div>
                        <div className="text-[10px] tabular-nums" style={{ color: retColor }}>
                          {retPct !== null ? `${absRt >= 0 ? '+' : ''}₹${Math.abs(Math.round(absRt)).toLocaleString('en-IN')}` : ''}
                        </div>
                      </td>

                      {/* Invested */}
                      <td className="px-4 py-3 text-right tabular-nums font-semibold" style={{ color: 'var(--text2)' }}>
                        {fmt(invested)}
                      </td>

                      {/* Current Value */}
                      <td className="px-4 py-3 text-right">
                        <div className="tabular-nums font-bold" style={{ color: retColor, fontSize: 13 }}>{fmt(currVal)}</div>
                        <div className="text-[10px] mt-0.5" style={{ color: 'var(--text3)' }}>
                          {(currentValue > 0 ? currVal / currentValue * 100 : 0).toFixed(1)}% of portfolio
                        </div>
                        <div className="h-1.5 mt-1 rounded-full overflow-hidden" style={{ background: 'var(--bg2)' }}>
                          <div className="h-full rounded-full" style={{ width: `${currentValue > 0 ? Math.min(100, currVal / currentValue * 100) : 0}%`, background: tc }} />
                        </div>
                      </td>

                      {/* Units */}
                      <td className="px-4 py-3 text-right tabular-nums text-[11px]" style={{ color: 'var(--text3)' }}>
                        {Number(f.units).toFixed(3)}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => openSipModal(f)} className="wl-btn wl-btn-sm">{f.has_sip ? 'Edit SIP' : '+ SIP'}</button>
                          <button onClick={() => setAddLotsFund(f)} className="wl-btn wl-btn-sm" style={{ color: 'var(--accent2)', borderColor: 'var(--accent-border)', background: 'var(--accent-bg)' }}>+ Buy</button>
                          <ChevronDown size={12} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} style={{ color: 'var(--text3)' }} />
                        </div>
                      </td>
                    </tr>,

                    /* Expanded detail row */
                    isExpanded && (
                      <tr key={`${f.id}-detail`} style={{ background: '#FAFAFE', borderBottom: '1px solid var(--track)' }}>
                        <td colSpan={7} className="px-6 py-4">
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                            {/* Fund details */}
                            <div className="space-y-3">
                              <div className="text-[11px] font-medium" style={{ color: 'var(--text3)' }}>Fund Details</div>
                              <div className="grid grid-cols-3 gap-3">
                                {[
                                  ['Type',         TYPE_LABELS[f.fund_type] ?? f.fund_type],
                                  ['Folio',        f.folio_number || '—'],
                                  ['WL Rating',    '★'.repeat(computeRating(retPct, f.fund_type).stars) + '☆'.repeat(5 - computeRating(retPct, f.fund_type).stars)],
                                  ['Avg NAV',      `₹${Number(f.avg_nav).toFixed(2)}`],
                                  ['Live NAV',     `₹${nav.toFixed(2)}`],
                                  ['NAV Change',   `${((nav - Number(f.avg_nav)) / Number(f.avg_nav) * 100).toFixed(1)}%`],
                                ].map(([l, v]) => (
                                  <div key={l}>
                                    <div className="text-[10px]" style={{ color: 'var(--text3)' }}>{l}</div>
                                    <div className="text-[12px] font-semibold" style={{ color: 'var(--text)' }}>{v}</div>
                                  </div>
                                ))}
                              </div>

                              {/* Benchmark comparison */}
                              {(() => {
                                const bench = BENCH[f.fund_type] ?? 10
                                const beats = retPct != null ? retPct - bench : null
                                return (
                                  <div className="rounded-xl p-3 flex items-center justify-between" style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
                                    <div>
                                      <div className="text-[11px] font-medium" style={{ color: 'var(--text3)' }}>vs Category Benchmark (~{bench}% p.a.)</div>
                                      <div className="text-[11px] mt-0.5" style={{ color: 'var(--text3)' }}>
                                        Your return: <strong style={{ color: 'var(--text2)' }}>{retPct != null ? `${retPct >= 0 ? '+' : ''}${retPct.toFixed(1)}%` : '— refresh NAV'}</strong>
                                      </div>
                                    </div>
                                    <div className="text-right">
                                      {beats == null ? <span className="text-[12px]" style={{ color: 'var(--text3)' }}>—</span> : (
                                        <>
                                          <div className="text-[15px] font-bold tabular-nums" style={{ color: beats >= 0 ? 'var(--income)' : 'var(--rose)' }}>{beats >= 0 ? '+' : ''}{beats.toFixed(1)}%</div>
                                          <div className="text-[10px] font-semibold" style={{ color: beats >= 0 ? 'var(--income)' : 'var(--rose)' }}>{beats >= 0 ? '✓ Beating benchmark' : 'Below benchmark'}</div>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                )
                              })()}
                              <div className="text-[10px]" style={{ color: 'var(--text3)' }}>
                                ★ <strong>WL Rating</strong> &amp; benchmark are <strong>WealthLens estimates</strong> (your return vs a typical category average) — not an external agency rating like Value Research or Morningstar.
                              </div>

                              {/* SIP status */}
                              <div className="rounded-xl p-3" style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
                                <div className="flex items-center justify-between">
                                  <div className="text-[11px] font-semibold flex items-center gap-1.5" style={{ color: 'var(--text)' }}>
                                    <CalendarClock size={12} style={{ color: 'var(--sage)' }} /> SIP Status
                                  </div>
                                  <button onClick={() => openSipModal(f)}
                                    className="text-[10px] px-2 py-1 rounded border"
                                    style={{ borderColor: 'var(--line)', color: 'var(--text3)' }}>
                                    <Pencil size={9} className="inline" /> Edit
                                  </button>
                                </div>
                                {f.has_sip && f.sip_amount ? (
                                  <div className="mt-2 space-y-1">
                                    <div className="text-[13px] font-bold" style={{ color: 'var(--sage)' }}>Active — ₹{Number(f.sip_amount).toLocaleString('en-IN')}/month</div>
                                    <div className="text-[11px]" style={{ color: 'var(--text3)' }}>Every month on the {f.sip_date}th</div>
                                  </div>
                                ) : (
                                  <div className="mt-2 text-[11px]" style={{ color: 'var(--text3)' }}>No SIP — click Edit to set up automatic reminders</div>
                                )}
                              </div>
                            </div>

                            {/* Investment history */}
                            <div className="space-y-2">
                              <div className="text-[11px] font-medium" style={{ color: 'var(--text3)' }}>Investment History</div>
                              {(() => {
                                const lots = txnsByFund[f.id] ?? []
                                const recorded = lots.reduce((a: number, t: any) => a + Number(t.units || 0), 0)
                                const opening = Number(f.units || 0) - recorded
                                if (lots.length === 0 && opening <= 0.001) {
                                  return <div className="text-[11px] py-3" style={{ color: 'var(--text3)' }}>No recorded purchases yet. Use "Add purchases / SIP" below to build your history.</div>
                                }
                                const lotsInvested = lots.reduce((a: number, t: any) => a + Number(t.amount || 0), 0)
                                const openingInvested = Math.max(0, Number(f.invested_amount || 0) - lotsInvested)
                                const openingNav = opening > 0.001 ? openingInvested / opening : 0
                                return (
                                  <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                                    {opening > 0.001 && (
                                      <div className="flex items-center justify-between text-[11px] rounded-lg px-3 py-1.5" style={{ background: 'var(--card)', border: '1px dashed var(--border2)' }}>
                                        <div style={{ color: 'var(--text3)' }}>Initial holding · <span className="tabular-nums">{+opening.toFixed(3)}</span> u @ ₹{openingNav.toFixed(2)}</div>
                                        <div className="tabular-nums font-semibold" style={{ color: 'var(--text)' }}>₹{Math.round(openingInvested).toLocaleString('en-IN')}</div>
                                      </div>
                                    )}
                                    {lots.map((t: any, i: number) => (
                                      <div key={t.id ?? i} className="flex items-center gap-2 text-[11px] rounded-lg px-3 py-1.5" style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
                                        <div className="flex-1" style={{ color: 'var(--text2)' }}>{t.txn_date} · <span className="tabular-nums">{Number(t.units).toFixed(3)}</span> u @ ₹{Number(t.nav).toFixed(2)}</div>
                                        <div className="tabular-nums font-semibold" style={{ color: 'var(--text)' }}>₹{Math.round(Number(t.amount)).toLocaleString('en-IN')}</div>
                                        <button onClick={() => setEditLot({ fund: f, lot: t })} className="p-1 rounded hover:bg-blue-50" style={{ color: 'var(--blue)' }} aria-label="Edit purchase"><Pencil size={11} /></button>
                                      </div>
                                    ))}
                                  </div>
                                )
                              })()}
                              <div className="grid grid-cols-3 gap-2 pt-1">
                                <button onClick={() => setAddLotsFund(f)} className="wl-btn wl-btn-primary justify-center" style={{ height: 34 }}><IndianRupee size={13} />Buy more</button>
                                <button onClick={() => setEditFund(f)} className="wl-btn justify-center" style={{ height: 34, background: '#fff' }}><Pencil size={13} />Edit</button>
                                <button onClick={() => setDeleteFund(f)} className="wl-btn justify-center" style={{ height: 34, background: '#fff', color: '#DC2626' }}><Trash2 size={13} />Delete</button>
                              </div>
                              <button onClick={() => { setRepickFund(f); setRepickQuery(f.fund_name); setRepickResults([]); searchSchemes(f.fund_name) }}
                                className="flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: 'var(--accent)' }}>
                                <RefreshCw size={12} /> Wrong NAV or returns? Re-pick the fund
                              </button>
                            </div>

                          </div>
                        </td>
                      </tr>
                    ),
                  ]
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile holdings cards */}
          <div className="md:hidden divide-y divide-[var(--track)] border-t border-[var(--line)]">
            {paged.map(f => {
              const effectiveNav = getEffectiveNav(f)
              const nav          = effectiveNav ?? Number(f.avg_nav)
              const hasRealNav   = effectiveNav !== null
              const currVal      = hasRealNav ? Number(f.units) * effectiveNav! : Number(f.invested_amount)
              const invested     = Number(f.invested_amount)
              const retPct       = hasRealNav && invested > 0 ? (Number(f.units) * effectiveNav! - invested) / invested * 100 : null
              const absRt        = hasRealNav ? Number(f.units) * effectiveNav! - invested : 0
              const hasLive      = !!liveNavs[f.id]
              const tc           = TYPE_COLORS[f.fund_type] ?? '#6B7280'
              const isExpanded   = expandedId === f.id
              const retColor     = retPct === null ? 'var(--text3)' : retPct >= 0 ? 'var(--income)' : 'var(--rose)'
              const weight       = currentValue > 0 ? currVal / currentValue * 100 : 0
              const rating       = computeRating(retPct, f.fund_type).stars
              return (
                <div key={f.id} className="py-3">
                  <div className="flex items-center gap-3 px-4 active:bg-[#FAFAFE]" role="button" aria-expanded={isExpanded}
                    onClick={async () => { const next = isExpanded ? null : f.id; setExpandedId(next); if (next) await loadFundHistory(f) }}>
                    <span className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0 text-[14px] font-bold" style={{ background: tc + '1A', color: tc }}>{String(f.fund_name).trim()[0]}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-[13.5px] truncate" style={{ color: 'var(--text)' }}>{f.fund_name}</div>
                      <div className="text-[11.5px] truncate flex items-center gap-1" style={{ color: 'var(--text3)' }}>
                        <span className="font-medium" style={{ color: tc }}>{TYPE_LABELS[f.fund_type] ?? f.fund_type}</span>
                        <span>·</span>
                        <span className="font-semibold" style={{ color: retColor }}>{retPct === null ? 'no NAV' : `${retPct >= 0 ? '+' : ''}${retPct.toFixed(1)}%`}</span>
                        {f.has_sip && f.sip_amount && <><span>·</span><span>SIP ₹{Number(f.sip_amount).toLocaleString('en-IN')}</span></>}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-[13.5px] font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{fmt(currVal)}</div>
                      <div className="text-[11px] tabular-nums" style={{ color: 'var(--text4)' }}>{weight.toFixed(1)}% · {fmt(invested)} in</div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-2.5 mx-4 mb-1 rounded-2xl p-3 flex flex-col gap-3" style={{ background: 'var(--canvas)', border: '1px solid var(--line)' }}>
                      <div className="grid grid-cols-3 gap-2">
                        {([
                          ['Units', Number(f.units).toFixed(3)],
                          ['Avg NAV', `₹${Number(f.avg_nav).toFixed(2)}`],
                          ['NAV now', `₹${nav.toFixed(2)}`],
                          ['Gain', `${absRt >= 0 ? '+' : '−'}${fmt(Math.abs(absRt))}`],
                          ['Folio', f.folio_number || '—'],
                          ['Rating', '★'.repeat(rating) + '☆'.repeat(5 - rating)],
                        ] as [string, string][]).map(([l, v]) => (
                          <div key={l} className="rounded-xl px-2.5 py-2 min-w-0" style={{ background: '#fff', border: '1px solid var(--line)' }}>
                            <div className="text-[11px]" style={{ color: 'var(--text4)' }}>{l}</div>
                            <div className="text-[12.5px] font-semibold tabular-nums truncate" style={{ color: l === 'Gain' ? (absRt >= 0 ? '#16A34A' : '#DC2626') : 'var(--text)' }}>{v}</div>
                          </div>
                        ))}
                      </div>

                      {(() => {
                        const bench = BENCH[f.fund_type] ?? 10
                        const beats = retPct != null ? retPct - bench : null
                        return (
                          <div className="flex items-center justify-between gap-2 rounded-xl px-3 py-2.5" style={{ background: '#fff', border: '1px solid var(--line)' }}>
                            <div className="min-w-0">
                              <div className="text-[12.5px] font-semibold" style={{ color: 'var(--text)' }}>vs category (~{bench}% a year)</div>
                              <div className="text-[11.5px]" style={{ color: 'var(--text3)' }}>WealthLens estimate, not an agency rating</div>
                            </div>
                            {beats == null ? <span className="text-[12px]" style={{ color: 'var(--text3)' }}>Refresh NAV</span>
                              : <span className="rounded-full px-2.5 py-1 text-[12px] font-semibold whitespace-nowrap" style={beats >= 0 ? { background: '#E7F7EF', color: '#1E8F5F' } : { background: '#FDECE8', color: '#D9482F' }}>{beats >= 0 ? '+' : ''}{beats.toFixed(1)}%</span>}
                          </div>
                        )
                      })()}

                      <button onClick={() => openSipModal(f)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left" style={{ background: '#fff', border: '1px solid var(--line)' }}>
                        <span className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}><CalendarClock size={15} /></span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-[12.5px] font-semibold" style={{ color: 'var(--text)' }}>{f.has_sip && f.sip_amount ? `SIP ₹${Number(f.sip_amount).toLocaleString('en-IN')} a month` : 'No SIP set'}</span>
                          <span className="block text-[11.5px]" style={{ color: 'var(--text3)' }}>{f.has_sip && f.sip_amount ? `on the ${f.sip_date}th · tap to change` : 'Tap to add a monthly SIP and reminders'}</span>
                        </span>
                        <Pencil size={14} style={{ color: 'var(--text4)' }} />
                      </button>

                      {(() => {
                        const lots = txnsByFund[f.id] ?? []
                        const recorded = lots.reduce((a: number, t: any) => a + Number(t.units || 0), 0)
                        const opening = Number(f.units || 0) - recorded
                        if (lots.length === 0 && opening <= 0.001) return null
                        const lotsInvested = lots.reduce((a: number, t: any) => a + Number(t.amount || 0), 0)
                        const openingInvested = Math.max(0, Number(f.invested_amount || 0) - lotsInvested)
                        const openingNav = opening > 0.001 ? openingInvested / opening : 0
                        const dt = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                        return (
                          <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid var(--line)' }}>
                            <div className="px-3 py-2 text-[12.5px] font-semibold" style={{ color: 'var(--text)', borderBottom: '1px solid var(--line)' }}>Purchases</div>
                            <div className="max-h-52 overflow-y-auto">
                              {opening > 0.001 && (
                                <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: '1px solid var(--track)' }}>
                                  <div className="flex-1 min-w-0 text-[12px]" style={{ color: 'var(--text3)' }}>Opening holding · {+opening.toFixed(3)} units at ₹{openingNav.toFixed(2)}</div>
                                  <div className="text-[12.5px] font-semibold tabular-nums" style={{ color: 'var(--text)' }}>₹{Math.round(openingInvested).toLocaleString('en-IN')}</div>
                                </div>
                              )}
                              {lots.map((t: any, i: number) => (
                                <div key={t.id ?? i} className="flex items-center gap-2 px-3 py-2" style={{ borderTop: i || opening > 0.001 ? '1px solid var(--track)' : undefined }}>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-[12.5px] font-medium" style={{ color: 'var(--text)' }}>{dt(t.txn_date)}</div>
                                    <div className="text-[11.5px] tabular-nums" style={{ color: 'var(--text3)' }}>{Number(t.units).toFixed(3)} units at ₹{Number(t.nav).toFixed(2)}</div>
                                  </div>
                                  <div className="text-[12.5px] font-semibold tabular-nums" style={{ color: 'var(--text)' }}>₹{Math.round(Number(t.amount)).toLocaleString('en-IN')}</div>
                                  <button onClick={() => setEditLot({ fund: f, lot: t })} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ color: 'var(--text3)' }} aria-label="Edit purchase"><Pencil size={13} /></button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })()}

                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => setAddLotsFund(f)} className="wl-btn wl-btn-primary justify-center" style={{ height: 40 }}><IndianRupee size={14} />Buy more</button>
                        <button onClick={() => openSipModal(f)} className="wl-btn justify-center" style={{ height: 40, background: '#fff' }}><CalendarClock size={14} />{f.has_sip ? 'Edit SIP' : 'Add SIP'}</button>
                        <button onClick={() => setEditFund(f)} className="wl-btn justify-center" style={{ height: 40, background: '#fff' }}><Pencil size={14} />Edit</button>
                        <button onClick={() => setDeleteFund(f)} className="wl-btn justify-center" style={{ height: 40, background: '#fff', color: '#DC2626' }}><Trash2 size={14} />Delete</button>
                      </div>
                      <button onClick={() => { setRepickFund(f); setRepickQuery(f.fund_name); setRepickResults([]); searchSchemes(f.fund_name) }}
                        className="flex items-center justify-center gap-1.5 text-[12.5px] font-semibold py-1" style={{ color: 'var(--accent)' }}>
                        <RefreshCw size={13} /> Wrong NAV or returns? Re-pick the fund
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <Pagination total={visible.length} page={page} pageSize={pageSize}
            onPage={setPage} onPageSize={s => { setPageSize(s); setPage(1) }} />
          </div>
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
      {tab === 'news' && (
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
      {tab === 'projection' && (() => {
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
                  <div className="text-[9px]" style={{ color: 'var(--text3)' }}>Code {s.schemeCode}</div>
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
