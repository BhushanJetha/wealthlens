'use client'
import { Ring } from '@/components/ui/kit'
import { ShieldCheck, PieChart as PieChartIcon, Layers, CheckCircle2, AlertTriangle } from 'lucide-react'
import { PageHeader, InsightBar, AiActions, HeroStat, KpiTile, Bars } from '@/components/ui/kit'
import { ListSearch } from '@/components/ui/list'
import { Wallet as IcWallet, TrendingUp as IcUp, HeartPulse as IcHealth } from 'lucide-react'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList,
} from 'recharts'
import {
  RefreshCw, Plus, TrendingUp, TrendingDown, X,
  Newspaper, BarChart2, ListFilter, ArrowUpDown, IndianRupee, FileUp, Pencil, Trash2, GraduationCap, ChevronDown, Search, ChevronRight,
} from 'lucide-react'
import Link from 'next/link'
import EditHoldingModal from '@/components/forms/EditHoldingModal'
import BatchPurchaseModal from '@/components/forms/BatchPurchaseModal'
import EditLotModal from '@/components/forms/EditLotModal'
import HoldingsUploadModal from '@/components/forms/HoldingsUploadModal'
import InvestmentTimeline from '@/components/dashboard/InvestmentTimeline'
import InvestmentMatrix from '@/components/dashboard/InvestmentMatrix'
import Pagination from '@/components/dashboard/Pagination'
import { holdingHref, xirr } from '@/lib/holding'

// ─── helpers ──────────────────────────────────────────────────────────────────
function getReturn(s: any, prices: Record<string, number>): number {
  const price = prices[s.id] ?? Number(s.current_price ?? s.avg_buy_price)
  const invested = Number(s.quantity) * Number(s.avg_buy_price)
  return invested > 0 ? (Number(s.quantity) * price - invested) / invested * 100 : 0
}

function fmt(n: number) {
  const a = Math.abs(n)
  if (a >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)}Cr`
  if (a >= 100_000)    return `₹${(n / 100_000).toFixed(2)}L`
  if (a >= 1_000)      return `₹${(n / 1_000).toFixed(1)}K`
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}

const SECTOR_EMOJI: Record<string, string> = {
  IT: '💻', Technology: '💻', Banking: '🏦', Finance: '💰', Energy: '⚡',
  FMCG: '🛒', Pharma: '💊', Auto: '🚗', Realty: '🏢', Metals: '🔩',
  Telecom: '📡', Defence: '🛡', Consumer: '🛍', Healthcare: '🏥',
}
const SECTOR_COLORS = ['#6A55E8','#3B8EF0','#D97706','#16A34A','#EC5B8C','#0891B2','#7C3AED','#64748B','#DC2626']

function computeHealth(stocks: any[], prices: Record<string, number>): { score: number; label: string; color: string; insights: string[] } {
  if (!stocks.length) return { score: 0, label: 'No data', color: 'var(--text3)', insights: [] }
  let score = 50; const insights: string[] = []
  const sectors = new Set(stocks.map(s => s.sector).filter(Boolean))
  score += Math.min(30, sectors.size * 7)
  if (sectors.size < 3) insights.push('⚠ Hold stocks in more sectors for diversification')
  else insights.push(`✓ Spread across ${sectors.size} sectors`)
  const vals  = stocks.map(s => Number(s.quantity) * (prices[s.id] ?? Number(s.current_price ?? s.avg_buy_price)))
  const total = vals.reduce((a, v) => a + v, 0)
  const maxI  = vals.indexOf(Math.max(...vals)); const maxC = total > 0 ? vals[maxI] / total : 0
  if (maxC > 0.4) { score -= 15; insights.push(`⚠ ${stocks[maxI]?.name ?? stocks[maxI]?.symbol} is ${Math.round(maxC*100)}% of portfolio`) }
  else insights.push('✓ No single stock over 40%')
  const winners = stocks.filter(s => getReturn(s, prices) > 0).length
  const wr = stocks.length ? winners / stocks.length : 0
  if (wr >= 0.6) { score += 10; insights.push(`✓ ${Math.round(wr*100)}% of stocks in profit`) }
  else insights.push(`⚠ Only ${Math.round(wr*100)}% profitable`)
  score = Math.min(100, Math.max(0, score))
  const label = score >= 75 ? 'Healthy' : score >= 50 ? 'Moderate' : 'Needs Attention'
  const color = score >= 75 ? 'var(--income)' : score >= 50 ? 'var(--gold)' : 'var(--rose)'
  return { score, label, color, insights }
}

type Tab = 'portfolio' | 'analytics' | 'growth' | 'news'
type SortKey = 'name' | 'return' | 'value' | 'invested' | 'price'

// ─── component ────────────────────────────────────────────────────────────────
export default function StocksDashboardClient({ stocks: initial }: { stocks: any[] }) {
  const router   = useRouter()
  const supabase = createClient()

  const [stocks, setStocks]           = useState(initial)
  const [tab, setTab]                 = useState<Tab>('portfolio')
  const [livePrices, setLivePrices]   = useState<Record<string, number>>({})
  const [priceChange, setPriceChange] = useState<Record<string, { change: number; changePct: number }>>({})
  const [priceLoading, setPriceLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [news, setNews]               = useState<any[]>([])
  const [newsLoading, setNewsLoading] = useState(true)
  const [expandedId, setExpandedId]   = useState<string | null>(null)
  const [sortBy, setSortBy]           = useState<SortKey>('value')
  const [stPage, setStPage]           = useState(1)
  const [stPageSize, setStPageSize]   = useState(20)
  const [sortDir, setSortDir]         = useState<'asc' | 'desc'>('desc')
  const [query, setQuery]             = useState('')
  const [showAdd, setShowAdd]         = useState(false)
  const [showImport, setShowImport]   = useState(false)
  const [txnsByStock, setTxnsByStock] = useState<Record<string, any[]>>({})
  const [allStockTxns, setAllStockTxns] = useState<any[]>([])
  const [editStock, setEditStock]     = useState<any | null>(null)
  const [deleteStock, setDeleteStock] = useState<any | null>(null)
  const [addLots, setAddLots]         = useState<any | null>(null)
  const [editLot, setEditLot]         = useState<{ stock: any; lot: any } | null>(null)
  const [deleting, setDeleting]       = useState(false)
  const [lumpsumStock, setLumpsumStock] = useState<any | null>(null)
  const [lumpsumQty, setLumpsumQty]   = useState('')
  const [lumpsumPrice, setLumpsumPrice] = useState('')
  const [lumpsumDate, setLumpsumDate] = useState(new Date().toISOString().slice(0, 10))
  const [lumpsumSaving, setLumpsumSaving] = useState(false)

  // ── fetch live prices ─────────────────────────────────────────────────────────
  async function fetchLivePrices() {
    setPriceLoading(true)
    const p: Record<string, number> = {}, c: Record<string, { change: number; changePct: number }> = {}
    const updates: Array<{ id: string; price: number }> = []
    await Promise.allSettled(stocks.map(async s => {
      try {
        const r = await fetch(`/api/stock-price?symbol=${encodeURIComponent(s.symbol)}`)
        const d = await r.json()
        if (d.price) { p[s.id] = d.price; c[s.id] = { change: d.change ?? 0, changePct: d.changePct ?? 0 }; updates.push({ id: s.id, price: d.price }) }
      } catch {}
    }))
    setLivePrices(p); setPriceChange(c); setLastUpdated(new Date()); setPriceLoading(false)

    // Persist last-fetched price so it shows instantly next visit
    const nowIso = new Date().toISOString()
    for (const u of updates) {
      supabase.from('stocks').update({ current_price: u.price, last_updated: nowIso }).eq('id', u.id).then(() => {}, () => {})
    }
  }

  useEffect(() => { if (stocks.length > 0) fetchLivePrices() }, []) // eslint-disable-line

  // Sync when the server sends fresh data (e.g. after a PDF import → router.refresh())
  useEffect(() => { setStocks(initial) }, [initial])

  // ── investment transaction history (re-runnable so it refreshes after a buy) ──
  async function loadStockTxns() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    try {
      const { data } = await supabase
        .from('investment_transactions')
        .select('*').eq('user_id', user.id).eq('asset_type', 'stock')
        .order('txn_date', { ascending: true })
      const grouped: Record<string, any[]> = {}
      ;(data ?? []).forEach((t: any) => { const k = t.asset_id ?? 'none'; (grouped[k] ||= []).push(t) })
      setTxnsByStock(grouped)
      setAllStockTxns(data ?? [])
    } catch { /* table not migrated yet */ }
  }
  useEffect(() => { loadStockTxns() }, []) // eslint-disable-line

  async function confirmDelete() {
    if (!deleteStock) return
    setDeleting(true)
    await supabase.from('investment_transactions').delete().eq('asset_id', deleteStock.id).then(() => {}, () => {})
    const { error } = await supabase.from('stocks').delete().eq('id', deleteStock.id)
    if (!error) setStocks(prev => prev.filter(x => x.id !== deleteStock.id))
    setDeleting(false); setDeleteStock(null); router.refresh(); loadStockTxns()
  }
  useEffect(() => {
    setNewsLoading(true)
    // Filter news to the user's stocks (symbol + company name)
    const terms = Array.from(new Set(stocks.flatMap(s => [s.symbol, String(s.name ?? '').trim().split(/\s+/)[0]]).filter((w: string) => w && w.length > 2))).slice(0, 12).join(',')
    fetch(`/api/market-news?topic=stocks${terms ? `&terms=${encodeURIComponent(terms)}` : ''}`).then(r => r.json())
      .then(d => setNews(d.articles?.slice(0, 10) ?? []))
      .catch(() => setNews([]))
      .finally(() => setNewsLoading(false))
  }, [])

  // ── sort ──────────────────────────────────────────────────────────────────────
  const sorted = useMemo(() => {
    return [...stocks].sort((a, b) => {
      let va = 0, vb = 0
      if (sortBy === 'name')     return sortDir === 'asc' ? a.name?.localeCompare(b.name) : b.name?.localeCompare(a.name)
      if (sortBy === 'return')   { va = getReturn(a, livePrices); vb = getReturn(b, livePrices) }
      if (sortBy === 'price')    { va = livePrices[a.id] ?? Number(a.current_price ?? a.avg_buy_price); vb = livePrices[b.id] ?? Number(b.current_price ?? b.avg_buy_price) }
      if (sortBy === 'invested') { va = Number(a.quantity) * Number(a.avg_buy_price); vb = Number(b.quantity) * Number(b.avg_buy_price) }
      if (sortBy === 'value')    { va = Number(a.quantity) * (livePrices[a.id] ?? Number(a.current_price ?? a.avg_buy_price)); vb = Number(b.quantity) * (livePrices[b.id] ?? Number(b.current_price ?? b.avg_buy_price)) }
      return sortDir === 'desc' ? vb - va : va - vb
    })
  }, [stocks, livePrices, sortBy, sortDir])

  function toggleSort(key: SortKey) {
    if (sortBy === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(key); setSortDir('desc') }
  }

  // Search-filtered view for the portfolio list (Growth tab keeps the full `sorted`)
  const visible = useMemo(() => {
    if (!query.trim()) return sorted
    const q = query.toLowerCase()
    return sorted.filter(s => `${s.symbol ?? ''} ${s.name ?? ''} ${s.sector ?? ''}`.toLowerCase().includes(q))
  }, [sorted, query])
  useEffect(() => { setStPage(1) }, [query, sortBy, sortDir])
  const stPaged = useMemo(() => visible.slice((stPage - 1) * stPageSize, stPage * stPageSize), [visible, stPage, stPageSize])

  // ── computed ───────────────────────────────────────────────────────────────────
  const totalInvested = stocks.reduce((a, s) => a + Number(s.quantity) * Number(s.avg_buy_price), 0)
  const currentValue  = stocks.reduce((a, s) => a + Number(s.quantity) * (livePrices[s.id] ?? Number(s.current_price ?? s.avg_buy_price)), 0)
  const totalRet      = totalInvested > 0 ? (currentValue - totalInvested) / totalInvested * 100 : 0
  const absRet        = currentValue - totalInvested
  const health        = computeHealth(stocks, livePrices)

  const bySector = useMemo(() => {
    const m: Record<string, number> = {}
    const colors: Record<string, string> = {}
    let ci = 0
    stocks.forEach(s => {
      const sec = s.sector || 'Other'
      const val = Number(s.quantity) * (livePrices[s.id] ?? Number(s.current_price ?? s.avg_buy_price))
      if (!colors[sec]) colors[sec] = SECTOR_COLORS[ci++ % SECTOR_COLORS.length]
      m[sec] = (m[sec] ?? 0) + val
    })
    return Object.entries(m).map(([sector, value]) => ({
      sector, value: Math.round(value), pct: currentValue > 0 ? Math.round(value / currentValue * 100) : 0,
      color: colors[sector], emoji: SECTOR_EMOJI[sector] ?? '🏭',
    })).sort((a, b) => b.value - a.value)
  }, [stocks, livePrices, currentValue])

  const hhi = useMemo(() => {
    const vals = stocks.map(s => Number(s.quantity) * (livePrices[s.id] ?? Number(s.current_price ?? s.avg_buy_price)))
    const total = vals.reduce((a, v) => a + v, 0)
    if (total === 0) return 0
    return Math.round(vals.reduce((a, v) => a + (v / total) ** 2, 0) * 100) / 100
  }, [stocks, livePrices, currentValue])

  // ── lumpsum ────────────────────────────────────────────────────────────────────
  async function saveLumpsum() {
    if (!lumpsumStock || !lumpsumQty || !lumpsumPrice) return
    setLumpsumSaving(true)
    const addQty = Number(lumpsumQty); const addPrice = Number(lumpsumPrice)
    const newQty = Number(lumpsumStock.quantity) + addQty
    const newAvg = (Number(lumpsumStock.quantity) * Number(lumpsumStock.avg_buy_price) + addQty * addPrice) / newQty
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const ds = lumpsumDate || new Date().toISOString().slice(0, 10)
      await Promise.all([
        supabase.from('stocks').update({ quantity: newQty, avg_buy_price: newAvg }).eq('id', lumpsumStock.id),
        supabase.from('transactions').insert({ user_id: user.id, txn_date: ds, merchant: lumpsumStock.name ?? lumpsumStock.symbol, description: `Buy ${addQty} shares of ${lumpsumStock.symbol} @ ₹${addPrice}`, category: 'Investment', sub_category: 'Stock Purchase', amount: addQty * addPrice, currency: lumpsumStock.currency ?? 'INR', country: lumpsumStock.country ?? 'India', txn_type: 'expense', source: 'manual' }),
        supabase.from('investment_transactions').insert({ user_id: user.id, asset_type: 'stock', asset_id: lumpsumStock.id, asset_name: lumpsumStock.symbol, txn_date: ds, txn_type: 'purchase', amount: addQty * addPrice, units: addQty, nav: addPrice, currency: lumpsumStock.currency ?? 'INR', source: 'buy_action' }).then(() => {}, () => {}),
      ])
      setStocks(prev => prev.map(s => s.id === lumpsumStock.id ? { ...s, quantity: newQty, avg_buy_price: newAvg } : s))
    }
    setLumpsumStock(null); setLumpsumQty(''); setLumpsumPrice(''); setLumpsumDate(new Date().toISOString().slice(0, 10)); setLumpsumSaving(false); router.refresh()
  }

  // ── empty ──────────────────────────────────────────────────────────────────────
  if (stocks.length === 0) return (
    <div className="flex flex-col items-center justify-center py-24 space-y-4">
      <div className="text-6xl">📊</div>
      <div className="text-[18px] font-bold" style={{ color: 'var(--text)' }}>No stocks added yet</div>
      <div className="text-[13px]" style={{ color: 'var(--text3)' }}>Add your first stock to track live prices, returns, and portfolio health</div>
      <div className="flex items-center gap-2">
        <button onClick={() => setShowAdd(true)} className="px-6 py-2.5 rounded-xl text-white font-semibold" style={{ background: 'var(--sage)' }}>
          <Plus size={14} className="inline mr-1.5" /> Add Stock
        </button>
        <button onClick={() => setShowImport(true)} className="px-6 py-2.5 rounded-xl font-semibold border"
          style={{ borderColor: 'var(--line)', color: 'var(--text3)', background: 'var(--bg2)' }}>
          <FileUp size={14} className="inline mr-1.5" /> Import from PDF
        </button>
      </div>
      {showAdd && <BatchPurchaseModal kind="stock" onClose={() => { setShowAdd(false); router.refresh(); loadStockTxns() }} />}
      {showImport && <HoldingsUploadModal kind="stocks" onClose={() => { setShowImport(false); router.refresh() }} />}
    </div>
  )

  const Overlay = ({ children }: { children: React.ReactNode }) => (
    <div className="fixed inset-0 wl-sheet z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>{children}</div>
  )

  return (
    <div className="space-y-4 animate-fade-up">

      {/* Lumpsum modal */}
      {lumpsumStock && (
        <Overlay>
          <div className="wl-sheet-panel rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4" style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
            <div className="flex items-center justify-between">
              <div className="text-[15px] font-bold" style={{ color: 'var(--text)' }}>Buy More Shares</div>
              <button onClick={() => { setLumpsumStock(null); setLumpsumQty(''); setLumpsumPrice(''); setLumpsumDate(new Date().toISOString().slice(0, 10)) }} style={{ color: 'var(--text3)' }}><X size={16} /></button>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-[14px] font-bold" style={{ color: 'var(--text)' }}>{lumpsumStock.symbol}</div>
              <div className="text-[11px] px-2 py-0.5 rounded" style={{ background: 'var(--bg2)', color: 'var(--text3)' }}>{lumpsumStock.name}</div>
            </div>
            <div className="p-3 rounded-xl" style={{ background: 'var(--bg2)' }}>
              <div className="text-[10px]" style={{ color: 'var(--text3)' }}>Current Price</div>
              <div className="text-[20px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>
                ₹{(livePrices[lumpsumStock.id] ?? Number(lumpsumStock.current_price ?? lumpsumStock.avg_buy_price)).toFixed(2)}
                {livePrices[lumpsumStock.id] && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ background: '#D1FAE5', color: '#065F46' }}>Live</span>}
              </div>
            </div>
            <div>
              <label className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Purchase Date</label>
              <input type="date" value={lumpsumDate} max={new Date().toISOString().slice(0, 10)} onChange={e => setLumpsumDate(e.target.value)} className="wl-input mt-1 w-full" style={{ background: 'var(--bg2)' }} />
              <div className="text-[10px] mt-1" style={{ color: 'var(--text3)' }}>Pick a past date to log a historical purchase for your investment history.</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Shares to Buy</label>
                <input type="number" value={lumpsumQty} onChange={e => setLumpsumQty(e.target.value)} placeholder="10" className="wl-input mt-1 w-full" style={{ background: 'var(--bg2)' }} />
              </div>
              <div>
                <label className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Price per Share (₹)</label>
                <input type="number" value={lumpsumPrice} onChange={e => setLumpsumPrice(e.target.value)}
                  placeholder={(livePrices[lumpsumStock.id] ?? Number(lumpsumStock.current_price ?? lumpsumStock.avg_buy_price)).toFixed(2)}
                  className="wl-input mt-1 w-full" style={{ background: 'var(--bg2)' }} />
              </div>
            </div>
            {lumpsumQty && lumpsumPrice && (
              <div className="p-3 rounded-xl" style={{ background: 'var(--sage-bg)' }}>
                <div className="text-[11px]" style={{ color: 'var(--text3)' }}>Total Cost</div>
                <div className="text-[18px] font-bold tabular-nums" style={{ color: 'var(--sage)' }}>
                  ₹{(Number(lumpsumQty) * Number(lumpsumPrice)).toLocaleString('en-IN')}
                </div>
                <div className="text-[10px] mt-0.5" style={{ color: 'var(--text3)' }}>
                  New avg buy: ₹{(
                    (Number(lumpsumStock.quantity) * Number(lumpsumStock.avg_buy_price) + Number(lumpsumQty) * Number(lumpsumPrice)) /
                    (Number(lumpsumStock.quantity) + Number(lumpsumQty))
                  ).toFixed(2)}
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => { setLumpsumStock(null); setLumpsumQty(''); setLumpsumPrice(''); setLumpsumDate(new Date().toISOString().slice(0, 10)) }}
                className="flex-1 py-2.5 rounded-xl border text-[12px] font-semibold"
                style={{ borderColor: 'var(--line)', color: 'var(--text3)', background: 'var(--bg2)' }}>Cancel</button>
              <button onClick={saveLumpsum} disabled={lumpsumSaving || !lumpsumQty || !lumpsumPrice}
                className="flex-1 py-2.5 rounded-xl text-white text-[12px] font-bold"
                style={{ background: 'var(--sage)', opacity: (!lumpsumQty || !lumpsumPrice) ? 0.5 : 1 }}>
                {lumpsumSaving ? 'Saving…' : 'Buy Shares'}
              </button>
            </div>
          </div>
        </Overlay>
      )}

      <PageHeader title="Stocks" sub={priceLoading ? 'Fetching live prices…' : lastUpdated ? `Prices updated ${lastUpdated.toLocaleTimeString()}` : 'NSE · live prices'}
        onAdd={() => setShowAdd(true)} addLabel="Add stock"
        actions={<>
          <button onClick={fetchLivePrices} disabled={priceLoading} className="wl-btn" style={{ height: 34 }}><RefreshCw size={13} className={priceLoading ? 'animate-spin' : ''} />{priceLoading ? 'Updating…' : 'Refresh prices'}</button>
          <button onClick={() => setShowImport(true)} className="wl-btn" style={{ height: 34 }}><FileUp size={13} />Import PDF</button>
          <Link href="/dashboard/learn" className="wl-btn" style={{ height: 34 }}><GraduationCap size={13} />Learn</Link>
          <button onClick={() => setShowAdd(true)} className="wl-btn wl-btn-primary" style={{ height: 34 }}><Plus size={14} />Add stock</button>
        </>} />
      {/* Phone: header actions are desktop-only */}
      <div className="md:hidden flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4">
        <button onClick={fetchLivePrices} disabled={priceLoading} className="wl-chip flex-shrink-0">{priceLoading ? 'Updating…' : 'Refresh prices'}</button>
        <button onClick={() => setShowImport(true)} className="wl-chip flex-shrink-0">Import PDF</button>
        <Link href="/dashboard/learn" className="wl-chip flex-shrink-0">Learn</Link>
      </div>
      {stocks.length > 0 && <InsightBar text={`${stocks.length} stock${stocks.length === 1 ? '' : 's'} worth ${fmt(currentValue)}, ${totalRet >= 0 ? 'up' : 'down'} ${Math.abs(totalRet).toFixed(1)}% overall.${bySector[0] ? ` ${bySector[0].sector} is ${bySector[0].pct}% of the portfolio.` : ''}`} prompt={`My stocks: ${stocks.slice(0, 20).map(s => `${s.symbol ?? s.name}${s.sector ? ` (${s.sector})` : ''}`).join(', ')}. Invested ${fmt(totalInvested)}, worth ${fmt(currentValue)}.`} />}
      {stocks.length > 0 && <AiActions actions={['Am I too concentrated?', 'Which stocks should I review?']} context={`My stocks: ${stocks.slice(0, 20).map(s => `${s.symbol ?? s.name}${s.sector ? ` (${s.sector})` : ''}`).join(', ')}. Invested ${fmt(totalInvested)}, worth ${fmt(currentValue)}.`} />}

      {/* ── Summary: value, gain, today, invested, and the sector mix ── */}
      {stocks.length > 0 && (() => {
        const today = stocks.reduce((a, s) => a + (priceChange[s.id]?.change ?? 0) * Number(s.quantity), 0)
        const known = stocks.some(s => priceChange[s.id])
        const bySector = Object.entries(stocks.reduce((m: Record<string, number>, s) => { const k = s.sector || 'Other'; m[k] = (m[k] ?? 0) + Number(s.quantity) * (livePrices[s.id] ?? Number(s.current_price ?? s.avg_buy_price)); return m }, {}))
          .sort((a, b) => b[1] - a[1])
        const top = bySector.slice(0, 4), rest = bySector.slice(4).reduce((s, [, v]) => s + v, 0)
        const parts = [...top, ...(rest > 0 ? [['Other', rest] as [string, number]] : [])]
        const COLORS = ['#6A55E8', '#2E8FD8', '#E58A2B', '#1E8F5F', '#9A9DB3']
        const dated = allStockTxns.filter((t: any) => ['purchase', 'sip', 'switch_in'].includes(t.txn_type)).reduce((s: number, t: any) => s + (Number(t.amount) || 0), 0)
        const yearly = totalInvested > 0 && dated >= totalInvested * 0.8
          ? xirr([...allStockTxns.filter((t: any) => Number(t.amount) > 0 && t.txn_type !== 'dividend').map((t: any) => ({ t: Date.parse(t.txn_date), a: ['redemption', 'switch_out'].includes(t.txn_type) ? Number(t.amount) : -Number(t.amount) })), { t: Date.now(), a: currentValue }])
          : null
        return (
          <section className="wl-card p-4 md:p-6 flex flex-col gap-4 md:gap-5">
            <div className="flex justify-between gap-4 md:gap-6 flex-wrap">
              <div>
                <div className="text-[12.5px] md:text-[13px]" style={{ color: 'var(--text3)' }}>Value today</div>
                <div className="text-[28px] md:text-[36px] font-bold tracking-[-0.02em] tabular-nums" style={{ color: 'var(--text)' }}>{fmt(currentValue)}</div>
                <div className="text-[13px] md:text-[14px] font-semibold mt-0.5" style={{ color: absRet >= 0 ? 'var(--pos-text)' : '#B4231A' }}>{absRet >= 0 ? '+' : '−'}{fmt(Math.abs(absRet))} · {totalRet >= 0 ? '+' : ''}{totalRet.toFixed(1)}% on what you put in</div>
              </div>
              <div className="grid grid-cols-3 gap-2 md:gap-3 w-full md:w-auto md:min-w-[440px]">
                {[['Invested', fmt(totalInvested)], ['Today', known ? `${today >= 0 ? '+' : '−'}${fmt(Math.abs(today))}` : '—'], ['Yearly return', yearly != null ? `${yearly}%` : '—']].map(([k, v]) => (
                  <div key={k} className="rounded-xl px-3 py-2.5" style={{ background: 'var(--bg2)' }}>
                    <div className="text-[11.5px] md:text-[12px]" style={{ color: 'var(--text3)' }}>{k}</div>
                    <div className="text-[14px] md:text-[17px] font-bold tabular-nums mt-0.5 truncate" style={{ color: k === 'Today' && known ? (today >= 0 ? 'var(--pos-text)' : '#B4231A') : 'var(--text)' }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
            {currentValue > 0 && (
              <div>
                <div className="flex h-2.5 rounded-full overflow-hidden gap-[2px]" role="img" aria-label={parts.map(([k, v]) => `${k} ${Math.round(v / currentValue * 100)}%`).join(', ')}>
                  {parts.map(([k, v], i) => <div key={k} style={{ width: `${v / currentValue * 100}%`, background: COLORS[i] }} />)}
                </div>
                <div className="flex gap-x-4 gap-y-1 mt-2 text-[12px] md:text-[12.5px] flex-wrap" style={{ color: 'var(--text2)' }}>
                  {parts.map(([k, v], i) => <span key={k}><i className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: COLORS[i] }} />{k} {Math.round(v / currentValue * 100)}%</span>)}
                  <span className="md:ml-auto" style={{ color: 'var(--text3)' }}>{stocks.length} share{stocks.length === 1 ? '' : 's'} · health {health.score}/100</span>
                </div>
              </div>
            )}
          </section>
        )
      })()}

      {/* ── Three views ─────────────────────────────────────────────────────── */}
      <div className="flex gap-1 p-1 rounded-xl w-fit max-w-full overflow-x-auto no-scrollbar max-md:sticky max-md:top-0 max-md:z-20" style={{ background: '#EBEAF3' }} role="tablist" aria-label="Stock views">
        {([['portfolio', 'Holdings'], ['analytics', 'Insights'], ['growth', 'Growth']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key as Tab)} role="tab" aria-selected={tab === key}
            className="h-9 px-3.5 md:px-[18px] rounded-[9px] text-[13px] font-semibold whitespace-nowrap"
            style={tab === key ? { background: '#fff', color: 'var(--text)', boxShadow: '0 1px 2px rgba(20,22,41,.08)' } : { color: 'var(--text3)' }}>{label}</button>
        ))}
      </div>

      {/* ── HOLDINGS: each share opens its own page ───────────────────────── */}
      {tab === 'portfolio' && (
        <div className="wl-card overflow-hidden">
          <div className="px-4 md:px-5 pt-3.5 md:pt-4 pb-3">
            <ListSearch value={query} onChange={setQuery} placeholder="Search stock, symbol or sector…">
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
          <div className="hidden md:grid grid-cols-[minmax(0,2.6fr)_repeat(4,minmax(0,1fr))_minmax(0,1.2fr)_20px] gap-3 px-5 py-2 text-[11px] font-semibold uppercase tracking-[.05em]" style={{ background: '#FAFAFE', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)', color: 'var(--text3)' }}>
            <span>Share</span><span className="text-right">Price</span><span className="text-right">Invested</span><span className="text-right">Value</span><span className="text-right">Return</span><span>Share of stocks</span><span />
          </div>
          {stPaged.map(s => {
            const price = livePrices[s.id] ?? Number(s.current_price ?? s.avg_buy_price)
            const invested = Number(s.quantity) * Number(s.avg_buy_price), val = Number(s.quantity) * price
            const ret = invested > 0 ? (val - invested) / invested * 100 : null
            const day = priceChange[s.id]
            const share = currentValue > 0 ? val / currentValue * 100 : 0
            const retColor = ret == null ? 'var(--text3)' : ret >= 0 ? 'var(--pos-text)' : '#B4231A'
            return (
              <Link key={s.id} href={holdingHref('stocks', s.id)} className="grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,2.6fr)_repeat(4,minmax(0,1fr))_minmax(0,1.2fr)_20px] gap-3 px-4 md:px-5 py-3 items-center hover:bg-[#FAFAFE] transition-colors" style={{ borderBottom: '1px solid #F1F0F7' }}>
                <span className="flex items-center gap-3 min-w-0">
                  <span className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0 text-[12px] font-bold" style={{ background: 'var(--accent-bg)', color: 'var(--accent2)' }}>{String(s.symbol ?? s.name ?? '?').slice(0, 3).toUpperCase()}</span>
                  <span className="min-w-0">
                    <span className="block text-[13.5px] md:text-[14px] font-semibold truncate" style={{ color: 'var(--text)' }}>{s.name || s.symbol}</span>
                    <span className="block text-[11.5px] md:text-[12px] truncate mt-px" style={{ color: 'var(--text3)' }}>{[s.symbol, s.sector].filter(Boolean).join(' · ')} · {Number(s.quantity)} shares<span className="md:hidden"> · <b style={{ color: retColor }}>{ret == null ? '—' : `${ret >= 0 ? '+' : ''}${ret.toFixed(1)}%`}</b></span></span>
                  </span>
                </span>
                <span className="md:hidden text-right"><span className="block text-[13.5px] font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{fmt(val)}</span><span className="block text-[11px] tabular-nums" style={{ color: day ? (day.changePct >= 0 ? 'var(--pos-text)' : '#B4231A') : 'var(--text4)' }}>{day ? `${day.changePct >= 0 ? '+' : ''}${day.changePct.toFixed(1)}% today` : `${share.toFixed(0)}%`}</span></span>
                <span className="hidden md:block text-right"><span className="block text-[13px] tabular-nums" style={{ color: 'var(--text)' }}>₹{price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>{day && <span className="block text-[11.5px] tabular-nums" style={{ color: day.changePct >= 0 ? 'var(--pos-text)' : '#B4231A' }}>{day.changePct >= 0 ? '+' : ''}{day.changePct.toFixed(2)}% today</span>}</span>
                <span className="hidden md:block text-right text-[13px] tabular-nums" style={{ color: 'var(--text2)' }}>{fmt(invested)}</span>
                <span className="hidden md:block text-right text-[14px] font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{fmt(val)}</span>
                <span className="hidden md:block text-right"><span className="block text-[13.5px] font-semibold tabular-nums" style={{ color: retColor }}>{ret == null ? '—' : `${ret >= 0 ? '+' : ''}${ret.toFixed(1)}%`}</span><span className="block text-[11.5px] tabular-nums" style={{ color: 'var(--text3)' }}>{val - invested >= 0 ? '+' : '−'}{fmt(Math.abs(val - invested))}</span></span>
                <span className="hidden md:flex items-center gap-2"><span className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--track)' }}><span className="block h-full rounded-full" style={{ width: `${Math.min(100, share)}%`, background: 'var(--accent)' }} /></span><span className="text-[12px] tabular-nums w-9 text-right" style={{ color: 'var(--text3)' }}>{share.toFixed(0)}%</span></span>
                <ChevronRight size={16} className="hidden md:block" style={{ color: 'var(--text4)' }} />
              </Link>
            )
          })}
          {visible.length === 0 && <div className="px-5 py-8 text-center text-[13px]" style={{ color: 'var(--text3)' }}>{stocks.length ? 'No share matches your search.' : 'No shares yet. Add one, or import a broker statement.'}</div>}
          <Pagination total={visible.length} page={stPage} pageSize={stPageSize} onPage={setStPage} onPageSize={n => { setStPageSize(n); setStPage(1) }} />
          {stocks.length > 0 && <div className="px-5 py-3 text-[12px]" style={{ color: 'var(--text3)' }}>Open a share for its price chart, every buy, tax if you sell, and where it could go.</div>}
        </div>
      )}

      {/* ── ANALYTICS TAB ─────────────────────────────────────────────────────── */}
      {tab === 'analytics' && (() => {
        const Section = ({ icon: Icon, title, children, right }: { icon: any; title: string; children: React.ReactNode; right?: React.ReactNode }) => (
          <section className="wl-card px-4 md:px-5 py-4 md:py-[18px]">
            <div className="flex items-center gap-2.5 mb-3.5">
              <span className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}><Icon size={15} /></span>
              <h3 className="text-[14px] md:text-[15px] font-semibold flex-1" style={{ color: 'var(--text)' }}>{title}</h3>
              {right}
            </div>
            {children}
          </section>
        )
        const hhiTone = hhi < 0.15 ? { c: '#1E8F5F', bg: '#E7F7EF', t: 'Well spread' } : hhi < 0.25 ? { c: '#B96A0B', bg: '#FFF2E2', t: 'Moderate' } : { c: '#D9482F', bg: '#FDECE8', t: 'Concentrated' }
        const byValue = [...stocks].map(st => ({ st, val: Number(st.quantity) * (livePrices[st.id] ?? Number(st.current_price ?? st.avg_buy_price)) })).sort((x, y) => y.val - x.val)
        const byRet = [...stocks].map(st => ({ st, r: getReturn(st, livePrices) })).sort((x, y) => y.r - x.r)
        const maxAbs = Math.max(1, ...byRet.map(x => Math.abs(x.r)))
        return (
          <div className="flex flex-col gap-3.5 md:gap-4">
            <Section icon={ShieldCheck} title="Portfolio health">
              <div className="flex items-center gap-4">
                <Ring pct={health.score} size={84} color={health.color} track="var(--track)" label={`Health ${health.score} of 100`}>
                  <div className="text-[22px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{health.score}</div>
                </Ring>
                <div className="flex-1 min-w-0 flex flex-col gap-2">
                  <div className="text-[14px] font-semibold" style={{ color: health.color }}>{health.label}</div>
                  {health.insights.map((ins, i) => {
                    const ok = ins.startsWith('✓')
                    return (
                      <div key={i} className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 mt-px" style={ok ? { background: '#E7F7EF', color: '#1E8F5F' } : { background: '#FFF2E2', color: '#B96A0B' }}>
                          {ok ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                        </span>
                        <span className="text-[13px] leading-snug" style={{ color: 'var(--text2)' }}>{ins.replace(/^[✓⚠] /, '')}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </Section>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 md:gap-4">
              <Section icon={PieChartIcon} title="Sector exposure">
                {bySector.length === 0 ? (
                  <p className="text-[12.5px]" style={{ color: 'var(--text3)' }}>Add sectors to your stocks to see this.</p>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {bySector.map(b => (
                      <div key={b.sector}>
                        <div className="flex items-center justify-between gap-2 text-[12.5px] mb-1">
                          <span className="font-semibold" style={{ color: 'var(--text)' }}>{b.sector}</span>
                          <span className="tabular-nums" style={{ color: 'var(--text3)' }}>{fmt(b.value)} · <b style={{ color: 'var(--text)' }}>{b.pct}%</b></span>
                        </div>
                        <div className="h-1.5 rounded-full" style={{ background: 'var(--track)' }}>
                          <div className="h-full rounded-full wl-grow" style={{ width: `${b.pct}%`, background: b.pct > 50 ? '#DC2626' : b.color }} />
                        </div>
                        {b.pct > 50 && <div className="text-[11.5px] mt-0.5" style={{ color: '#D9482F' }}>Over half your stocks sit in this sector</div>}
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              <Section icon={Layers} title="Concentration" right={<span className="rounded-full px-2.5 py-0.5 text-[12px] font-semibold" style={{ background: hhiTone.bg, color: hhiTone.c }}>{hhiTone.t}</span>}>
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-[28px] font-bold tabular-nums" style={{ color: 'var(--text)' }}>{hhi.toFixed(2)}</span>
                  <span className="text-[12px]" style={{ color: 'var(--text3)' }}>Herfindahl index · lower is better</span>
                </div>
                <div className="flex flex-col gap-2">
                  {byValue.slice(0, 5).map(({ st, val }, i) => {
                    const pct = currentValue > 0 ? Math.round(val / currentValue * 100) : 0
                    return (
                      <div key={st.id} className="flex items-center gap-2.5">
                        <span className="text-[12px] w-4 text-center font-semibold" style={{ color: 'var(--text4)' }}>{i + 1}</span>
                        <span className="text-[13px] font-semibold w-24 truncate" style={{ color: 'var(--text)' }}>{st.symbol}</span>
                        <span className="flex-1 h-1.5 rounded-full" style={{ background: 'var(--track)' }}><span className="block h-full rounded-full wl-grow" style={{ width: `${pct}%`, background: SECTOR_COLORS[i % SECTOR_COLORS.length] }} /></span>
                        <span className="text-[12.5px] font-semibold tabular-nums w-9 text-right" style={{ color: 'var(--text)' }}>{pct}%</span>
                      </div>
                    )
                  })}
                </div>
              </Section>
            </div>

            <Section icon={TrendingUp} title="Return by stock">
              <div className="flex flex-col gap-2.5">
                {byRet.map(({ st, r }) => (
                  <div key={st.id} className="flex items-center gap-2.5">
                    <span className="text-[13px] font-semibold w-24 truncate" style={{ color: 'var(--text)' }}>{st.symbol}</span>
                    {/* Diverging bar: losses grow left of the centre line, gains right */}
                    <span className="flex-1 flex items-center h-5">
                      <span className="flex-1 flex justify-end">{r < 0 && <span className="h-3 rounded-l-full wl-grow" style={{ width: `${Math.abs(r) / maxAbs * 100}%`, background: '#F2A5A5' }} />}</span>
                      <span className="w-px h-5" style={{ background: 'var(--border2)' }} />
                      <span className="flex-1 flex">{r >= 0 && <span className="h-3 rounded-r-full wl-grow" style={{ width: `${r / maxAbs * 100}%`, background: '#2FB67C' }} />}</span>
                    </span>
                    <span className="text-[12.5px] font-semibold tabular-nums w-16 text-right" style={{ color: r >= 0 ? '#16A34A' : '#DC2626' }}>{r >= 0 ? '+' : ''}{r.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        )
      })()}

      {/* ── NEWS TAB ──────────────────────────────────────────────────────────── */}
      {tab === 'analytics' && (
        <div className="wl-card px-4 md:px-5 py-4 md:py-[18px]">
          <div className="flex items-center gap-2.5 mb-3">
            <span className="w-8 h-8 rounded-[10px] flex items-center justify-center" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}><Newspaper size={15} /></span>
            <h3 className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Stock market news</h3>
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
                      {article.source} · {article.pubDate ? new Date(article.pubDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}
                    </span>
                  </span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── GROWTH TAB (Month-on-Month / Year-on-Year) ────────────────────────── */}
      {tab === 'growth' && (
        <div className="space-y-4">
          <div className="wl-card px-4 md:px-5 py-4 md:py-[18px]">
            <div className="flex items-center gap-2.5 mb-3">
            <span className="w-8 h-8 rounded-[10px] flex items-center justify-center" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}><TrendingUp size={15} /></span>
            <h3 className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>How your stocks have grown</h3>
          </div>
            <InvestmentTimeline txns={allStockTxns} invested={totalInvested} currentValue={currentValue} />
          </div>

          {allStockTxns.length === 0 && (
            <div className="rounded-xl px-4 py-3 text-[12.5px] leading-snug" style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', color: 'var(--accent2)' }}>
              Trends build up from your buy history. Each purchase you record with <b>Buy</b> is added with its date.
            </div>
          )}

          <div className="wl-card px-4 md:px-5 py-4 md:py-[18px]">
            <h3 className="text-[14px] md:text-[15px] font-semibold mb-3" style={{ color: 'var(--text)' }}>Invested each year, by stock</h3>
            <InvestmentMatrix
              assets={sorted.map(s => {
                const price = livePrices[s.id] ?? Number(s.current_price ?? s.avg_buy_price)
                return { id: s.id, name: s.symbol, invested: Number(s.quantity) * Number(s.avg_buy_price), currentValue: Number(s.quantity) * price }
              })}
              txnsByAsset={txnsByStock}
            />
          </div>
        </div>
      )}

      {showAdd && <BatchPurchaseModal kind="stock" onClose={() => { setShowAdd(false); router.refresh(); loadStockTxns() }} />}
      {showImport && <HoldingsUploadModal kind="stocks" onClose={() => { setShowImport(false); router.refresh() }} />}
      {addLots && <BatchPurchaseModal kind="stock" existing={addLots} onClose={() => { setAddLots(null); router.refresh(); loadStockTxns() }} />}
      {editLot && <EditLotModal kind="stock" holding={editLot.stock} lot={editLot.lot} onClose={() => { setEditLot(null); router.refresh(); loadStockTxns() }} />}
      {editStock && <EditHoldingModal kind="stock" row={editStock} onClose={() => { setEditStock(null); router.refresh() }} />}
      {deleteStock && (
        <Overlay>
          <div className="wl-sheet-panel rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4" style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
            <div className="flex items-center justify-between">
              <div className="text-[15px] font-bold" style={{ color: 'var(--text)' }}>Delete Stock?</div>
              <button onClick={() => setDeleteStock(null)} style={{ color: 'var(--text3)' }}><X size={16} /></button>
            </div>
            <div className="text-[12px]" style={{ color: 'var(--text2)' }}>
              Remove <strong style={{ color: 'var(--text)' }}>{deleteStock.symbol}</strong> and its recorded buy history? This can't be undone.
            </div>
            <div className="flex gap-2">
              <button onClick={() => setDeleteStock(null)} className="flex-1 py-2.5 rounded-xl border text-[12px] font-semibold" style={{ borderColor: 'var(--line)', color: 'var(--text3)', background: 'var(--bg2)' }}>Cancel</button>
              <button onClick={confirmDelete} disabled={deleting} className="flex-1 py-2.5 rounded-xl text-white text-[12px] font-bold" style={{ background: 'var(--rose)' }}>{deleting ? 'Deleting…' : 'Delete'}</button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  )
}
