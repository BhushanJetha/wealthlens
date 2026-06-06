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
import ManageFamilyModal from '@/components/forms/ManageFamilyModal'
import { useHolderStore } from '@/store/holderStore'
import Link from 'next/link'

const COLORS = ['#3D7A58','#3B7DD8','#D4920A','#C96A3A','#7C5CBF','#2E7D52','#B45309','#0891B2','#6D28D9']
const TYPE_COLORS: Record<string, string> = {
  mf: '#3D7A58', stocks: '#3B7DD8', etf: '#7C5CBF', fd: '#C96A3A',
  rd: '#D4920A', gold: '#B45309', bonds: '#0891B2', nps: '#059669', lic: '#6D28D9',
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
  goldInvestments = [], bondInvestments = [], etfInvestments = [], transactions = [],
  goalInvestments = [], goals = [], familyMembers = [],
}: any) {
  const { view, fxRate: FX } = useViewStore()
  const { selectedHolder, setSelectedHolder } = useHolderStore()
  const [showAdd, setShowAdd] = useState(false)
  const [showManageFamily, setShowManageFamily] = useState(false)
  const [tab, setTab] = useState<TabKey>('overview')
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

  const stCurr  = fSt.reduce((a: number, s: any) => a + conv(s.quantity * (s.current_price ?? s.avg_buy_price), s.currency), 0)
  const stInv   = fSt.reduce((a: number, s: any) => a + conv(s.quantity * s.avg_buy_price, s.currency), 0)
  const mfCurr  = fMF.reduce((a: number, m: any) => a + m.units * (m.current_nav ?? m.avg_nav), 0)
  const mfInv   = fMF.reduce((a: number, m: any) => a + Number(m.invested_amount), 0)
  const fdVal   = fFD.reduce((a: number, f: any) => a + conv(Number(f.principal), f.currency), 0)
  const rdVal   = fRD.reduce((a: number, r: any) => a + conv(Number(r.monthly_amount) * r.tenure_months, r.currency), 0)
  const npsVal  = fNPS.reduce((a: number, n: any) => a + Number(n.corpus_amount), 0)
  const npsInv  = fNPS.reduce((a: number, n: any) => a + Number(n.invested_amount), 0)
  const licPaid = fLIC.reduce((a: number, l: any) => a + Number(l.total_paid ?? 0), 0)
  const goldVal = fGold.reduce((a: number, g: any) => {
    if (g.current_price_per_gram && g.quantity_grams)
      return a + Number(g.current_price_per_gram) * Number(g.quantity_grams)
    return a + Number(g.invested_amount || 0)
  }, 0)
  const goldInv = fGold.reduce((a: number, g: any) => a + Number(g.invested_amount || 0), 0)
  const bondVal = fBond.reduce((a: number, b: any) => a + Number(b.current_value || b.invested_amount || 0), 0)
  const bondInv = fBond.reduce((a: number, b: any) => a + Number(b.invested_amount || 0), 0)
  const etfCurr = fEtf.reduce((a: number, e: any) => a + Number(e.units || 0) * Number(e.current_price || e.avg_buy_price || 0), 0)
  const etfInv  = fEtf.reduce((a: number, e: any) => a + Number(e.invested_amount || 0), 0)
  const rdMonthly  = fRD.reduce((a: number, r: any) => a + conv(Number(r.monthly_amount), r.currency), 0)
  const licMonthly = fLIC.reduce((a: number, l: any) => a + conv(Number(l.annual_premium) / 12, l.currency ?? 'INR'), 0)

  const totalCurr = stCurr + mfCurr + fdVal + rdVal + npsVal + goldVal + bondVal + etfCurr + licPaid
  const totalInv  = stInv  + mfInv  + fdVal + rdVal + npsInv + goldInv + bondInv + etfInv
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
    { name: 'LIC',          value: Math.round(licPaid), key: 'lic'    },
  ].filter(d => d.value > 0)

  // ── Monthly trend ──────────────────────────────────────────────────────────
  type MonthSlot = { mf: number; stocks: number; etf: number; fd: number; rd: number; gold: number; bonds: number; nps: number; lic: number; total: number }
  const monthlyData = useMemo(() => {
    const months = last12Months()
    const map: Record<string, MonthSlot> = {}
    months.forEach(m => {
      map[m] = { mf: 0, stocks: 0, etf: 0, fd: 0, rd: 0, gold: 0, bonds: 0, nps: 0, lic: 0, total: 0 }
    })

    const place = (date: string | undefined | null, amt: number, key: keyof MonthSlot) => {
      if (!date || amt <= 0) return
      const m = date.slice(0, 7)
      if (!map[m]) return
      map[m][key] += amt
      map[m].total += amt
    }

    fSt.forEach((s: any) => place(s.created_at, conv(s.quantity * s.avg_buy_price, s.currency), 'stocks'))
    fMF.forEach((m: any) => place(m.created_at, conv(Number(m.invested_amount), m.currency ?? 'INR'), 'mf'))
    fFD.forEach((f: any) => place(f.start_date ?? f.created_at, conv(Number(f.principal), f.currency), 'fd'))
    fGold.forEach((g: any) => place(g.purchase_date ?? g.created_at, conv(Number(g.invested_amount || 0), g.currency ?? 'INR'), 'gold'))
    fBond.forEach((b: any) => place(b.purchase_date ?? b.created_at, conv(Number(b.invested_amount || 0), b.currency ?? 'INR'), 'bonds'))
    fEtf.forEach((e: any) => place(e.purchase_date ?? e.created_at, conv(Number(e.invested_amount || 0), e.currency ?? 'INR'), 'etf'))
    fNPS.forEach((n: any) => place(n.start_date ?? n.created_at, conv(Number(n.invested_amount || 0), n.currency ?? 'INR'), 'nps'))

    fRD.forEach((r: any) => {
      const start   = (r.start_date ?? r.created_at)?.slice(0, 7)
      const end     = r.maturity_date?.slice(0, 7) ?? new Date().toISOString().slice(0, 7)
      const monthly = conv(Number(r.monthly_amount), r.currency)
      months.forEach(m => {
        if (start && m >= start && m <= end) { map[m].rd += monthly; map[m].total += monthly }
      })
    })

    fLIC.forEach((l: any) => {
      const start   = l.start_date?.slice(0, 7)
      const end     = l.maturity_date?.slice(0, 7) ?? new Date().toISOString().slice(0, 7)
      const monthly = conv(Number(l.annual_premium) / 12, l.currency ?? 'INR')
      months.forEach(m => {
        if (start && m >= start && m <= end) { map[m].lic += monthly; map[m].total += monthly }
      })
    })

    return months.map(m => ({
      month: m,
      label: new Date(m + '-01').toLocaleDateString('en', { month: 'short', year: '2-digit' }),
      ...map[m],
    }))
  }, [fSt, fMF, fFD, fRD, fNPS, fLIC, fGold, fBond, fEtf, view])

  // ── Yearly trend ───────────────────────────────────────────────────────────
  const yearlyData = useMemo(() => {
    const years = last5Years()
    const map: Record<string, number> = {}
    years.forEach(y => { map[y] = 0 })

    const placeY = (date: string | undefined | null, amt: number) => {
      if (!date || amt <= 0) return
      const y = date.slice(0, 4)
      if (map[y] !== undefined) map[y] += amt
    }

    fSt.forEach((s: any) => placeY(s.created_at, conv(s.quantity * s.avg_buy_price, s.currency)))
    fMF.forEach((m: any) => placeY(m.created_at, conv(Number(m.invested_amount), m.currency ?? 'INR')))
    fFD.forEach((f: any) => placeY(f.start_date ?? f.created_at, conv(Number(f.principal), f.currency)))
    fGold.forEach((g: any) => placeY(g.purchase_date ?? g.created_at, conv(Number(g.invested_amount || 0), g.currency ?? 'INR')))
    fBond.forEach((b: any) => placeY(b.purchase_date ?? b.created_at, conv(Number(b.invested_amount || 0), b.currency ?? 'INR')))
    fEtf.forEach((e: any) => placeY(e.purchase_date ?? e.created_at, conv(Number(e.invested_amount || 0), e.currency ?? 'INR')))
    fNPS.forEach((n: any) => placeY(n.start_date ?? n.created_at, conv(Number(n.invested_amount || 0), n.currency ?? 'INR')))

    fRD.forEach((r: any) => {
      years.forEach(yr => {
        const start = (r.start_date ?? r.created_at)?.slice(0, 7)
        const end   = r.maturity_date?.slice(0, 7) ?? new Date().toISOString().slice(0, 7)
        if (!start) return
        let count = 0
        for (let mo = 1; mo <= 12; mo++) {
          const m = `${yr}-${String(mo).padStart(2, '0')}`
          if (m >= start && m <= end) count++
        }
        map[yr] += count * conv(Number(r.monthly_amount), r.currency)
      })
    })

    fLIC.forEach((l: any) => {
      years.forEach(yr => {
        const start = l.start_date?.slice(0, 7)
        const end   = l.maturity_date?.slice(0, 7) ?? new Date().toISOString().slice(0, 7)
        if (!start) return
        let count = 0
        for (let mo = 1; mo <= 12; mo++) {
          const m = `${yr}-${String(mo).padStart(2, '0')}`
          if (m >= start && m <= end) count++
        }
        map[yr] += count * conv(Number(l.annual_premium) / 12, l.currency ?? 'INR')
      })
    })

    return years.map((yr, i) => {
      const total    = map[yr]
      const prevTot  = i > 0 ? map[years[i - 1]] : 0
      const growth   = prevTot > 0 ? ((total - prevTot) / prevTot) * 100 : null
      return { year: yr, total, growth, fdBench: prevTot > 0 ? prevTot * 1.07 : null, inflBench: prevTot > 0 ? prevTot * 1.05 : null }
    })
  }, [fSt, fMF, fFD, fRD, fNPS, fLIC, fGold, fBond, fEtf, view])

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
    const monthlyInvest = rdMonthly + licMonthly

    const invPct   = avgInc > 0 ? Math.min((monthlyInvest / avgInc) * 100, 100) : 0
    const needsPct = avgInc > 0 ? Math.min((avgExp / avgInc) * 100, 100) : 0
    const wantsPct = Math.max(0, 100 - needsPct - invPct)

    return { avgInc, avgExp, monthlyInvest, invPct, needsPct, wantsPct }
  }, [transactions, view, rdMonthly, licMonthly])

  // ── Analytics ──────────────────────────────────────────────────────────────
  const analytics = useMemo(() => {
    if (totalCurr === 0) return null

    const isEquityMF = (m: any) => {
      const t = (m.fund_type ?? '').toLowerCase()
      return ['equity','elss','large_cap','mid_cap','small_cap','flexi_cap','multi_cap',
        'index','smallcap','midcap','largecap','growth'].some(k => t.includes(k))
    }
    const equityMfVal = fMF.filter(isEquityMF).reduce((a: number, m: any) => a + m.units * (m.current_nav ?? m.avg_nav), 0)
    const equityTotal = stCurr + etfCurr + equityMfVal
    const stableTotal = fdVal + rdVal + bondVal
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
      mfCatMap[cat] = (mfCatMap[cat] ?? 0) + m.units * (m.current_nav ?? m.avg_nav)
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
        const curV = m.units * (m.current_nav ?? m.avg_nav)
        const invV = Number(m.invested_amount)
        return { ...m, curV, invV, retPct: invV > 0 ? (curV - invV) / invV * 100 : 0 }
      })
      .filter((m: any) => m.retPct < 0).sort((a: any, b: any) => a.retPct - b.retPct)

    const topSt = fSt.length > 0
      ? fSt.map((s: any) => ({ ...s, val: conv(s.quantity * (s.current_price ?? s.avg_buy_price), s.currency) }))
           .sort((a: any, b: any) => b.val - a.val)[0] : null
    const topStPct = topSt && stCurr > 0 ? topSt.val / stCurr * 100 : 0
    const topMF = fMF.length > 0
      ? fMF.map((m: any) => ({ ...m, val: m.units * (m.current_nav ?? m.avg_nav) }))
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
    stCurr, mfCurr, etfCurr, fdVal, rdVal, npsVal, goldVal, bondVal, licPaid,
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
      const hGold = h(goldInvestments);  const hBond = h(bondInvestments); const hEtf = h(etfInvestments)
      const val =
        hSt.reduce((a: number, s: any)   => a + conv(s.quantity * (s.current_price ?? s.avg_buy_price), s.currency), 0) +
        hMF.reduce((a: number, m: any)   => a + m.units * (m.current_nav ?? m.avg_nav), 0) +
        hFD.reduce((a: number, f: any)   => a + conv(Number(f.principal), f.currency), 0) +
        hRD.reduce((a: number, r: any)   => a + conv(Number(r.monthly_amount) * r.tenure_months, r.currency), 0) +
        hNPS.reduce((a: number, n: any)  => a + Number(n.corpus_amount), 0) +
        hLIC.reduce((a: number, l: any)  => a + Number(l.total_paid ?? 0), 0) +
        hGold.reduce((a: number, g: any) => a + (g.current_price_per_gram && g.quantity_grams ? Number(g.current_price_per_gram) * Number(g.quantity_grams) : Number(g.invested_amount || 0)), 0) +
        hBond.reduce((a: number, b: any) => a + Number(b.current_value || b.invested_amount || 0), 0) +
        hEtf.reduce((a: number, e: any)  => a + Number(e.units || 0) * Number(e.current_price || e.avg_buy_price || 0), 0)
      const count = hSt.length + hMF.length + hFD.length + hRD.length + hNPS.length + hLIC.length + hGold.length + hBond.length + hEtf.length
      const rel = familyMembers.find((m: any) => m.name === name)?.relationship ?? 'self'
      return { name, val, count, rel }
    }).filter(m => m.val > 0 || m.count > 0)
  }, [familyMembers, stocks, mutualFunds, fixedDeposits, recurringDeposits, npsAccounts, licPolicies, goldInvestments, bondInvestments, etfInvestments, view])

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
      <div className="p-3 rounded-xl text-[11px] shadow-lg border" style={{ background: '#fff', borderColor: 'var(--border)' }}>
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

  return (
    <div className="space-y-5 animate-fade-up">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Investment Portfolio</h1>
          <p className="text-[12px] mt-0.5 flex items-center gap-2" style={{ color: 'var(--text3)' }}>
            {view === 'uae' ? 'UAE' : view === 'india' ? 'India' : 'All'} investments
            {analytics && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                style={{ background: PROF_BG[analytics.profile], color: PROF_COLOR[analytics.profile] }}>
                {PROF_LABEL[analytics.profile]} Investor
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/learn"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-semibold border"
            style={{ borderColor: 'var(--sage)', color: 'var(--sage)', background: 'var(--sage-bg)' }}>
            <GraduationCap size={14} /> Learn
          </Link>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-[12px] font-bold"
            style={{ background: 'var(--sage)' }}>
            <Plus size={14} /> Add Investment
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <MetricCard label="Total Invested"  value={fmtV(totalInv, sym)}  accent="blue" icon={<TrendingUp size={14} />} />
        <MetricCard label="Current Value"   value={fmtV(totalCurr, sym)} accent="sage" icon={<TrendingUp size={14} />} />
        <MetricCard label="Total Returns"
          value={fmtV(totalCurr - totalInv, sym)}
          delta={`${totalRet >= 0 ? '+' : ''}${totalRet.toFixed(2)}%`}
          positive={totalRet >= 0} accent="gold" />
        <MetricCard label="Today&apos;s P&amp;L"
          value={fmtV(Math.abs(dailyPnL), sym)}
          delta={dailyPnL >= 0 ? '▲ Gain' : '▼ Loss'} positive={dailyPnL >= 0}
          accent={dailyPnL >= 0 ? 'income' : 'rose'} />
        <MetricCard label="Health Score"
          value={analytics ? `${analytics.healthScore}/100` : '—'}
          delta={analytics ? (analytics.healthScore >= 70 ? 'Excellent' : analytics.healthScore >= 45 ? 'Good' : 'Needs Work') : undefined}
          positive={analytics ? analytics.healthScore >= 45 : false} accent="blue" />
      </div>

      {/* Member Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-semibold uppercase tracking-wider flex-shrink-0" style={{ color: 'var(--text3)' }}>Portfolio of:</span>
        {(['', 'Self', ...familyMembers.map((m: any) => m.name)] as string[]).map(name => (
          <button key={name || '__all'} onClick={() => setSelectedHolder(name)}
            className="px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
            style={{
              background: selectedHolder === name ? 'var(--sage)' : 'var(--bg2)',
              color: selectedHolder === name ? '#fff' : 'var(--text3)',
              border: `1px solid ${selectedHolder === name ? 'var(--sage)' : 'var(--border)'}`,
            }}>
            {name === '' ? 'All Members' : name}
          </button>
        ))}
        <button onClick={() => setShowManageFamily(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold ml-1"
          style={{ background: 'var(--bg2)', color: 'var(--text3)', border: '1px solid var(--border)' }}>
          <Users size={11} /> Manage
        </button>
        {selectedHolder && (
          <span className="text-[10px] px-2.5 py-1.5 rounded-lg font-semibold"
            style={{ background: 'var(--gold-bg)', color: 'var(--gold)', border: '1px solid var(--gold)30' }}>
            Viewing: {selectedHolder}
          </span>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--bg2)', width: 'fit-content' }}>
        {TABS.map(t => {
          const Icon = t.icon
          const active = tab === t.key
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-semibold transition-all"
              style={{
                background: active ? '#fff' : 'transparent',
                color: active ? 'var(--sage)' : 'var(--text3)',
                boxShadow: active ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              }}>
              <Icon size={13} />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* ═══════════ OVERVIEW ═══════════ */}
      {tab === 'overview' && (
        <>
          {/* Allocation + Type List */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="wl-card p-4">
              <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>Asset Allocation</div>
              {allocData.length > 0 ? (
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width={160} height={160}>
                    <PieChart>
                      <Pie data={allocData} dataKey="value" cx="50%" cy="50%" innerRadius={45} outerRadius={72} paddingAngle={2}>
                        {allocData.map((d, i) => <Cell key={i} fill={TYPE_COLORS[d.key] ?? COLORS[i]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }}
                        formatter={(v: any) => [fmtV(v, sym), '']} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-col gap-1.5 flex-1">
                    {allocData.map((d, i) => (
                      <div key={i} className="flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: TYPE_COLORS[d.key] ?? COLORS[i] }} />
                          <span style={{ color: 'var(--text2)' }}>{d.name}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-semibold" style={{ color: 'var(--text)' }}>{fmtV(d.value, sym)}</span>
                          <span className="text-[9px] px-1 py-0.5 rounded" style={{ background: 'var(--bg2)', color: 'var(--text3)' }}>
                            {totalCurr > 0 ? Math.round(d.value / totalCurr * 100) : 0}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-32 text-[12px]" style={{ color: 'var(--text3)' }}>
                  Add investments to see allocation
                </div>
              )}
            </div>

            <div className="wl-card p-4">
              <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>By Investment Type</div>
              <div className="space-y-1.5">
                {[
                  { label: 'Mutual Funds',       val: mfCurr,  count: fMF.length,   href: '/dashboard/investments/mutual-funds',       key: 'mf'     },
                  { label: 'Stocks',             val: stCurr,  count: fSt.length,   href: '/dashboard/investments/stocks',             key: 'stocks' },
                  { label: 'ETF',                val: etfCurr, count: fEtf.length,  href: '/dashboard/investments/etf',                key: 'etf'    },
                  { label: 'Fixed Deposits',     val: fdVal,   count: fFD.length,   href: '/dashboard/investments/fixed-deposits',     key: 'fd'     },
                  { label: 'Recurring Deposits', val: rdVal,   count: fRD.length,   href: '/dashboard/investments/recurring-deposits', key: 'rd'     },
                  { label: 'Gold',               val: goldVal, count: fGold.length, href: '/dashboard/investments/gold',               key: 'gold'   },
                  { label: 'Bonds',              val: bondVal, count: fBond.length, href: '/dashboard/investments/bonds',              key: 'bonds'  },
                  { label: 'NPS',                val: npsVal,  count: fNPS.length,  href: '/dashboard/investments/nps',                key: 'nps'    },
                  { label: 'LIC',                val: licPaid, count: fLIC.length,  href: '/dashboard/investments/lic',                key: 'lic'    },
                ].map(t => (
                  <Link key={t.href} href={t.href}
                    className="flex items-center justify-between p-2.5 rounded-lg transition-all group"
                    style={{ background: 'var(--bg2)' }}>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: TYPE_COLORS[t.key] }} />
                      <span className="text-[12px] font-semibold" style={{ color: 'var(--text)' }}>{t.label}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--border)', color: 'var(--text3)' }}>{t.count}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12px] font-mono font-bold" style={{ color: 'var(--text)' }}>{fmtV(t.val, sym)}</span>
                      <ChevronRight size={12} style={{ color: 'var(--text3)' }} className="group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* Sector + MF Category */}
          {analytics && (analytics.sectorData.length > 0 || analytics.mfCatData.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {analytics.sectorData.length > 0 && (
                <div className="wl-card p-4">
                  <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>
                    Stock Sector Exposure · {fSt.length} stocks
                  </div>
                  <div className="space-y-2.5">
                    {analytics.sectorData.slice(0, 8).map((s, i) => {
                      const pct = stCurr > 0 ? s.value / stCurr * 100 : 0
                      const isHigh = pct > 40
                      return (
                        <div key={i}>
                          <div className="flex justify-between text-[10px] mb-1">
                            <span style={{ color: 'var(--text2)' }}>{s.name}</span>
                            <div className="flex items-center gap-1">
                              {isHigh && <AlertTriangle size={9} style={{ color: '#F59E0B' }} />}
                              <span className="font-bold" style={{ color: isHigh ? '#F59E0B' : 'var(--text)' }}>{pct.toFixed(0)}%</span>
                              <span style={{ color: 'var(--text3)' }}>· {fmtV(s.value, sym)}</span>
                            </div>
                          </div>
                          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg2)' }}>
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: isHigh ? '#F59E0B' : COLORS[i % COLORS.length] }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {analytics.mfCatData.length > 0 && (
                <div className="wl-card p-4">
                  <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>
                    Mutual Fund Categories · {fMF.length} funds
                  </div>
                  <div className="space-y-2.5">
                    {analytics.mfCatData.map((c, i) => {
                      const pct   = mfCurr > 0 ? c.value / mfCurr * 100 : 0
                      const color = MF_CAT_COLOR[c.name] ?? COLORS[i % COLORS.length]
                      const isHigh = pct > 60
                      return (
                        <div key={i}>
                          <div className="flex justify-between text-[10px] mb-1">
                            <div className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
                              <span style={{ color: 'var(--text2)' }}>{c.name}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              {isHigh && <AlertTriangle size={9} style={{ color: '#F59E0B' }} />}
                              <span className="font-bold" style={{ color: 'var(--text)' }}>{pct.toFixed(0)}%</span>
                              <span style={{ color: 'var(--text3)' }}>· {fmtV(c.value, sym)}</span>
                            </div>
                          </div>
                          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg2)' }}>
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* By Member breakdown */}
          {!selectedHolder && memberPortfolios.length > 1 && (
            <div className="wl-card p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text3)' }}>Portfolio by Family Member</div>
                <button onClick={() => setShowManageFamily(true)}
                  className="flex items-center gap-1 text-[10px] font-semibold"
                  style={{ color: 'var(--sage)' }}>
                  <Users size={11} /> Manage Members
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {memberPortfolios.map((m, i) => {
                  const pct = totalCurr > 0 ? Math.round(m.val / totalCurr * 100) : 0
                  const color = COLORS[i % COLORS.length]
                  return (
                    <button key={m.name} onClick={() => setSelectedHolder(selectedHolder === m.name ? '' : m.name)}
                      className="p-4 rounded-xl text-left transition-all"
                      style={{
                        background: selectedHolder === m.name ? color + '18' : 'var(--bg2)',
                        border: `1.5px solid ${selectedHolder === m.name ? color : 'var(--border)'}`,
                      }}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[12px] font-bold" style={{ color: 'var(--text)' }}>{m.name}</span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{ background: color + '18', color }}>
                          {pct}%
                        </span>
                      </div>
                      <div className="text-[16px] font-black font-mono" style={{ color }}>{fmtV(m.val, sym)}</div>
                      <div className="text-[10px] mt-1" style={{ color: 'var(--text3)' }}>{m.count} investments</div>
                      <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Category Grid */}
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>Manage by Category</div>
            <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
              {INV_LINKS.map((t, i) => (
                <Link key={t.href} href={t.href}
                  className="wl-card p-3 flex flex-col items-center gap-1 text-center hover:shadow-md transition-shadow">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${COLORS[i]}18`, color: COLORS[i] }}>
                    <TrendingUp size={13} />
                  </div>
                  <div className="text-[10px] font-semibold leading-tight" style={{ color: 'var(--text)' }}>{t.label}</div>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ═══════════ TRENDS ═══════════ */}
      {tab === 'trends' && (
        <>
          {/* Monthly Investment Trend */}
          <div className="wl-card p-5">
            <div className="mb-4">
              <div className="text-[14px] font-bold" style={{ color: 'var(--text)' }}>Monthly Investment Trend</div>
              <div className="text-[11px] mt-0.5" style={{ color: 'var(--text3)' }}>Last 12 months — investment added per month, stacked by type</div>
            </div>
            {monthlyData.some(m => m.total > 0) ? (
              <>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={monthlyData} barSize={20}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9CA3AF' }} />
                    <YAxis tickFormatter={v => fmtS(v, sym)} tick={{ fontSize: 10, fill: '#9CA3AF' }} width={52} />
                    <Tooltip content={<ChartTip />} />
                    <Bar dataKey="mf"     name="Mutual Funds"      fill={TYPE_COLORS.mf}     stackId="a" />
                    <Bar dataKey="stocks" name="Stocks"            fill={TYPE_COLORS.stocks}  stackId="a" />
                    <Bar dataKey="etf"    name="ETF"               fill={TYPE_COLORS.etf}     stackId="a" />
                    <Bar dataKey="fd"     name="Fixed Dep"         fill={TYPE_COLORS.fd}      stackId="a" />
                    <Bar dataKey="rd"     name="Recurring Dep"     fill={TYPE_COLORS.rd}      stackId="a" />
                    <Bar dataKey="gold"   name="Gold"              fill={TYPE_COLORS.gold}    stackId="a" />
                    <Bar dataKey="bonds"  name="Bonds"             fill={TYPE_COLORS.bonds}   stackId="a" />
                    <Bar dataKey="nps"    name="NPS"               fill={TYPE_COLORS.nps}     stackId="a" />
                    <Bar dataKey="lic"    name="LIC"               fill={TYPE_COLORS.lic}     stackId="a" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>

                {/* Legend */}
                <div className="flex flex-wrap gap-2 mt-3">
                  {Object.entries(TYPE_COLORS).map(([key, color]) => (
                    <div key={key} className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--text3)' }}>
                      <span className="w-2 h-2 rounded-sm" style={{ background: color }} />
                      {key.toUpperCase()}
                    </div>
                  ))}
                </div>

                {/* Monthly numbers table */}
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-[10px] min-w-[600px]">
                    <thead>
                      <tr>
                        {['Month', 'MF', 'Stocks', 'ETF', 'FD', 'RD', 'Gold', 'NPS', 'LIC', 'Total'].map(h => (
                          <th key={h} className={`pb-2 font-semibold ${h === 'Month' ? 'text-left' : 'text-right'}`}
                            style={{ color: 'var(--text3)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyData.slice(-6).map((row, i) => (
                        <tr key={i} className="border-t" style={{ borderColor: 'var(--border)' }}>
                          <td className="py-1.5 font-medium" style={{ color: 'var(--text2)' }}>{row.label}</td>
                          {[row.mf, row.stocks, row.etf, row.fd, row.rd, row.gold, row.nps, row.lic].map((v, j) => (
                            <td key={j} className="py-1.5 text-right font-mono"
                              style={{ color: (v as number) > 0 ? 'var(--text)' : 'var(--text3)' }}>
                              {(v as number) > 0 ? fmtS(v as number, sym) : '—'}
                            </td>
                          ))}
                          <td className="py-1.5 text-right font-mono font-bold" style={{ color: 'var(--sage)' }}>
                            {row.total > 0 ? fmtV(row.total, sym) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-40 text-[12px]" style={{ color: 'var(--text3)' }}>
                No investment records in the last 12 months
              </div>
            )}
          </div>

          {/* Yearly Trend */}
          <div className="wl-card p-5">
            <div className="mb-4">
              <div className="text-[14px] font-bold" style={{ color: 'var(--text)' }}>Yearly Investment Trend</div>
              <div className="text-[11px] mt-0.5" style={{ color: 'var(--text3)' }}>Year-over-year total investment vs FD (7%) and Inflation (5%) benchmarks</div>
            </div>
            {yearlyData.some(y => y.total > 0) ? (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={yearlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                    <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#9CA3AF' }} />
                    <YAxis tickFormatter={v => fmtS(v, sym)} tick={{ fontSize: 10, fill: '#9CA3AF' }} width={55} />
                    <Tooltip content={<ChartTip />} />
                    <Bar dataKey="total" name="Invested" fill="var(--sage)" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>

                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr>
                        {['Year','Total Invested','YoY Growth','FD Benchmark (7%)','Inflation (5%)','Status'].map(h => (
                          <th key={h} className="text-left pb-2 pr-4 font-semibold" style={{ color: 'var(--text3)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {yearlyData.map((row, i) => {
                        const beatsFD   = row.growth !== null && row.growth > 7
                        const beatsInfl = row.growth !== null && row.growth > 5
                        return (
                          <tr key={i} className="border-t" style={{ borderColor: 'var(--border)' }}>
                            <td className="py-2 font-bold pr-4" style={{ color: 'var(--text)' }}>{row.year}</td>
                            <td className="py-2 font-mono pr-4" style={{ color: 'var(--text)' }}>{fmtV(row.total, sym)}</td>
                            <td className="py-2 pr-4">
                              {row.growth !== null
                                ? <span className="font-bold" style={{ color: row.growth > 0 ? '#10B981' : '#EF4444' }}>
                                    {row.growth > 0 ? '+' : ''}{row.growth.toFixed(1)}%
                                  </span>
                                : <span style={{ color: 'var(--text3)' }}>—</span>}
                            </td>
                            <td className="py-2 pr-4 font-mono" style={{ color: 'var(--text3)' }}>
                              {row.fdBench ? fmtS(row.fdBench, sym) : '—'}
                            </td>
                            <td className="py-2 pr-4 font-mono" style={{ color: 'var(--text3)' }}>
                              {row.inflBench ? fmtS(row.inflBench, sym) : '—'}
                            </td>
                            <td className="py-2">
                              {row.growth !== null ? (
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold" style={{
                                  background: beatsFD ? '#ECFDF5' : beatsInfl ? '#FFFBEB' : '#FEF2F2',
                                  color: beatsFD ? '#10B981' : beatsInfl ? '#F59E0B' : '#EF4444',
                                }}>
                                  {beatsFD ? '▲ Beats FD' : beatsInfl ? '▲ Beats Inflation' : '▼ Below Target'}
                                </span>
                              ) : <span className="text-[10px]" style={{ color: 'var(--text3)' }}>No prior data</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
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
                  <div className="p-3 rounded-xl mb-5" style={{ background: 'var(--sage-bg)' }}>
                    <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--sage)' }}>
                      Avg Monthly Income
                    </div>
                    <div className="text-[24px] font-black" style={{ color: 'var(--text)' }}>{fmtV(incomeData.avgInc, sym)}</div>
                  </div>

                  {[
                    { label: '🏠 Needs (Expenses)',       actual: incomeData.needsPct, target: 50, value: incomeData.avgExp,         color: '#3B7DD8', higher: false },
                    { label: '🎯 Wants (Discretionary)',  actual: incomeData.wantsPct, target: 30, value: incomeData.avgInc * incomeData.wantsPct / 100, color: '#F59E0B', higher: false },
                    { label: '📈 Savings & Investments',  actual: incomeData.invPct,   target: 20, value: incomeData.monthlyInvest,  color: '#10B981', higher: true  },
                  ].map((row, i) => {
                    const onTarget = row.higher ? row.actual >= row.target : row.actual <= row.target
                    return (
                      <div key={i} className="mb-5">
                        <div className="flex justify-between items-center text-[11px] mb-1.5">
                          <span className="font-semibold" style={{ color: 'var(--text)' }}>{row.label}</span>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono" style={{ color: 'var(--text3)' }}>{fmtV(row.value, sym)}</span>
                            <span className="font-bold px-1.5 py-0.5 rounded text-[10px]" style={{
                              background: onTarget ? '#ECFDF5' : '#FEF2F2',
                              color: onTarget ? '#10B981' : '#EF4444',
                            }}>
                              {row.actual.toFixed(0)}% <span style={{ opacity: 0.6 }}>/ {row.target}%</span>
                            </span>
                          </div>
                        </div>
                        <div className="relative h-3 rounded-full overflow-hidden" style={{ background: 'var(--bg2)' }}>
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
                    <span className="text-[18px] font-black" style={{ color: 'var(--sage)' }}>{fmtV(rdMonthly + licMonthly, sym)}</span>
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
                <div className="text-[11px] font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--text3)' }}>Investor Profile</div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: PROF_COLOR[analytics.profile] + '25' }}>
                    <Activity size={22} style={{ color: PROF_COLOR[analytics.profile] }} />
                  </div>
                  <div>
                    <div className="text-[20px] font-black" style={{ color: PROF_COLOR[analytics.profile] }}>
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
                      <div className="text-[18px] font-black" style={{ color: k.color }}>{k.pct.toFixed(0)}%</div>
                      <div className="text-[9px] font-semibold uppercase tracking-wider mt-0.5" style={{ color: '#9CA3AF' }}>{k.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="wl-card p-5">
                <div className="text-[11px] font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--text3)' }}>Investment Health Score</div>
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
                      <span className="text-[22px] font-black"
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
                <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>Returns by Investment Type</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {analytics.typeReturns.map((t, i) => (
                    <div key={i} className="p-3 rounded-xl" style={{ background: 'var(--bg2)' }}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[12px] font-semibold" style={{ color: 'var(--text)' }}>{t.name}</span>
                        <span className="text-[14px] font-black" style={{ color: t.pct >= 0 ? '#10B981' : '#EF4444' }}>
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
                  <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#EF4444' }}>
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
                        <div className="text-[10px] font-mono" style={{ color: 'var(--text3)' }}>-{fmtV(item.loss, sym)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recommendations */}
            {analytics.recs.length > 0 && (
              <div className="wl-card p-4">
                <div className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>
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
            name: s.name, value: conv(s.quantity * (s.current_price ?? s.avg_buy_price), s.currency), currency: s.currency,
          })),
          ...(filter(mutualFunds ?? [])).map((m: any) => ({
            type: 'mutual_funds', typeKey: 'Mutual Funds', id: m.id,
            name: m.fund_name ?? m.name ?? 'MF', value: m.units * (m.current_nav ?? m.avg_nav), currency: 'INR',
          })),
          ...(filter(etfInvestments)).map((e: any) => ({
            type: 'etf_investments', typeKey: 'ETF', id: e.id,
            name: e.name ?? e.etf_name ?? 'ETF', value: Number(e.units || 0) * Number(e.current_price || e.avg_buy_price || 0), currency: 'INR',
          })),
          ...(filter(fixedDeposits ?? [])).map((f: any) => ({
            type: 'fixed_deposits', typeKey: 'Fixed Deposits', id: f.id,
            name: f.name ?? `FD · ${f.bank_name}`, value: conv(Number(f.principal), f.currency), currency: f.currency,
          })),
          ...(filter(recurringDeposits ?? [])).map((r: any) => ({
            type: 'recurring_deposits', typeKey: 'Recurring Deposits', id: r.id,
            name: r.name ?? `RD · ${r.bank_name}`, value: conv(Number(r.monthly_amount) * r.tenure_months, r.currency), currency: r.currency,
          })),
          ...(filter(goldInvestments)).map((g: any) => ({
            type: 'gold_investments', typeKey: 'Gold', id: g.id,
            name: g.name ?? 'Gold', value: Number(g.current_price_per_gram || 0) * Number(g.quantity_grams || 0) || Number(g.invested_amount || 0), currency: 'INR',
          })),
          ...(filter(bondInvestments)).map((b: any) => ({
            type: 'bond_investments', typeKey: 'Bonds', id: b.id,
            name: b.name ?? b.bond_name ?? 'Bond', value: Number(b.current_value || b.invested_amount || 0), currency: 'INR',
          })),
          ...(filter(npsAccounts ?? [])).map((n: any) => ({
            type: 'nps_accounts', typeKey: 'NPS', id: n.id,
            name: n.name ?? `NPS · ${n.fund_manager}`, value: Number(n.corpus_amount || 0), currency: 'INR',
          })),
          ...(filter(licPolicies ?? [])).map((l: any) => ({
            type: 'lic_policies', typeKey: 'LIC', id: l.id,
            name: l.name ?? l.policy_name ?? 'LIC Policy', value: Number(l.total_paid || 0), currency: l.currency ?? 'INR',
          })),
        ]

        const linked   = allInvRows.filter(r => goalMap.has(`${r.type}::${r.id}`))
        const unlinked = allInvRows.filter(r => !goalMap.has(`${r.type}::${r.id}`))
        const linkedPct = allInvRows.length > 0 ? Math.round(linked.length / allInvRows.length * 100) : 0

        return (
          <div className="space-y-5">
            {/* Summary strip */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Total Investments', value: allInvRows.length, color: 'var(--sage)', bg: 'var(--sage-bg)' },
                { label: 'Linked to Goals',   value: linked.length,    color: '#3B7DD8',      bg: 'var(--blue-bg)' },
                { label: 'Unlinked',          value: unlinked.length,  color: unlinked.length > 0 ? '#EF4444' : '#10B981', bg: unlinked.length > 0 ? '#FEF2F2' : '#ECFDF5' },
              ].map((s, i) => (
                <div key={i} className="wl-card p-4 flex flex-col gap-1" style={{ borderLeft: `3px solid ${s.color}` }}>
                  <div className="text-[22px] font-black" style={{ color: s.color }}>{s.value}</div>
                  <div className="text-[11px]" style={{ color: 'var(--text3)' }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Progress bar */}
            <div className="wl-card p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] font-bold" style={{ color: 'var(--text)' }}>Goal Coverage</span>
                <span className="text-[12px] font-bold" style={{ color: linkedPct >= 80 ? '#10B981' : linkedPct >= 50 ? '#F59E0B' : '#EF4444' }}>
                  {linkedPct}% investments linked
                </span>
              </div>
              <div className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--bg2)' }}>
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

            {/* Linked investments */}
            {linked.length > 0 && (
              <div className="wl-card p-4">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--sage-bg)' }}>
                    <LinkIcon size={13} style={{ color: 'var(--sage)' }} />
                  </div>
                  <div className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>
                    Investments Linked to Goals
                    <span className="ml-2 text-[11px] font-normal" style={{ color: 'var(--text3)' }}>{linked.length} investments</span>
                  </div>
                </div>
                <div className="space-y-2">
                  {linked.map((inv, i) => {
                    const links = goalMap.get(`${inv.type}::${inv.id}`) ?? []
                    return (
                      <div key={i} className="p-3 rounded-xl" style={{ background: 'var(--bg2)' }}>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div>
                            <div className="text-[12px] font-semibold" style={{ color: 'var(--text)' }}>{inv.name}</div>
                            <div className="text-[10px]" style={{ color: 'var(--text3)' }}>{inv.typeKey} · {fmtV(inv.value, sym)}</div>
                          </div>
                          <span className="flex-shrink-0 text-[9px] font-bold px-2 py-0.5 rounded-full"
                            style={{ background: 'var(--sage-bg)', color: 'var(--sage)' }}>
                            {links.length} goal{links.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {links.map((l, j) => (
                            <Link key={j} href={`/dashboard/goals/${l.goal.id}`}
                              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold hover:opacity-80 transition-opacity"
                              style={{ background: (l.goal.color ?? '#16A34A') + '18', color: l.goal.color ?? '#16A34A' }}>
                              <span>{l.goal.icon ?? '🎯'}</span>
                              <span>{l.goal.name}</span>
                              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold"
                                style={{ background: (l.goal.color ?? '#16A34A') + '30' }}>
                                {l.alloc}%
                              </span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Unlinked investments */}
            {unlinked.length > 0 && (
              <div className="wl-card p-4" style={{ border: '1.5px solid #EF444428' }}>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: '#EF444415' }}>
                    <Unlink size={13} style={{ color: '#EF4444' }} />
                  </div>
                  <div>
                    <div className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>
                      Investments Without Goals
                      <span className="ml-2 text-[11px] font-normal" style={{ color: 'var(--text3)' }}>{unlinked.length} investments</span>
                    </div>
                    <div className="text-[10px]" style={{ color: 'var(--text3)' }}>Link these to goals to maximize purposeful investing</div>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {unlinked.map((inv, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'var(--bg2)' }}>
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-semibold truncate" style={{ color: 'var(--text)' }}>{inv.name}</div>
                        <div className="text-[10px]" style={{ color: 'var(--text3)' }}>{inv.typeKey}</div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <div className="text-[11px] font-mono font-bold" style={{ color: 'var(--text)' }}>{fmtV(inv.value, sym)}</div>
                        <Link href="/dashboard/goals" className="text-[9px] font-semibold" style={{ color: '#3B7DD8' }}>
                          + Link to goal
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--blue-bg)' }}>
                  <Flag size={14} style={{ color: '#3B7DD8', flexShrink: 0 }} />
                  <p className="text-[11px]" style={{ color: 'var(--text2)' }}>
                    Go to <Link href="/dashboard/goals" className="font-bold underline" style={{ color: '#3B7DD8' }}>Goals</Link> and
                    open any goal to link these investments. Every investment should have a purpose!
                  </p>
                </div>
              </div>
            )}

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
