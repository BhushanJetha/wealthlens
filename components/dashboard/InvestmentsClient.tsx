'use client'
import { useMemo, useState } from 'react'
import { useViewStore } from '@/store/viewStore'
import MetricCard from '@/components/dashboard/MetricCard'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import {
  TrendingUp, TrendingDown, Plus, ChevronRight,
  AlertTriangle, CheckCircle2, Zap, Target, Shield,
  Wallet, Activity, HeartPulse, LayoutGrid, BarChart2,
  Flag, Link as LinkIcon, Unlink, Users, GraduationCap,
} from 'lucide-react'
import AddInvestmentModal from '@/components/forms/AddInvestmentModal'
import InvestNeedsPanel from './InvestNeedsPanel'
import { PageHeader, KpiTile, Bars, Donut, Segmented } from '@/components/ui/kit'
import { useUiStore } from '@/store/uiStore'
import { Layers, CandlestickChart, BarChart3, Landmark, Repeat, Coins, ScrollText, PiggyBank, ShieldCheck, ArrowUpRight, Gauge, Briefcase, type LucideIcon } from 'lucide-react'
import ManageFamilyModal from '@/components/forms/ManageFamilyModal'
import { useHolderStore } from '@/store/holderStore'
import Link from 'next/link'
import { holdingValue as V, holdingCost as C } from '@/lib/netWorth'
import { investmentFlows, flowMonths, flowYears, FLOW_KEYS, type FlowKey } from '@/lib/investFlows'
import InvestFlowChart from './InvestFlowChart'

const COLORS = ['#3D7A58','#3B7DD8','#D4920A','#C96A3A','#7C5CBF','#2E7D52','#B45309','#0891B2','#6D28D9']
// One fixed colour per investment type, used by every chart and list here
const TYPE_COLORS: Record<FlowKey, string> = {
  mf: '#6A55E8', stocks: '#3B8EF0', etf: '#A855D8', fd: '#F29A2E', rd: '#EC5B8C',
  gold: '#C98A0B', bonds: '#0891B2', nps: '#2FB67C', ppf: '#1E40AF', lic: '#64748B',
}
const TYPE_NAMES: Record<FlowKey, string> = {
  mf: 'Mutual funds', stocks: 'Stocks', etf: 'ETF', fd: 'FDs', rd: 'RDs', gold: 'Gold', bonds: 'Bonds', nps: 'NPS', ppf: 'PPF / EPF', lic: 'LIC',
}

function toINR(amt: number, cur: string, fx: number) { return cur === 'AED' ? amt * fx : amt }

function fmtV(n: number, sym: string) {
  const abs = Math.abs(n)
  if (sym !== '₹') {
    if (abs >= 1_000_000) return `AED ${(n / 1_000_000).toFixed(2)}M`
    if (abs >= 1_000)     return `AED ${(n / 1_000).toFixed(1)}K`
    return `AED ${Math.round(n).toLocaleString()}`
  }
  if (abs >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)}Cr`
  if (abs >= 100_000)    return `₹${(n / 100_000).toFixed(2)}L`
  if (abs >= 1_000)      return `₹${(n / 1_000).toFixed(1)}K`
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}

function fmtS(n: number, sym: string) {
  const abs = Math.abs(n)
  if (sym !== '₹') {
    if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (abs >= 1_000)     return `${(n / 1_000).toFixed(0)}K`
    return `${Math.round(n)}`
  }
  if (abs >= 10_000_000) return `${(n / 10_000_000).toFixed(1)}Cr`
  if (abs >= 100_000)    return `${(n / 100_000).toFixed(1)}L`
  if (abs >= 1_000)      return `${(n / 1_000).toFixed(0)}K`
  return `${Math.round(n)}`
}

const INV_LINKS = [
  { href: '/dashboard/investments/mutual-funds',       label: 'Mutual Funds'       },
  { href: '/dashboard/investments/stocks',             label: 'Stocks'             },
  { href: '/dashboard/investments/etf',                label: 'ETF'                },
  { href: '/dashboard/investments/fixed-deposits',     label: 'Fixed Deposits'     },
  { href: '/dashboard/investments/recurring-deposits', label: 'Recurring Deposits' },
  { href: '/dashboard/investments/gold',               label: 'Gold'               },
  { href: '/dashboard/investments/bonds',              label: 'Bonds'              },
  { href: '/dashboard/investments/nps',                label: 'NPS'                },
  { href: '/dashboard/investments/lic',                label: 'LIC'                },
]

const TABS = [
  { key: 'overview', label: 'Overview',      icon: LayoutGrid  },
  { key: 'trends',   label: 'Trends',        icon: BarChart2   },
  { key: 'income',   label: 'Income Rule',   icon: Wallet      },
  { key: 'health',   label: 'Health Report', icon: HeartPulse  },
  { key: 'goalmap',  label: 'Goal Map',      icon: Flag        },
] as const

type TabKey = (typeof TABS)[number]['key']

function last12Months() {
  const out: string[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i)
    out.push(d.toISOString().slice(0, 7))
  }
  return out
}

function last5Years() {
  const yr = new Date().getFullYear()
  return [0, 1, 2, 3, 4].map(i => String(yr - 4 + i))
}

export default function InvestmentsClient({
  stocks, mutualFunds, fixedDeposits, recurringDeposits, npsAccounts, licPolicies,
  goldInvestments = [], bondInvestments = [], etfInvestments = [], ppfEpf = [], invTxns = [], transactions = [],
  goalInvestments = [], goals = [], familyMembers = [], pendingSips = [], today,
}: any) {
  const { view, fxRate: FX } = useViewStore()
  const { selectedHolder, setSelectedHolder } = useHolderStore()
  const [showAdd, setShowAdd] = useState(false)
  const [showManageFamily, setShowManageFamily] = useState(false)
  const [tab, setTab] = useState<TabKey>('overview')
  const { openAdvisor } = useUiStore()
  const sym = view === 'uae' ? 'AED' : '₹'

  const filter = (arr: any[]) =>
    view === 'uae'   ? arr.filter(x => x.currency === 'AED' || x.country === 'UAE')
    : view === 'india' ? arr.filter(x => x.currency === 'INR' || x.country === 'India')
    : arr

  const conv = (amt: number, cur: string) => view === 'consolidated' ? toINR(amt, cur, FX) : amt
  const filterH = (arr: any[]) => !selectedHolder ? arr : arr.filter((x: any) => (x.holder_name ?? 'Self') === selectedHolder)

  const fSt   = filterH(filter(stocks ?? []))
  const fMF   = filterH(filter(mutualFunds ?? []))
  const fFD   = filterH(filter(fixedDeposits ?? []))
  const fRD   = filterH(filter(recurringDeposits ?? []))
  const fNPS  = filterH(filter(npsAccounts ?? []))
  const fLIC  = filterH(filter(licPolicies ?? []))
  const fGold = filterH(filter(goldInvestments))
  const fBond = filterH(filter(bondInvestments))
  const fEtf  = filterH(filter(etfInvestments))
  const fPPF  = filterH(filter(ppfEpf))

  // Same value / cost rules as Net worth, so the two pages agree
  const S = (arr: any[], f: (x: any) => number) => arr.reduce((a: number, x: any) => a + conv(f(x), x.currency || 'INR'), 0)
  const stCurr  = S(fSt, V.stock),  stInv   = S(fSt, C.stock)
  const mfCurr  = S(fMF, V.mf),     mfInv   = S(fMF, C.mf)
  const etfCurr = S(fEtf, V.etf),   etfInv  = S(fEtf, C.etf)
  const npsVal  = S(fNPS, V.nps),   npsInv  = S(fNPS, C.nps)
  const goldVal = S(fGold, V.gold), goldInv = S(fGold, C.gold)
  const bondVal = S(fBond, V.bond), bondInv = S(fBond, C.bond)
  const fdVal   = S(fFD, V.fd)
  const rdVal   = S(fRD, V.rd)
  const ppfVal  = S(fPPF, V.ppf)
  const licPaid = S(fLIC, V.lic)
  const rdMonthly  = fRD.reduce((a: number, r: any) => a + conv(Number(r.monthly_amount), r.currency), 0)
  const licMonthly = fLIC.reduce((a: number, l: any) => a + conv(Number(l.annual_premium) / 12, l.currency ?? 'INR'), 0)

  // Cash-like holdings (FD, RD, PPF/EPF, LIC) count at cost: no gain, no loss
  const totalCurr = stCurr + mfCurr + etfCurr + npsVal + goldVal + bondVal + fdVal + rdVal + ppfVal + licPaid
  const totalInv  = stInv  + mfInv  + etfInv  + npsInv + goldInv + bondInv + fdVal + rdVal + ppfVal + licPaid
  const totalRet  = totalInv > 0 ? (totalCurr - totalInv) / totalInv * 100 : 0
  const dailyPnL  = fSt.reduce((a: number, s: any) => a + (s.daily_change ?? 0), 0)

  const allocData = [
    { name: 'Mutual Funds', value: Math.round(mfCurr),  key: 'mf'     },
    { name: 'Stocks',       value: Math.round(stCurr),  key: 'stocks' },
    { name: 'ETF',          value: Math.round(etfCurr), key: 'etf'    },
    { name: 'FDs',          value: Math.round(fdVal),   key: 'fd'     },
    { name: 'RDs',          value: Math.round(rdVal),   key: 'rd'     },
    { name: 'Gold',         value: Math.round(goldVal), key: 'gold'   },
    { name: 'Bonds',        value: Math.round(bondVal), key: 'bonds'  },
    { name: 'NPS',          value: Math.round(npsVal),  key: 'nps'    },
    { name: 'PPF / EPF',    value: Math.round(ppfVal),  key: 'ppf'    },
    { name: 'LIC',          value: Math.round(licPaid), key: 'lic'    },
  ].filter(d => d.value > 0)

  // ── Money put in, month by month (shared with the overview chart) ──────
  const flows = useMemo(() => investmentFlows({
    stocks: fSt, mutualFunds: fMF, etf: fEtf, fixedDeposits: fFD, recurringDeposits: fRD,
    nps: fNPS, lic: fLIC, ppfEpf: fPPF, gold: fGold, bonds: fBond, invTxns,
  }, conv), [fSt, fMF, fEtf, fFD, fRD, fNPS, fLIC, fPPF, fGold, fBond, invTxns, view, FX])

  const monthlyData = useMemo(() => flowMonths(flows, 12).map(r => ({
    ...r, month: r.key,
    label: new Date(`${r.key}-01T00:00:00`).toLocaleDateString('en', { month: 'short', year: '2-digit' }),
  })), [flows])

  const yearlyData = useMemo(() => {
    const ys = flowYears(flows, 5), thisYear = String(new Date().getFullYear())
    return ys.map((r, i) => {
      // The current year isn't over, so it isn't compared with a full year
      const partial = r.key === thisYear
      const prevTot = i > 0 && !partial ? ys[i - 1].total : 0
      const growth  = prevTot > 0 ? ((r.total - prevTot) / prevTot) * 100 : null
      return { year: r.key, total: r.total, growth, partial, fdBench: prevTot > 0 ? prevTot * 1.07 : null, inflBench: prevTot > 0 ? prevTot * 1.05 : null }
    })
  }, [flows])

  // ── Income 20-30-50 ────────────────────────────────────────────────────────
  const incomeData = useMemo(() => {
    const txns: any[] = transactions ?? []
    if (txns.length === 0) return null
    const filterT = (t: any) =>
      view === 'uae' ? t.currency === 'AED' : view === 'india' ? t.currency === 'INR' : true
    const convT = (t: any) => view === 'consolidated' ? toINR(Number(t.amount), t.currency, FX) : Number(t.amount)

    const incomeTxns  = txns.filter((t: any) => t.txn_type === 'income' && filterT(t))
    const expenseTxns = txns.filter((t: any) => t.txn_type === 'expense' && filterT(t))
    if (incomeTxns.length === 0) return null

    const totalInc = incomeTxns.reduce((a: number, t: any) => a + convT(t), 0)
    const totalExp = expenseTxns.reduce((a: number, t: any) => a + convT(t), 0)

    const months = new Set(incomeTxns.map((t: any) => (t.txn_date as string).slice(0, 7))).size
    const avgInc = totalInc / Math.max(months, 1)
    const avgExp = totalExp / Math.max(months, 1)
    // Average put in over the last 6 months, from the same figures as the chart
    const monthlyInvest = flowMonths(flows, 6).reduce((a, r) => a + r.total, 0) / 6

    const invPct   = avgInc > 0 ? Math.min((monthlyInvest / avgInc) * 100, 100) : 0
    const needsPct = avgInc > 0 ? Math.min((avgExp / avgInc) * 100, 100) : 0
    const wantsPct = Math.max(0, 100 - needsPct - invPct)

    return { avgInc, avgExp, monthlyInvest, invPct, needsPct, wantsPct }
  }, [transactions, view, flows])

  // ── Analytics ──────────────────────────────────────────────────────────────
  const analytics = useMemo(() => {
    if (totalCurr === 0) return null

    const isEquityMF = (m: any) => {
      const t = (m.fund_type ?? '').toLowerCase()
      return ['equity','elss','large_cap','mid_cap','small_cap','flexi_cap','multi_cap',
        'index','smallcap','midcap','largecap','growth'].some(k => t.includes(k))
    }
    const equityMfVal = S(fMF.filter(isEquityMF), V.mf)
    const equityTotal = stCurr + etfCurr + equityMfVal
    const stableTotal = fdVal + rdVal + bondVal + ppfVal
    const altTotal    = goldVal + npsVal + licPaid
    const equityPct   = equityTotal / totalCurr * 100
    const stablePct   = stableTotal / totalCurr * 100
    const altPct      = altTotal    / totalCurr * 100

    const profile: 'aggressive' | 'moderate' | 'conservative' =
      equityPct >= 55 ? 'aggressive' : equityPct >= 25 ? 'moderate' : 'conservative'

    const divScore  = Math.min(allocData.length * 8, 40)
    const retScore  = totalRet > 15 ? 40 : totalRet > 8 ? 28 : totalRet > 3 ? 18 : totalRet > 0 ? 10 : 0
    const topAsset  = allocData.length > 0 ? Math.max(...allocData.map(d => d.value / totalCurr * 100)) : 0
    const concScore = topAsset < 25 ? 20 : topAsset < 40 ? 12 : topAsset < 60 ? 5 : 0
    const healthScore = divScore + retScore + concScore

    const typeReturns = [
      { name: 'Stocks', curr: stCurr,  inv: stInv,   color: '#3B7DD8' },
      { name: 'MF',     curr: mfCurr,  inv: mfInv,   color: '#3D7A58' },
      { name: 'ETF',    curr: etfCurr, inv: etfInv,  color: '#7C5CBF' },
      { name: 'NPS',    curr: npsVal,  inv: npsInv,  color: '#059669' },
      { name: 'Gold',   curr: goldVal, inv: goldInv,  color: '#D97706' },
      { name: 'Bonds',  curr: bondVal, inv: bondInv,  color: '#0891B2' },
    ].filter(t => t.inv > 100 && t.curr > 0)
     .map(t => ({ ...t, pct: (t.curr - t.inv) / t.inv * 100 }))
     .sort((a, b) => b.pct - a.pct)

    const sectorMap: Record<string, number> = {}
    fSt.forEach((s: any) => {
      const sec = s.sector ?? 'Equity'
      sectorMap[sec] = (sectorMap[sec] ?? 0) + conv(s.quantity * (s.current_price ?? s.avg_buy_price), s.currency)
    })
    const sectorData = Object.entries(sectorMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)

    const mfCatMap: Record<string, number> = {}
    const MF_CAT_LABEL: Record<string, string> = {
      elss: 'ELSS (Tax Saver)', equity: 'Equity', debt: 'Debt',
      hybrid: 'Hybrid', index: 'Index', liquid: 'Liquid',
    }
    fMF.forEach((m: any) => {
      const cat = MF_CAT_LABEL[(m.fund_type ?? 'equity').toLowerCase()] ?? 'Other'
      mfCatMap[cat] = (mfCatMap[cat] ?? 0) + conv(V.mf(m), m.currency || 'INR')
    })
    const mfCatData = Object.entries(mfCatMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
    const hasElss = (mfCatMap['ELSS (Tax Saver)'] ?? 0) > 0

    const underStocks = fSt
      .map((s: any) => {
        const curV = conv(s.quantity * (s.current_price ?? s.avg_buy_price), s.currency)
        const invV = conv(s.quantity * s.avg_buy_price, s.currency)
        return { ...s, curV, invV, retPct: invV > 0 ? (curV - invV) / invV * 100 : 0 }
      })
      .filter((s: any) => s.retPct < 0).sort((a: any, b: any) => a.retPct - b.retPct)

    const underMF = fMF
      .map((m: any) => {
        const curV = conv(V.mf(m), m.currency || 'INR')
        const invV = conv(C.mf(m), m.currency || 'INR')
        return { ...m, curV, invV, retPct: invV > 0 ? (curV - invV) / invV * 100 : 0 }
      })
      .filter((m: any) => m.retPct < 0).sort((a: any, b: any) => a.retPct - b.retPct)

    const topSt = fSt.length > 0
      ? fSt.map((s: any) => ({ ...s, val: conv(s.quantity * (s.current_price ?? s.avg_buy_price), s.currency) }))
           .sort((a: any, b: any) => b.val - a.val)[0] : null
    const topStPct = topSt && stCurr > 0 ? topSt.val / stCurr * 100 : 0
    const topMF = fMF.length > 0
      ? fMF.map((m: any) => ({ ...m, val: conv(V.mf(m), m.currency || 'INR') }))
           .sort((a: any, b: any) => b.val - a.val)[0] : null
    const topMFPct = topMF && mfCurr > 0 ? topMF.val / mfCurr * 100 : 0

    const recs: any[] = []
    if (topStPct > 40 && topSt) recs.push({
      icon: AlertTriangle, color: '#EF4444', bg: '#FEF2F2',
      title: `High stock concentration: ${topSt.name}`,
      body: `${topStPct.toFixed(0)}% of your stock portfolio is in one stock. Diversify across 8–12 stocks in different sectors.`,
      tag: 'Reduce single-stock risk',
    })
    if (topMFPct > 65 && topMF && fMF.length >= 2) recs.push({
      icon: AlertTriangle, color: '#F59E0B', bg: '#FFFBEB',
      title: `MF over-concentration: ${topMF.fund_name ?? 'Top Fund'}`,
      body: `${topMFPct.toFixed(0)}% of MF portfolio in one fund. Spread across 3–4 funds with different mandates.`,
      tag: 'Better fund diversification',
    })
    if (equityPct < 25 && totalCurr > 200000) recs.push({
      icon: TrendingUp, color: '#3D7A58', bg: 'var(--sage-bg)',
      title: 'Increase equity for higher long-term growth',
      body: `Only ${equityPct.toFixed(0)}% in equity. For 5+ year horizon, equity delivers 12–15% CAGR. Start SIPs in index funds.`,
      tag: 'Higher long-term returns',
    })
    if ((fdVal + rdVal) > totalCurr * 0.5) recs.push({
      icon: Zap, color: '#F59E0B', bg: '#FFFBEB',
      title: 'Too much in fixed-rate instruments',
      body: `${(((fdVal + rdVal) / totalCurr) * 100).toFixed(0)}% in FD/RD. With 5–6% inflation, real returns may be negligible. Redirect maturing FDs into equity MFs.`,
      tag: 'Beat inflation',
    })
    if (allocData.length < 3 && totalCurr > 100000) recs.push({
      icon: Target, color: '#7C5CBF', bg: '#EDE9FE',
      title: 'Diversify across more asset classes',
      body: `You use ${allocData.length} asset type(s). A resilient portfolio covers equity + debt + gold + alternatives.`,
      tag: 'Reduce portfolio volatility',
    })
    if (!hasElss && view !== 'uae' && totalCurr > 200000) recs.push({
      icon: Shield, color: '#0891B2', bg: '#E0F2FE',
      title: 'Add ELSS funds for 80C tax savings',
      body: 'ELSS gives ₹1.5L deduction under Section 80C with equity returns. 3-year lock-in — shortest among tax-saving instruments.',
      tag: 'Save up to ₹46,800 in tax',
    })
    if (npsVal === 0 && view !== 'uae') recs.push({
      icon: Shield, color: '#6D28D9', bg: '#EDE9FE',
      title: 'Start NPS for ₹50K extra deduction',
      body: 'NPS Tier 1 gives an additional ₹50,000 deduction under 80CCD(1B) beyond the ₹1.5L 80C limit.',
      tag: '₹50K extra tax savings',
    })
    if (underStocks.length === 0 && underMF.length === 0 && totalRet > 5) recs.push({
      icon: CheckCircle2, color: '#10B981', bg: '#ECFDF5',
      title: 'All investments in profit — step up SIPs',
      body: `Portfolio up ${totalRet.toFixed(1)}%. Step up SIPs by 10% each year to maximize compounding over 10–15 years.`,
      tag: 'Maximize compounding',
    })

    return {
      profile, equityPct, stablePct, altPct,
      healthScore, divScore, retScore, concScore,
      typeReturns, sectorData, mfCatData, hasElss,
      underStocks, underMF, topStPct, topMFPct,
      recs: recs.slice(0, 5),
    }
  }, [fSt, fMF, fFD, fRD, fNPS, fLIC, fGold, fBond, fEtf,
    stCurr, mfCurr, etfCurr, fdVal, rdVal, npsVal, goldVal, bondVal, licPaid, ppfVal,
    stInv, mfInv, etfInv, npsInv, goldInv, bondInv,
    totalCurr, totalRet, allocData, view])

  // ── Per-member portfolio values ────────────────────────────────────────────
  const memberPortfolios = useMemo(() => {
    if (!familyMembers || familyMembers.length === 0) return []
    const allNames = ['Self', ...familyMembers.map((m: any) => m.name)]
    return allNames.map(name => {
      const h = (arr: any[]) => filter(arr).filter((x: any) => (x.holder_name ?? 'Self') === name)
      const hSt   = h(stocks ?? []);   const hMF  = h(mutualFunds ?? [])
      const hFD   = h(fixedDeposits ?? []); const hRD  = h(recurringDeposits ?? [])
      const hNPS  = h(npsAccounts ?? []); const hLIC = h(licPolicies ?? [])
      const hGold = h(goldInvestments);  const hBond = h(bondInvestments); const hEtf = h(etfInvestments); const hPPF = h(ppfEpf)
      const val = S(hSt, V.stock) + S(hMF, V.mf) + S(hEtf, V.etf) + S(hNPS, V.nps) + S(hGold, V.gold) + S(hBond, V.bond)
        + S(hFD, V.fd) + S(hRD, V.rd) + S(hPPF, V.ppf) + S(hLIC, V.lic)
      const count = hSt.length + hMF.length + hFD.length + hRD.length + hNPS.length + hLIC.length + hGold.length + hBond.length + hEtf.length + hPPF.length
      const rel = familyMembers.find((m: any) => m.name === name)?.relationship ?? 'self'
      return { name, val, count, rel }
    }).filter(m => m.val > 0 || m.count > 0)
  }, [familyMembers, stocks, mutualFunds, fixedDeposits, recurringDeposits, npsAccounts, licPolicies, goldInvestments, bondInvestments, etfInvestments, ppfEpf, view, FX])

  // ── Shared pieces ──────────────────────────────────────────────────────────
  const PROF_COLOR = { aggressive: '#EF4444', moderate: '#F59E0B', conservative: '#3B7DD8' } as const
  const PROF_BG    = { aggressive: '#FEF2F2', moderate: '#FFFBEB', conservative: 'var(--blue-bg)' } as const
  const PROF_LABEL = { aggressive: 'Aggressive', moderate: 'Moderate', conservative: 'Conservative' } as const
  const PROF_DESC  = {
    aggressive:   'Heavy on equity — high growth potential with higher volatility. Best for a 7+ year horizon.',
    moderate:     'Balanced equity + stable mix — decent growth with manageable risk. Good for 3–7 year goals.',
    conservative: 'Capital preservation focus — low volatility but may underperform inflation long-term.',
  }

  function ChartTip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null
    return (
      <div className="p-3 rounded-xl text-[11px] shadow-lg border" style={{ background: '#fff', borderColor: 'var(--line)' }}>
        <div className="font-bold mb-2" style={{ color: 'var(--text)' }}>{label}</div>
        {payload.filter((p: any) => p.value > 0).map((p: any, i: number) => (
          <div key={i} className="flex items-center gap-2 mb-0.5">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.fill ?? p.stroke }} />
            <span style={{ color: 'var(--text2)' }}>{p.name}:</span>
            <span className="font-semibold" style={{ color: 'var(--text)' }}>{fmtS(p.value, sym)}</span>
          </div>
        ))}
      </div>
    )
  }

  const MF_CAT_COLOR: Record<string, string> = {
    'ELSS (Tax Saver)': '#059669', Equity: '#3B7DD8', Debt: '#C96A3A',
    Hybrid: '#7C5CBF', Index: '#3D7A58', Liquid: '#0891B2',
  }

  // ── Design v2 overview data ───────────────────────────────────────────────
  // Fixed colour + icon per asset type (colour follows the type, never rank)
  const TYPES: { key: FlowKey; label: string; href: string; icon: LucideIcon; color: string; bg: string; val: number; inv: number | null; count: number }[] = [
    { key: 'mf',     label: 'Mutual funds',       href: '/dashboard/investments/mutual-funds',       icon: Layers,           val: mfCurr,  inv: mfInv,   count: fMF.length },
    { key: 'stocks', label: 'Stocks',             href: '/dashboard/investments/stocks',             icon: CandlestickChart, val: stCurr,  inv: stInv,   count: fSt.length },
    { key: 'etf',    label: 'ETF',                href: '/dashboard/investments/etf',                icon: BarChart3,        val: etfCurr, inv: etfInv,  count: fEtf.length },
    { key: 'fd',     label: 'Fixed deposits',     href: '/dashboard/investments/fixed-deposits',     icon: Landmark,         val: fdVal,   inv: null,    count: fFD.length },
    { key: 'rd',     label: 'Recurring deposits', href: '/dashboard/investments/recurring-deposits', icon: Repeat,           val: rdVal,   inv: null,    count: fRD.length },
    { key: 'gold',   label: 'Gold',               href: '/dashboard/investments/gold',               icon: Coins,            val: goldVal, inv: goldInv, count: fGold.length },
    { key: 'bonds',  label: 'Bonds',              href: '/dashboard/investments/bonds',              icon: ScrollText,       val: bondVal, inv: bondInv, count: fBond.length },
    { key: 'nps',    label: 'NPS',                href: '/dashboard/investments/nps',                icon: PiggyBank,        val: npsVal,  inv: npsInv,  count: fNPS.length },
    { key: 'ppf',    label: 'PPF / EPF',          href: '/dashboard/investments/ppf-epf',            icon: Briefcase,        val: ppfVal,  inv: null,    count: fPPF.length },
    { key: 'lic',    label: 'LIC',                href: '/dashboard/investments/lic',                icon: ShieldCheck,      val: licPaid, inv: null,    count: fLIC.length },
  ].map(t => ({ ...t, color: TYPE_COLORS[t.key as FlowKey], bg: TYPE_COLORS[t.key as FlowKey] + '1A' })) as any
  const held = TYPES.filter(t => t.val > 0).sort((a, b) => b.val - a.val)
  const retPct = (t: { val: number; inv: number | null }) => t.inv && t.inv > 0 ? (t.val - t.inv) / t.inv * 100 : null
  const scopeLabel = view === 'uae' ? 'UAE' : view === 'india' ? 'India' : 'All'

  // Next SIP date per fund (day-of-month, rolls to next month once passed)

  const topRec = analytics?.recs?.[0]
  const aiContext = `My portfolio (${scopeLabel}${selectedHolder ? `, ${selectedHolder} only` : ''}): value ${fmtV(totalCurr, sym)}, invested ${fmtV(totalInv, sym)}, returns ${totalRet.toFixed(1)}%. `
    + `Allocation: ${held.map(t => `${t.label} ${Math.round(t.val / totalCurr * 100)}%`).join(', ') || 'none'}.`
    + (analytics ? ` Profile: ${PROF_LABEL[analytics.profile]}. Equity ${analytics.equityPct.toFixed(0)}%.` : '')

  const tabSwitch = (
    <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0 max-md:sticky max-md:top-0 max-md:z-20 max-md:py-2 max-md:bg-[var(--canvas-m)]" role="tablist" aria-label="Portfolio views">
      {TABS.map(t => (
        <button key={t.key} onClick={() => setTab(t.key)} role="tab" aria-selected={tab === t.key} aria-pressed={tab === t.key}
          className="wl-chip flex-shrink-0 gap-1.5" style={{ height: 32 }}>
          {t.icon && <t.icon size={13} />}{t.label}
        </button>
      ))}
    </div>
  )

  return (
    <div className="flex flex-col gap-3.5 md:gap-[18px] animate-fade-up">

      {/* Header */}
      <div>
        <PageHeader title="Investments"
          sub={<span className="inline-flex items-center gap-2 flex-wrap">{scopeLabel} investments · mutual funds, stocks, FD, gold, NPS, bonds, LIC
            {analytics && (
              <span className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold" style={{ background: PROF_BG[analytics.profile], color: PROF_COLOR[analytics.profile] }}>
                {PROF_LABEL[analytics.profile]} investor
              </span>
            )}</span>}
          onAdd={() => setShowAdd(true)} addLabel="Add investment"
          actions={<>
            <button onClick={() => setShowAdd(true)} className="wl-btn" style={{ height: 36, borderRadius: 10, fontSize: 13 }}><Plus size={14} />Add investment</button>
            <button onClick={() => openAdvisor(`Compare investment options for me — funds, FDs and gold — given my risk level and goals. ${aiContext}`)}
              className="wl-btn wl-btn-primary" style={{ height: 36, borderRadius: 10, fontSize: 13 }}>Explore options →</button>
          </>} />
      </div>

      <div>{tabSwitch}</div>

      {/* ═══════════ OVERVIEW ═══════════ */}
      {tab === 'overview' && (totalCurr === 0 ? (
        <div className="max-md:order-3 rounded-[14px] px-6 py-12 text-center bg-white" style={{ border: '1.5px dashed var(--border2)' }}>
          <div className="text-[18px] font-bold" style={{ color: 'var(--text)' }}>No investments yet</div>
          <div className="text-[13.5px] mt-1.5 mb-[18px] mx-auto max-w-[400px]" style={{ color: 'var(--text3)' }}>
            Add a holding, or upload your CAMS / KFintech CAS on Mutual funds to bring in every fund with its history.
          </div>
          <div className="flex gap-2.5 justify-center flex-wrap">
            <button onClick={() => setShowAdd(true)} className="wl-btn wl-btn-primary" style={{ height: 40, padding: '0 18px' }}>Add investment</button>
            <Link href="/dashboard/investments/mutual-funds" className="wl-btn" style={{ height: 40, padding: '0 18px' }}>Upload a CAS</Link>
          </div>
        </div>
      ) : (
        <>
          {/* Value card + allocation */}
          <div className="max-md:contents grid grid-cols-1 lg:grid-cols-[1.7fr_1fr] gap-4">
            <section className="wl-card max-md:order-3 p-4 md:px-6 md:py-[22px] flex flex-col">
              <div className="text-[10.5px] md:text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text3)' }}>Total investment value</div>
              <div className="flex items-center md:items-baseline gap-2.5 md:gap-3 mt-1 flex-wrap">
                <div className="text-[28px] md:text-[34px] font-bold tabular-nums tracking-[-0.02em]" style={{ color: 'var(--text)' }}>{fmtV(totalCurr, sym)}</div>
                <span className="rounded-full px-2.5 py-1 text-[11.5px] md:text-[12.5px] font-semibold"
                  style={totalRet >= 0 ? { background: 'var(--pos-bg)', color: 'var(--pos-text)' } : { background: 'var(--neg-bg)', color: '#D9482F' }}>
                  {totalRet >= 0 ? '▲' : '▼'} {Math.abs(totalRet).toFixed(1)}% · {fmtV(Math.abs(totalCurr - totalInv), sym)} {totalCurr >= totalInv ? 'gain' : 'loss'}
                </span>
              </div>
              <InvestFlowChart className="mt-4 pt-4 md:flex-1 border-t border-[var(--track)]" flows={flows} colors={TYPE_COLORS} names={TYPE_NAMES}
                fmt={n => fmtV(n, sym)} fmtAxis={n => fmtS(n, sym)} />
            </section>

            <section className="wl-card max-md:order-8 px-4 md:px-[22px] py-4 md:py-5 flex flex-col gap-3">
              <h2 className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>Allocation</h2>
              <div className="flex justify-center">
                <Donut segments={held.map(t => ({ value: t.val, color: t.color }))} size={150} stroke={5.5}
                  label={`Allocation: ${held.map(t => `${t.label} ${Math.round(t.val / totalCurr * 100)}%`).join(', ')}`}>
                  <div className="text-[11px]" style={{ color: 'var(--text3)' }}>Value</div>
                  <div className="text-[18px] font-bold" style={{ color: 'var(--text)' }}>{fmtV(totalCurr, sym)}</div>
                </Donut>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-5 gap-y-2">
                {held.map(t => (
                  <div key={t.key} className="flex justify-between gap-2 text-[12.5px]">
                    <span className="truncate" style={{ color: 'var(--text2)' }}><i className="inline-block w-[9px] h-[9px] rounded-[3px] mr-[7px]" style={{ background: t.color }} />{t.label}</span>
                    <span className="tabular-nums font-semibold" style={{ color: 'var(--text)' }}>{Math.round(t.val / totalCurr * 100)}%</span>
                  </div>
                ))}
              </div>
              {analytics && (
                <div className="text-[11.5px] leading-snug pt-2 mt-0.5" style={{ color: 'var(--text3)', borderTop: '1px solid var(--track)' }}>
                  Equity {analytics.equityPct.toFixed(0)}% · stable {analytics.stablePct.toFixed(0)}% · gold & other {analytics.altPct.toFixed(0)}%
                </div>
              )}
            </section>
          </div>

          {/* KPIs */}
          <div className="max-md:order-4 grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-3.5">
            <KpiTile label="Invested" value={fmtV(totalInv, sym)} delta={`${held.reduce((a, t) => a + t.count, 0)} holdings`} tint={0} icon={Layers} />
            <KpiTile label="Value today" value={fmtV(totalCurr, sym)} delta={dailyPnL ? `${dailyPnL >= 0 ? '▲' : '▼'} ${fmtV(Math.abs(dailyPnL), sym)} today` : 'Latest prices'} tone={dailyPnL > 0 ? 'good' : dailyPnL < 0 ? 'bad' : 'neutral'} tint={1} icon={ArrowUpRight} />
            <KpiTile label="Total returns" value={fmtV(totalCurr - totalInv, sym)} delta={`${totalRet >= 0 ? '+' : ''}${totalRet.toFixed(2)}%`} tone={totalRet >= 0 ? 'good' : 'bad'} tint={2} icon={TrendingUp} />
            <KpiTile label="Health score" value={analytics ? `${analytics.healthScore}/100` : '—'} tint={3} icon={Gauge}
              delta={analytics ? (analytics.healthScore >= 70 ? 'Excellent' : analytics.healthScore >= 45 ? 'Good' : 'Needs work') : undefined}
              tone={analytics ? (analytics.healthScore >= 45 ? 'good' : 'bad') : 'neutral'} onClick={() => setTab('health')} />
          </div>

          {/* Portfolio rows + check-up / SIPs */}
          <div className="max-md:contents grid grid-cols-1 lg:grid-cols-[1.7fr_1fr] gap-4 items-start">
            <section className="max-md:order-5 md:bg-white md:border md:border-[var(--line)] md:rounded-[20px] md:shadow-card md:px-[22px] md:py-[18px]">
              <div className="flex justify-between items-baseline mb-2 md:mb-1.5">
                <h2 className="text-[16px] md:text-[15px] font-bold md:font-semibold" style={{ color: 'var(--text)' }}>Your portfolio</h2>
                <span className="text-[11.5px] md:text-[12px]" style={{ color: 'var(--text4)' }}>Tap a row to open it</span>
              </div>
              <div className="flex flex-col gap-2 md:gap-0">
                {held.map(t => {
                  const r = retPct(t), Icon = t.icon, w = t.val / totalCurr * 100
                  return (
                    <Link key={t.key} href={t.href}
                      className="flex gap-3 md:gap-3.5 items-center py-3 md:py-[13px] max-md:bg-white max-md:border max-md:border-[var(--line)] max-md:rounded-[18px] max-md:shadow-card max-md:px-3.5 md:border-t md:border-[var(--track)] transition-colors md:hover:bg-[#FAF9FE]">
                      <span className="w-10 h-10 md:w-11 md:h-11 rounded-xl md:rounded-[13px] flex items-center justify-center flex-shrink-0" style={{ background: t.bg, color: t.color }}>
                        <Icon size={19} />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[14px] font-semibold truncate" style={{ color: 'var(--text)' }}>{t.label}</span>
                        <span className="block text-[11.5px] md:text-[12px]" style={{ color: 'var(--text4)' }}>{t.count} holding{t.count === 1 ? '' : 's'}</span>
                      </span>
                      <span className="hidden md:block w-[120px] flex-shrink-0">
                        <span className="block h-1.5 rounded-full" style={{ background: 'var(--track)' }}>
                          <span className="block h-full rounded-full wl-grow" style={{ width: `${w}%`, background: t.color }} />
                        </span>
                        <span className="block text-[11px] mt-1" style={{ color: 'var(--text4)' }}>{w.toFixed(0)}% of portfolio</span>
                      </span>
                      <span className="text-right md:w-[100px] flex-shrink-0">
                        <span className="block text-[14px] font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{fmtV(t.val, sym)}</span>
                        <span className="block text-[11.5px] md:text-[12px] font-semibold" style={{ color: r == null ? 'var(--text4)' : r >= 0 ? 'var(--pos-text)' : '#D9482F' }}>
                          {r == null ? 'At cost' : `${r >= 0 ? '+' : ''}${r.toFixed(1)}%`}
                        </span>
                      </span>
                      <ChevronRight size={16} className="hidden md:block flex-shrink-0" style={{ color: '#CBD5E1' }} />
                    </Link>
                  )
                })}
              </div>
            </section>

            <div className="max-md:contents flex flex-col gap-3.5">
              <section className="max-md:order-6 rounded-[18px] md:rounded-[20px] bg-ai px-4 md:px-5 py-3.5 md:py-[18px]" style={{ border: '1px solid #E1DAFF' }}>
                <div className="text-[10.5px] md:text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--accent2)' }}>✦ AI portfolio check-up</div>
                <div className="text-[12.5px] md:text-[13px] leading-[1.55] mt-1.5 mb-2.5 md:mb-3" style={{ color: 'var(--text2)' }}>
                  {topRec ? <><b style={{ color: 'var(--text)' }}>{topRec.title}.</b> {topRec.body}</> : 'Your mix looks balanced. Run a check-up for a second opinion on allocation, costs and overlap.'}
                </div>
                <button onClick={() => openAdvisor(`Run a portfolio check-up: allocation, concentration, costs and what to change first. ${aiContext}`)}
                  className="rounded-full px-4 py-2 text-[12.5px] font-semibold text-white" style={{ background: 'var(--accent)' }}>
                  Run check-up
                </button>
              </section>

              <InvestNeedsPanel className="max-md:order-7" funds={fMF} stocks={fSt} deposits={fFD} rds={fRD} invTxns={invTxns}
                pendingSips={pendingSips} today={today} total={totalCurr} conv={conv} />
            </div>
          </div>

          {/* By family member */}
          {!selectedHolder && memberPortfolios.length > 1 && (() => {
            const COL = ['#6A55E8', '#E11D48', '#D97706', '#16A34A', '#0891B2', '#A855D8']
            const tot = memberPortfolios.reduce((a, m) => a + m.val, 0) || 1
            return (
              <section className="wl-card max-md:order-9 px-4 md:px-5 py-3.5">
                <div className="flex justify-between items-center gap-2">
                  <h2 className="text-[13px] md:text-[14px] font-semibold" style={{ color: 'var(--text)' }}>By family member</h2>
                  <span className="hidden md:inline text-[12px]" style={{ color: 'var(--text4)' }}>Pick a name to see one person’s view</span>
                </div>
                <div className="flex h-2 md:h-2.5 rounded-full overflow-hidden gap-0.5 mt-3 mb-2.5">
                  {memberPortfolios.map((m, i) => <div key={m.name} style={{ width: `${m.val / tot * 100}%`, background: COL[i % COL.length] }} />)}
                </div>
                <div className="flex gap-x-6 gap-y-1.5 flex-wrap">
                  {memberPortfolios.map((m, i) => (
                    <button key={m.name} onClick={() => setSelectedHolder(m.name)} className="flex items-center gap-1.5 text-[12px] md:text-[12.5px]">
                      <i className="w-[9px] h-[9px] rounded-full" style={{ background: COL[i % COL.length] }} />
                      <b className="font-semibold" style={{ color: 'var(--text)' }}>{m.name}</b>
                      <span style={{ color: 'var(--text4)' }}>{m.rel === 'self' ? 'You' : m.rel}</span>
                      <b style={{ color: 'var(--text)' }}>{Math.round(m.val / tot * 100)}%</b>
                    </button>
                  ))}
                </div>
              </section>
            )
          })()}
          {selectedHolder && (
            <div className="max-md:order-9 rounded-xl px-4 py-[11px] flex justify-between items-center gap-3 text-[13px]" style={{ background: '#FEF3C7', border: '1px solid #FDE68A', color: '#92400E' }}>
              <span>Showing <b>{selectedHolder}</b> only{totalCurr > 0 ? '' : ' — no holdings in this name yet'}.</span>
              <button onClick={() => setSelectedHolder('')} className="text-[12.5px] font-semibold" style={{ color: 'var(--accent2)' }}>Back to everyone</button>
            </div>
          )}

          {/* Sector + MF Category */}
          {analytics && (analytics.sectorData.length > 0 || analytics.mfCatData.length > 0) && (
            <div className="max-md:order-10 grid grid-cols-1 lg:grid-cols-2 gap-4">
              {analytics.sectorData.length > 0 && (
                <div className="wl-card px-4 md:px-5 py-4">
                  <h2 className="text-[14px] font-semibold mb-3" style={{ color: 'var(--text)' }}>Stock sectors · {fSt.length} stocks</h2>
                  <div className="space-y-2.5">
                    {analytics.sectorData.slice(0, 8).map((s, i) => {
                      const pct = stCurr > 0 ? s.value / stCurr * 100 : 0
                      const isHigh = pct > 40
                      return (
                        <div key={i}>
                          <div className="flex justify-between text-[12px] mb-1">
                            <span style={{ color: 'var(--text2)' }}>{s.name}</span>
                            <div className="flex items-center gap-1">
                              {isHigh && <AlertTriangle size={11} style={{ color: '#F29A2E' }} />}
                              <span className="font-semibold" style={{ color: isHigh ? 'var(--amber-text)' : 'var(--text)' }}>{pct.toFixed(0)}%</span>
                              <span style={{ color: 'var(--text3)' }}>· {fmtV(s.value, sym)}</span>
                            </div>
                          </div>
                          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--track)' }}>
                            <div className="h-full rounded-full wl-grow" style={{ width: `${pct}%`, background: isHigh ? '#F29A2E' : '#3B8EF0' }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {analytics.mfCatData.length > 0 && (
                <div className="wl-card px-4 md:px-5 py-4">
                  <h2 className="text-[14px] font-semibold mb-3" style={{ color: 'var(--text)' }}>Mutual fund categories · {fMF.length} funds</h2>
                  <div className="space-y-2.5">
                    {analytics.mfCatData.map((c, i) => {
                      const pct   = mfCurr > 0 ? c.value / mfCurr * 100 : 0
                      const color = MF_CAT_COLOR[c.name] ?? COLORS[i % COLORS.length]
                      const isHigh = pct > 60
                      return (
                        <div key={i}>
                          <div className="flex justify-between text-[12px] mb-1">
                            <div className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                              <span style={{ color: 'var(--text2)' }}>{c.name}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              {isHigh && <AlertTriangle size={11} style={{ color: '#F29A2E' }} />}
                              <span className="font-semibold" style={{ color: 'var(--text)' }}>{pct.toFixed(0)}%</span>
                              <span style={{ color: 'var(--text3)' }}>· {fmtV(c.value, sym)}</span>
                            </div>
                          </div>
                          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--track)' }}>
                            <div className="h-full rounded-full wl-grow" style={{ width: `${pct}%`, background: color }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Explore banner */}
          <button onClick={() => openAdvisor(`Help me decide where to invest next — compare funds, FDs and gold for my risk level and goals. ${aiContext}`)}
            className="max-md:order-11 text-left rounded-[14px] md:rounded-[20px] px-5 md:px-7 py-3.5 md:py-5 text-white flex justify-between items-center gap-4"
            style={{ background: 'linear-gradient(110deg,#2A2370,#6A55E8 55%,#2FB67C)', boxShadow: '0 10px 22px rgba(76,60,190,.3)' }}>
            <span>
              <span className="block text-[15px] md:text-[18px] font-bold">Ready to grow further?</span>
              <span className="hidden md:block text-[13px] mt-0.5" style={{ color: '#E4DEFF' }}>Compare funds, FDs and gold with your risk level and goals.</span>
            </span>
            <span className="flex-shrink-0 rounded-full px-4 md:px-5 py-2 md:py-2.5 text-[12.5px] md:text-[13.5px] font-semibold" style={{ background: '#fff', color: 'var(--accent2)' }}>
              Explore options →
            </span>
          </button>
        </>
      ))}

      {/* ═══════════ TRENDS ═══════════ */}
      {tab === 'trends' && (
        <>
          {/* Monthly Investment Trend */}
          <div className="wl-card px-4 md:px-5 py-4 md:py-[18px]">
            <div className="mb-3">
              <h3 className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Invested each month</h3>
              <div className="text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>Last 12 months, by type</div>
            </div>
            {monthlyData.some(m => m.total > 0) ? (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={monthlyData} barSize={18}>
                    <CartesianGrid stroke="var(--track)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={v => fmtS(v, sym)} tick={{ fontSize: 10, fill: '#94A3B8' }} width={48} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTip />} />
                    {FLOW_KEYS.filter(k => monthlyData.some(m => m[k] > 0)).map(k => (
                      <Bar key={k} dataKey={k} name={TYPE_NAMES[k]} fill={TYPE_COLORS[k]} stackId="a" stroke="#fff" strokeWidth={1} isAnimationActive={false} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>

                {/* Legend: only the types that appear */}
                <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2">
                  {FLOW_KEYS.filter(k => monthlyData.some(m => m[k] > 0)).map(key => (
                    <span key={key} className="flex items-center gap-1.5 text-[11.5px]" style={{ color: 'var(--text3)' }}>
                      <i className="w-2.5 h-2.5 rounded-sm" style={{ background: TYPE_COLORS[key] }} />{TYPE_NAMES[key]}
                    </span>
                  ))}
                </div>

                {/* Last 6 months as rows */}
                <div className="-mx-4 md:-mx-5 -mb-1 mt-3">
                  {monthlyData.slice(-6).reverse().map((row: any, i: number) => {
                    const parts = FLOW_KEYS.filter(k => (row[k] ?? 0) > 0)
                    return (
                      <div key={i} className="flex items-center gap-3 px-4 md:px-5 py-2.5" style={{ borderTop: i ? '1px solid var(--track)' : '1px solid var(--line)' }}>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{row.label}</div>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {parts.length === 0 ? <span className="text-[11.5px]" style={{ color: 'var(--text4)' }}>Nothing added</span>
                              : parts.map(k => (
                                <span key={k} className="rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums" style={{ background: TYPE_COLORS[k] + '1A', color: TYPE_COLORS[k] }}>{TYPE_NAMES[k]} {fmtS(row[k], sym)}</span>
                              ))}
                          </div>
                        </div>
                        <div className="text-[13.5px] font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--text)' }}>{row.total > 0 ? fmtV(row.total, sym) : '—'}</div>
                      </div>
                    )
                  })}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-40 text-[12px]" style={{ color: 'var(--text3)' }}>
                No investment records in the last 12 months
              </div>
            )}
          </div>

          {/* Yearly Trend */}
          <div className="wl-card px-4 md:px-5 py-4 md:py-[18px]">
            <div className="mb-3">
              <h3 className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Invested each year</h3>
              <div className="text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>Growth compared with an FD (7%) and inflation (5%)</div>
            </div>
            {yearlyData.some(y => y.total > 0) ? (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={yearlyData}>
                    <CartesianGrid stroke="var(--track)" vertical={false} />
                    <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={v => fmtS(v, sym)} tick={{ fontSize: 10, fill: '#94A3B8' }} width={48} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTip />} />
                    <Bar dataKey="total" name="Invested" fill="var(--sage)" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>

                <div className="-mx-4 md:-mx-5 -mb-1 mt-3">
                  {[...yearlyData].reverse().map((row: any, i: number) => {
                    const beatsFD = row.growth !== null && row.growth > 7
                    const beatsInfl = row.growth !== null && row.growth > 5
                    const tone = beatsFD ? { bg: '#E7F7EF', c: '#1E8F5F', t: 'Beats FD' } : beatsInfl ? { bg: '#FFF2E2', c: '#B96A0B', t: 'Beats inflation' } : { bg: '#FDECE8', c: '#D9482F', t: 'Below target' }
                    return (
                      <div key={i} className="flex items-center gap-3 px-4 md:px-5 py-2.5" style={{ borderTop: i ? '1px solid var(--track)' : '1px solid var(--line)' }}>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-semibold flex items-center gap-2" style={{ color: 'var(--text)' }}>
                            {row.year}
                            {row.growth !== null && <span className="text-[12px] font-semibold" style={{ color: row.growth >= 0 ? '#16A34A' : '#DC2626' }}>{row.growth > 0 ? '+' : ''}{row.growth.toFixed(1)}%</span>}
                          </div>
                          <div className="text-[11.5px] truncate" style={{ color: 'var(--text3)' }}>
                            {row.partial ? 'So far this year' : row.fdBench ? `FD would be ${fmtS(row.fdBench, sym)} · inflation ${fmtS(row.inflBench, sym)}` : 'First year on record'}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
                          <span className="text-[13.5px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{fmtV(row.total, sym)}</span>
                          {row.growth !== null && <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: tone.bg, color: tone.c }}>{tone.t}</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-40 text-[12px]" style={{ color: 'var(--text3)' }}>
                No investment history available
              </div>
            )}
          </div>
        </>
      )}

      {/* ═══════════ INCOME RULE ═══════════ */}
      {tab === 'income' && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 20-30-50 Analysis */}
            <div className="wl-card p-5">
              <div className="text-[14px] font-bold mb-1" style={{ color: 'var(--text)' }}>20-30-50 Rule Analysis</div>
              <div className="text-[11px] mb-4" style={{ color: 'var(--text3)' }}>
                Ideal split: 50% Needs · 30% Wants · 20% Savings & Investments
              </div>

              {incomeData ? (
                <>
                  <div className="px-3.5 py-3 rounded-xl mb-5" style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent-border)' }}>
                    <div className="text-[11px] font-medium" style={{ color: 'var(--sage)' }}>
                      Avg Monthly Income
                    </div>
                    <div className="text-[24px] font-bold" style={{ color: 'var(--text)' }}>{fmtV(incomeData.avgInc, sym)}</div>
                  </div>

                  {[
                    { label: 'Needs (expenses)',       actual: incomeData.needsPct, target: 50, value: incomeData.avgExp,         color: '#3B7DD8', higher: false },
                    { label: 'Wants (discretionary)',  actual: incomeData.wantsPct, target: 30, value: incomeData.avgInc * incomeData.wantsPct / 100, color: '#F59E0B', higher: false },
                    { label: 'Savings and investments',  actual: incomeData.invPct,   target: 20, value: incomeData.monthlyInvest,  color: '#10B981', higher: true  },
                  ].map((row, i) => {
                    const onTarget = row.higher ? row.actual >= row.target : row.actual <= row.target
                    return (
                      <div key={i} className="mb-5">
                        <div className="flex justify-between items-center text-[11px] mb-1.5">
                          <span className="font-semibold" style={{ color: 'var(--text)' }}>{row.label}</span>
                          <div className="flex items-center gap-1.5">
                            <span className="tabular-nums" style={{ color: 'var(--text3)' }}>{fmtV(row.value, sym)}</span>
                            <span className="font-bold px-1.5 py-0.5 rounded text-[10px]" style={{
                              background: onTarget ? '#ECFDF5' : '#FEF2F2',
                              color: onTarget ? '#10B981' : '#EF4444',
                            }}>
                              {row.actual.toFixed(0)}% <span style={{ opacity: 0.6 }}>/ {row.target}%</span>
                            </span>
                          </div>
                        </div>
                        <div className="relative h-3 rounded-full overflow-hidden" style={{ background: 'var(--track)' }}>
                          <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(row.actual, 100)}%`, background: row.color }} />
                          <div className="absolute top-0 h-full" style={{
                            left: `${row.target}%`, borderRight: '2px dashed #9CA3AF', opacity: 0.6,
                          }} />
                        </div>
                        <div className="text-[10px] mt-1" style={{ color: onTarget ? '#10B981' : '#EF4444' }}>
                          {row.higher
                            ? (row.actual >= row.target
                              ? `▲ ${(row.actual - row.target).toFixed(1)}% above target — excellent savings rate!`
                              : `▼ ${(row.target - row.actual).toFixed(1)}% below target — aim to increase`)
                            : (row.actual <= row.target
                              ? `▲ ${(row.target - row.actual).toFixed(1)}% below target — efficient`
                              : `▼ ${(row.actual - row.target).toFixed(1)}% above target — consider reducing`)}
                        </div>
                      </div>
                    )
                  })}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-52 gap-3">
                  <Wallet size={36} style={{ color: 'var(--text3)', opacity: 0.3 }} />
                  <div className="text-[12px] text-center" style={{ color: 'var(--text3)' }}>
                    Add income transactions<br />to see the 20-30-50 analysis
                  </div>
                </div>
              )}
            </div>

            {/* Monthly Commitments */}
            <div className="wl-card p-5">
              <div className="text-[14px] font-bold mb-1" style={{ color: 'var(--text)' }}>Monthly Commitments</div>
              <div className="text-[11px] mb-4" style={{ color: 'var(--text3)' }}>Ongoing monthly investment obligations</div>

              <div className="space-y-2.5">
                {fRD.map((r: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'var(--bg2)' }}>
                    <div>
                      <div className="text-[12px] font-semibold" style={{ color: 'var(--text)' }}>{r.name}</div>
                      <div className="text-[10px]" style={{ color: 'var(--text3)' }}>RD · {r.bank_name} · {r.interest_rate}% p.a.</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[14px] font-bold" style={{ color: TYPE_COLORS.rd }}>
                        {fmtV(conv(Number(r.monthly_amount), r.currency), sym)}
                      </div>
                      <div className="text-[10px]" style={{ color: 'var(--text3)' }}>/ month</div>
                    </div>
                  </div>
                ))}

                {fLIC.map((l: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'var(--bg2)' }}>
                    <div>
                      <div className="text-[12px] font-semibold" style={{ color: 'var(--text)' }}>{l.name}</div>
                      <div className="text-[10px]" style={{ color: 'var(--text3)' }}>LIC · {l.premium_frequency} premium</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[14px] font-bold" style={{ color: TYPE_COLORS.lic }}>
                        {fmtV(conv(Number(l.annual_premium) / 12, l.currency ?? 'INR'), sym)}
                      </div>
                      <div className="text-[10px]" style={{ color: 'var(--text3)' }}>/ month (avg)</div>
                    </div>
                  </div>
                ))}

                {fRD.length === 0 && fLIC.length === 0 && (
                  <div className="text-center py-8 text-[12px]" style={{ color: 'var(--text3)' }}>
                    No ongoing monthly investment commitments
                  </div>
                )}

                {(fRD.length > 0 || fLIC.length > 0) && (
                  <div className="flex items-center justify-between p-3.5 rounded-xl border" style={{
                    background: 'var(--sage-bg)', borderColor: 'var(--sage)',
                  }}>
                    <span className="text-[12px] font-bold" style={{ color: 'var(--sage)' }}>Total Monthly Commitment</span>
                    <span className="text-[18px] font-bold" style={{ color: 'var(--sage)' }}>{fmtV(rdMonthly + licMonthly, sym)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Savings Rate Callout */}
          {incomeData && (
            <div className="wl-card p-4 border" style={{
              background: incomeData.invPct >= 20 ? '#ECFDF5' : incomeData.invPct >= 10 ? '#FFFBEB' : '#FEF2F2',
              borderColor: incomeData.invPct >= 20 ? '#10B98130' : incomeData.invPct >= 10 ? '#F59E0B30' : '#EF444430',
            }}>
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{
                  background: incomeData.invPct >= 20 ? '#10B98120' : incomeData.invPct >= 10 ? '#F59E0B20' : '#EF444420',
                }}>
                  {incomeData.invPct >= 20
                    ? <CheckCircle2 size={20} style={{ color: '#10B981' }} />
                    : incomeData.invPct >= 10
                    ? <Zap size={20} style={{ color: '#F59E0B' }} />
                    : <AlertTriangle size={20} style={{ color: '#EF4444' }} />}
                </div>
                <div>
                  <div className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>
                    {incomeData.invPct >= 20
                      ? `Investing ${incomeData.invPct.toFixed(1)}% of income — above the 20% target!`
                      : `Investing ${incomeData.invPct.toFixed(1)}% of income — ${(20 - incomeData.invPct).toFixed(1)}% below the 20% goal`}
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: 'var(--text3)' }}>
                    {incomeData.invPct >= 20
                      ? 'Keep stepping up your SIPs by 10% annually to accelerate wealth building.'
                      : `Increase monthly investments by ${fmtV(incomeData.avgInc * (20 - incomeData.invPct) / 100, sym)} to reach the 20% savings rule.`}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══════════ HEALTH REPORT ═══════════ */}
      {tab === 'health' && (
        analytics ? (
          <>
            {/* Investor Profile + Health Score */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="wl-card p-5" style={{
                background: PROF_BG[analytics.profile],
                border: `1.5px solid ${PROF_COLOR[analytics.profile]}25`,
              }}>
                <div className="text-[14px] md:text-[15px] font-semibold mb-4" style={{ color: 'var(--text)' }}>Investor Profile</div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: PROF_COLOR[analytics.profile] + '25' }}>
                    <Activity size={22} style={{ color: PROF_COLOR[analytics.profile] }} />
                  </div>
                  <div>
                    <div className="text-[20px] font-bold" style={{ color: PROF_COLOR[analytics.profile] }}>
                      {PROF_LABEL[analytics.profile]} Investor
                    </div>
                    <div className="text-[11px]" style={{ color: 'var(--text3)' }}>Based on current allocation</div>
                  </div>
                </div>
                <p className="text-[12px] mb-5 leading-relaxed" style={{ color: 'var(--text2)' }}>
                  {PROF_DESC[analytics.profile]}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Equity',     pct: analytics.equityPct, color: '#EF4444' },
                    { label: 'Stable',     pct: analytics.stablePct, color: '#3B7DD8' },
                    { label: 'Alt / Other', pct: analytics.altPct,  color: '#D4920A' },
                  ].map(k => (
                    <div key={k.label} className="p-3 rounded-xl text-center" style={{ background: 'rgba(255,255,255,0.7)' }}>
                      <div className="text-[18px] font-bold" style={{ color: k.color }}>{k.pct.toFixed(0)}%</div>
                      <div className="text-[11px] font-medium mt-0.5" style={{ color: '#9CA3AF' }}>{k.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="wl-card p-5">
                <div className="text-[14px] md:text-[15px] font-semibold mb-4" style={{ color: 'var(--text)' }}>Investment Health Score</div>
                <div className="flex items-center gap-5 mb-5">
                  <div className="relative flex-shrink-0 w-[88px] h-[88px]">
                    <svg width="88" height="88" viewBox="0 0 88 88">
                      <circle cx="44" cy="44" r="36" fill="none" stroke="#E5E7EB" strokeWidth="8" />
                      <circle cx="44" cy="44" r="36" fill="none"
                        stroke={analytics.healthScore >= 70 ? '#10B981' : analytics.healthScore >= 45 ? '#F59E0B' : '#EF4444'}
                        strokeWidth="8" strokeLinecap="round"
                        strokeDasharray={`${(analytics.healthScore / 100) * 226.2} 226.2`}
                        transform="rotate(-90 44 44)" />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-[22px] font-bold"
                        style={{ color: analytics.healthScore >= 70 ? '#10B981' : analytics.healthScore >= 45 ? '#F59E0B' : '#EF4444' }}>
                        {analytics.healthScore}
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[17px] font-bold mb-1" style={{ color: 'var(--text)' }}>
                      {analytics.healthScore >= 70 ? 'Excellent Portfolio' : analytics.healthScore >= 45 ? 'Good Foundation' : 'Needs Attention'}
                    </div>
                    <div className="text-[11px] leading-relaxed" style={{ color: 'var(--text3)' }}>
                      {analytics.healthScore >= 70
                        ? 'Well-diversified with solid returns and low concentration risk.'
                        : analytics.healthScore >= 45
                        ? 'Good base — a few tweaks can push you to excellent.'
                        : 'Focus on diversification and reducing concentration.'}
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  {[
                    { label: 'Diversification', score: analytics.divScore,  max: 40, hint: `${allocData.length} asset types`, color: '#3D7A58' },
                    { label: 'Return Quality',  score: analytics.retScore,  max: 40, hint: `${totalRet >= 0 ? '+' : ''}${totalRet.toFixed(1)}% total`, color: '#3B7DD8' },
                    { label: 'Concentration',   score: analytics.concScore, max: 20, hint: analytics.topStPct > 0 ? `Top stock: ${analytics.topStPct.toFixed(0)}%` : 'Low risk', color: '#7C5CBF' },
                  ].map(c => (
                    <div key={c.label}>
                      <div className="flex justify-between text-[10px] mb-1">
                        <span style={{ color: 'var(--text3)' }}>{c.label}</span>
                        <div className="flex items-center gap-2">
                          <span style={{ color: 'var(--text3)' }}>{c.hint}</span>
                          <span className="font-bold" style={{ color: 'var(--text)' }}>{c.score}/{c.max}</span>
                        </div>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                        <div className="h-full rounded-full" style={{ width: `${(c.score / c.max) * 100}%`, background: c.color }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Returns by Type */}
            {analytics.typeReturns.length > 0 && (
              <div className="wl-card p-4">
                <div className="text-[14px] md:text-[15px] font-semibold mb-3" style={{ color: 'var(--text)' }}>Returns by Investment Type</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {analytics.typeReturns.map((t, i) => (
                    <div key={i} className="p-3 rounded-xl" style={{ background: 'var(--bg2)' }}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[12px] font-semibold" style={{ color: 'var(--text)' }}>{t.name}</span>
                        <span className="text-[14px] font-bold" style={{ color: t.pct >= 0 ? '#10B981' : '#EF4444' }}>
                          {t.pct >= 0 ? '+' : ''}{t.pct.toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden mb-2" style={{ background: 'var(--border)' }}>
                        <div className="h-full rounded-full" style={{
                          width: `${Math.min(Math.abs(t.pct), 60) / 60 * 100}%`,
                          background: t.pct >= 0 ? '#10B981' : '#EF4444',
                        }} />
                      </div>
                      <div className="flex justify-between text-[10px]" style={{ color: 'var(--text3)' }}>
                        <span>Invested: {fmtV(t.inv, sym)}</span>
                        <span>Now: {fmtV(t.curr, sym)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Underperformers */}
            {(analytics.underStocks.length > 0 || analytics.underMF.length > 0) && (
              <div className="wl-card p-4" style={{ background: '#FEF2F2', border: '1.5px solid #EF444428' }}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: '#EF444420' }}>
                    <TrendingDown size={14} style={{ color: '#EF4444' }} />
                  </div>
                  <div className="text-[14px] md:text-[15px] font-semibold" style={{ color: '#EF4444' }}>
                    Underperforming Investments
                    <span className="ml-2 font-normal normal-case text-[11px]" style={{ color: 'var(--text3)' }}>
                      — review or average down
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {[
                    ...analytics.underStocks.slice(0, 3).map((s: any) => ({
                      name: s.name, type: `Stock · ${s.exchange ?? 'NSE'}`,
                      loss: s.invV - s.curV, pct: s.retPct,
                    })),
                    ...analytics.underMF.slice(0, 3).map((m: any) => ({
                      name: m.fund_name ?? 'Mutual Fund',
                      type: `MF · ${(m.fund_type ?? '').toUpperCase()}`,
                      loss: m.invV - m.curV, pct: m.retPct,
                    })),
                  ].map((item, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-xl" style={{ background: '#fff' }}>
                      <div className="min-w-0 flex-1 mr-2">
                        <div className="text-[12px] font-semibold truncate" style={{ color: 'var(--text)' }}>{item.name}</div>
                        <div className="text-[10px]" style={{ color: 'var(--text3)' }}>{item.type}</div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-[12px] font-bold" style={{ color: '#EF4444' }}>{item.pct.toFixed(1)}%</div>
                        <div className="text-[10px] tabular-nums" style={{ color: 'var(--text3)' }}>-{fmtV(item.loss, sym)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recommendations */}
            {analytics.recs.length > 0 && (
              <div className="wl-card p-4">
                <div className="text-[14px] md:text-[15px] font-semibold mb-3" style={{ color: 'var(--text)' }}>
                  Smart Investment Recommendations
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {analytics.recs.map((r: any, i: number) => {
                    const Icon = r.icon
                    return (
                      <div key={i} className="p-4 rounded-xl border" style={{ background: r.bg, borderColor: r.color + '30' }}>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ background: r.color + '20' }}>
                            <Icon size={13} style={{ color: r.color }} />
                          </div>
                          <span className="text-[12px] font-bold leading-tight" style={{ color: 'var(--text)' }}>{r.title}</span>
                        </div>
                        <p className="text-[11px] mb-2.5 leading-relaxed" style={{ color: 'var(--text2)' }}>{r.body}</p>
                        <div className="text-[10px] font-bold px-2 py-1 rounded-lg inline-block"
                          style={{ background: r.color + '18', color: r.color }}>
                          {r.tag}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="wl-card p-10 text-center" style={{ color: 'var(--text3)' }}>
            <HeartPulse size={40} className="mx-auto mb-3 opacity-30" />
            <div className="text-[13px]">Add investments to see your health report</div>
          </div>
        )
      )}

      {/* ═══════════ GOAL MAP ═══════════ */}
      {tab === 'goalmap' && (() => {
        // Build lookup: "type::id" → array of { goal, allocation_pct }
        const goalMap = new Map<string, { goal: any; alloc: number }[]>()
        const goalsById: Record<string, any> = {}
        goals.forEach((g: any) => { goalsById[g.id] = g })

        goalInvestments.forEach((gi: any) => {
          const key = `${gi.investment_type}::${gi.investment_id}`
          const g = goalsById[gi.goal_id]
          if (!g) return
          if (!goalMap.has(key)) goalMap.set(key, [])
          goalMap.get(key)!.push({ goal: g, alloc: gi.allocation_pct ?? 100 })
        })

        type InvRow = { type: string; typeKey: string; id: string; name: string; value: number; currency: string }
        const allInvRows: InvRow[] = [
          ...(filter(stocks ?? [])).map((s: any) => ({
            type: 'stocks', typeKey: 'Stocks', id: s.id,
            name: s.name, value: conv(V.stock(s), s.currency), currency: s.currency,
          })),
          ...(filter(mutualFunds ?? [])).map((m: any) => ({
            type: 'mutual_funds', typeKey: 'Mutual Funds', id: m.id,
            name: m.fund_name ?? m.name ?? 'MF', value: conv(V.mf(m), m.currency || 'INR'), currency: m.currency || 'INR',
          })),
          ...(filter(etfInvestments)).map((e: any) => ({
            type: 'etf_investments', typeKey: 'ETF', id: e.id,
            name: e.name ?? e.etf_name ?? 'ETF', value: conv(V.etf(e), e.currency || 'INR'), currency: e.currency || 'INR',
          })),
          ...(filter(fixedDeposits ?? [])).map((f: any) => ({
            type: 'fixed_deposits', typeKey: 'Fixed Deposits', id: f.id,
            name: f.name ?? `FD · ${f.bank_name}`, value: conv(V.fd(f), f.currency), currency: f.currency,
          })),
          ...(filter(recurringDeposits ?? [])).map((r: any) => ({
            type: 'recurring_deposits', typeKey: 'Recurring Deposits', id: r.id,
            name: r.name ?? `RD · ${r.bank_name}`, value: conv(V.rd(r), r.currency), currency: r.currency,
          })),
          ...(filter(goldInvestments)).map((g: any) => ({
            type: 'gold_investments', typeKey: 'Gold', id: g.id,
            name: g.name ?? 'Gold', value: conv(V.gold(g), g.currency || 'INR'), currency: g.currency || 'INR',
          })),
          ...(filter(bondInvestments)).map((b: any) => ({
            type: 'bond_investments', typeKey: 'Bonds', id: b.id,
            name: b.name ?? b.bond_name ?? 'Bond', value: conv(V.bond(b), b.currency || 'INR'), currency: b.currency || 'INR',
          })),
          ...(filter(npsAccounts ?? [])).map((n: any) => ({
            type: 'nps_accounts', typeKey: 'NPS', id: n.id,
            name: n.name ?? `NPS · ${n.fund_manager}`, value: conv(V.nps(n), n.currency || 'INR'), currency: n.currency || 'INR',
          })),
          ...(filter(licPolicies ?? [])).map((l: any) => ({
            type: 'lic_policies', typeKey: 'LIC', id: l.id,
            name: l.name ?? l.policy_name ?? 'LIC Policy', value: conv(V.lic(l), l.currency ?? 'INR'), currency: l.currency ?? 'INR',
          })),
        ]

        const linked   = allInvRows.filter(r => goalMap.has(`${r.type}::${r.id}`))
        const unlinked = allInvRows.filter(r => !goalMap.has(`${r.type}::${r.id}`))
        const linkedPct = allInvRows.length > 0 ? Math.round(linked.length / allInvRows.length * 100) : 0

        return (
          <div className="space-y-5">
            {/* Summary strip */}
            <div className="grid grid-cols-3 gap-2.5 md:gap-3.5">
              <KpiTile label="All" value={String(allInvRows.length)} tint={0} icon={Layers} />
              <KpiTile label="Linked" value={String(linked.length)} tint={1} icon={LinkIcon} tone="good" />
              <KpiTile label="Unlinked" value={String(unlinked.length)} tint={2} icon={Unlink} tone={unlinked.length ? 'bad' : 'good'} />
            </div>

            {/* Progress bar */}
            <div className="wl-card px-4 md:px-5 py-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>Goal coverage</span>
                <span className="text-[12px] font-bold" style={{ color: linkedPct >= 80 ? '#10B981' : linkedPct >= 50 ? '#F59E0B' : '#EF4444' }}>
                  {linkedPct}% investments linked
                </span>
              </div>
              <div className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--track)' }}>
                <div className="h-full rounded-full transition-all" style={{
                  width: `${linkedPct}%`,
                  background: linkedPct >= 80 ? '#10B981' : linkedPct >= 50 ? '#F59E0B' : '#EF4444',
                }} />
              </div>
              <div className="text-[10px] mt-1.5" style={{ color: 'var(--text3)' }}>
                {linkedPct >= 80
                  ? 'Excellent! Most investments are working toward your goals.'
                  : linkedPct >= 50
                  ? 'Good start — link more investments to unlock the full power of goal-based investing.'
                  : 'Link your investments to goals to track purposeful wealth building.'}
              </div>
            </div>

            {/* Linked and unlinked investments as one list each */}
            {[
              { rows: linked, title: 'Linked to goals', sub: 'Each investment and the goals it funds', icon: LinkIcon, tint: '#E7F7EF', c: '#1E8F5F' },
              { rows: unlinked, title: 'Not linked yet', sub: 'Open a goal to link these, so every investment has a job', icon: Unlink, tint: '#FDECE8', c: '#D9482F' },
            ].filter(g => g.rows.length > 0).map(g => (
              <section key={g.title} className="wl-card overflow-hidden">
                <div className="px-4 md:px-5 pt-4 pb-3 flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0" style={{ background: g.tint, color: g.c }}><g.icon size={15} /></span>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>{g.title} <span className="font-normal text-[12px]" style={{ color: 'var(--text3)' }}>· {g.rows.length}</span></h3>
                    <div className="text-[12px]" style={{ color: 'var(--text3)' }}>{g.sub}</div>
                  </div>
                </div>
                {g.rows.map((inv, i) => {
                  const links = goalMap.get(`${inv.type}::${inv.id}`) ?? []
                  return (
                    <div key={i} className="flex items-center gap-3 px-4 md:px-5 py-2.5" style={{ borderTop: '1px solid ' + (i ? 'var(--track)' : 'var(--line)') }}>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-semibold truncate" style={{ color: 'var(--text)' }}>{inv.name}</div>
                        {links.length > 0 ? (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {links.map((l, j) => (
                              <Link key={j} href={`/dashboard/goals/${l.goal.id}`} className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                                style={{ background: 'var(--accent-bg)', color: 'var(--accent2)' }}>{l.goal.name} · {l.alloc}%</Link>
                            ))}
                          </div>
                        ) : <div className="text-[11.5px]" style={{ color: 'var(--text3)' }}>{inv.typeKey}</div>}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-[13px] font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{fmtV(inv.value, sym)}</div>
                        {links.length === 0 && <Link href="/dashboard/goals" className="text-[11.5px] font-semibold" style={{ color: 'var(--accent)' }}>Link to goal</Link>}
                      </div>
                    </div>
                  )
                })}
              </section>
            ))}

            {allInvRows.length === 0 && (
              <div className="wl-card p-10 text-center" style={{ color: 'var(--text3)' }}>
                <Flag size={40} className="mx-auto mb-3 opacity-20" />
                <div className="text-[13px]">Add investments and goals to see the Goal Map</div>
              </div>
            )}
          </div>
        )
      })()}

      {showAdd && <AddInvestmentModal onClose={() => setShowAdd(false)} />}
      {showManageFamily && <ManageFamilyModal onClose={() => setShowManageFamily(false)} />}
    </div>
  )
}
