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
  Newspaper, BarChart2, ListFilter, ArrowUpDown, IndianRupee, FileUp, Pencil, Trash2, GraduationCap, ChevronDown, Search,
} from 'lucide-react'
import Link from 'next/link'
import EditHoldingModal from '@/components/forms/EditHoldingModal'
import BatchPurchaseModal from '@/components/forms/BatchPurchaseModal'
import EditLotModal from '@/components/forms/EditLotModal'
import HoldingsUploadModal from '@/components/forms/HoldingsUploadModal'
import InvestmentTimeline from '@/components/dashboard/InvestmentTimeline'
import InvestmentMatrix from '@/components/dashboard/InvestmentMatrix'

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
  const [sortBy, setSortBy]           = useState<SortKey>('return')
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

      {/* ── Headline value + chart by stock (same card on desktop and phone), tiles ── */}
      {stocks.length > 0 && (() => {
        const bars = stocks.map(st => {
          const v = Number(st.quantity) * (livePrices[st.id] ?? Number(st.current_price ?? st.avg_buy_price))
          return { label: String(st.symbol), value: v, hi: true, tip: `${st.symbol}: ${fmt(v)}` }
        }).sort((a, b) => b.value - a.value).slice(0, 8)
        return (
          <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-3.5 md:gap-4">
            <HeroStat label="Value today" value={fmt(currentValue)} tone={totalRet >= 0 ? 'good' : 'bad'}
              delta={`${totalRet >= 0 ? '▲' : '▼'} ${Math.abs(totalRet).toFixed(2)}% on ${fmt(totalInvested)} invested`}
              right={<span className="text-[11.5px]" style={{ color: 'var(--text3)' }}>Value by stock</span>}>
              {bars.length > 1 && <Bars data={bars} className="h-[110px] md:h-auto md:flex-1 md:min-h-[150px] mt-3" label={`Value by stock: ${bars.map(b => b.tip).join(', ')}`} />}
            </HeroStat>
            <div className="grid grid-cols-2 lg:grid-cols-1 gap-2.5 md:gap-3.5 lg:content-start">
              <KpiTile label="Invested" value={fmt(totalInvested)} delta={`${stocks.length} stock${stocks.length === 1 ? '' : 's'}`} tint={1} icon={IcWallet} />
              <KpiTile label="Gain / loss" value={`${absRet >= 0 ? '+' : '−'}${fmt(Math.abs(absRet))}`} tint={2} icon={IcUp}
                tone={absRet >= 0 ? 'good' : 'bad'} delta={`${totalRet >= 0 ? '+' : ''}${totalRet.toFixed(2)}% overall`} />
              <KpiTile className="max-lg:col-span-2" label="Portfolio health" value={`${health.score}/100`} tint={3} icon={IcHealth}
                tone={health.score >= 75 ? 'good' : health.score >= 50 ? 'neutral' : 'bad'} delta={bySector[0] ? `${bySector[0].sector} is ${bySector[0].pct}% of value` : 'Spread across sectors'} />
            </div>
          </div>
        )
      })()}

      {/* Tabs */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0 max-md:sticky max-md:top-0 max-md:z-20 max-md:py-2 max-md:bg-[var(--canvas-m)]" role="tablist" aria-label="Stock views">
        {([['portfolio', 'Portfolio', ListFilter], ['analytics', 'Analytics', BarChart2], ['growth', 'Growth', TrendingUp], ['news', 'News', Newspaper]] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key as Tab)} role="tab" aria-selected={tab === key} aria-pressed={tab === key}
            className="wl-chip flex-shrink-0 gap-1.5" style={{ height: 32 }}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {/* ── PORTFOLIO TAB ─────────────────────────────────────────────────────── */}
      {tab === 'portfolio' && (
        <div className="space-y-3">
        <div className="wl-card overflow-hidden">
          <div className="px-4 md:px-5 pt-3.5 md:pt-[18px] pb-2.5 flex flex-col gap-2.5">
            <div>
              <h2 className="text-[14px] md:text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Your stocks</h2>
              <div className="text-[11.5px] md:text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>
                {visible.length === stocks.length ? `${stocks.length} stock${stocks.length === 1 ? '' : 's'}` : `${visible.length} of ${stocks.length}`} · tap a stock for details and purchases
              </div>
            </div>
            <ListSearch value={query} onChange={setQuery} placeholder="Search stock, symbol or sector…">
              <select value={`${sortBy}-${sortDir}`} aria-label="Sort"
                onChange={e => { const [k, d] = e.target.value.split('-'); setSortBy(k as SortKey); setSortDir(d as 'asc' | 'desc') }}
                className="wl-input max-w-[44%]" style={{ background: '#fff', width: 'auto', height: 36 }}>
                <option value="return-desc">Returns ↓</option>
                <option value="return-asc">Returns ↑</option>
                <option value="value-desc">Value ↓</option>
                <option value="invested-desc">Invested ↓</option>
                <option value="price-desc">Price ↓</option>
                <option value="name-asc">Name A–Z</option>
              </select>
            </ListSearch>
          </div>
          <div className="overflow-x-auto hidden md:block">
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ background: '#FAFAFE', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
                  {([
                    ['name',     'Stock',         '260px', 'left'  ],
                    ['price',    'Price',         '110px', 'right' ],
                    ['return',   'Return',        '110px', 'right' ],
                    ['invested', 'Invested',      '100px', 'right' ],
                    ['value',    'Current Value', '110px', 'right' ],
                    [null,       'Qty',           '70px',  'right' ],
                    [null,       'Actions',       '100px', 'center'],
                  ] as const).map(([key, label, w, align]) => (
                    <th key={label} className="px-4 py-2 font-semibold"
                      style={{ minWidth: w, textAlign: align, color: 'var(--text4)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.05em', cursor: key ? 'pointer' : 'default' }}
                      onClick={() => key && toggleSort(key as SortKey)}>
                      <span className="flex items-center gap-1"
                        style={{ justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start' }}>
                        {label}
                        {key && <ArrowUpDown size={9} style={{ opacity: sortBy === key ? 1 : 0.3 }} />}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((s, idx) => {
                  const price     = livePrices[s.id] ?? Number(s.current_price ?? s.avg_buy_price)
                  const invested  = Number(s.quantity) * Number(s.avg_buy_price)
                  const currVal   = Number(s.quantity) * price
                  const retPct    = getReturn(s, livePrices)
                  const absRt     = currVal - invested
                  const todayChg  = priceChange[s.id]
                  const hasLive   = !!livePrices[s.id]
                  const retColor  = retPct >= 0 ? 'var(--income)' : 'var(--rose)'
                  const sectorIdx = bySector.findIndex(b => b.sector === (s.sector || 'Other'))
                  const sColor    = SECTOR_COLORS[sectorIdx >= 0 ? sectorIdx % SECTOR_COLORS.length : 0]
                  const isExpanded = expandedId === s.id

                  return [
                    <tr key={s.id} className="transition-colors hover:bg-[#FAFAFE]"
                      style={{ borderBottom: isExpanded ? 'none' : '1px solid var(--track)', cursor: 'pointer' }}
                      onClick={() => setExpandedId(isExpanded ? null : s.id)}>

                      {/* Stock name */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="w-[34px] h-[34px] rounded-[10px] flex items-center justify-center flex-shrink-0 text-[14px] font-bold" style={{ background: sColor + '1A', color: sColor }}>{String(s.symbol).trim()[0]}</span>
                          <div>
                            <div className="font-bold" style={{ color: 'var(--text)', fontSize: 13 }}>{s.symbol}</div>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              <span className="text-[10px] truncate max-w-[140px]" style={{ color: 'var(--text3)' }}>{s.name}</span>
                              {s.sector && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                                  style={{ background: sColor + '18', color: sColor }}>
                                  {SECTOR_EMOJI[s.sector] ?? '🏭'} {s.sector}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Price */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center gap-1 justify-end">
                          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: hasLive ? '#10B981' : 'var(--text3)' }} />
                          <span className="tabular-nums font-bold" style={{ color: 'var(--text)' }}>
                            {priceLoading && !hasLive ? '…' : `₹${price.toFixed(2)}`}
                          </span>
                        </div>
                        {todayChg && (
                          <div className="text-[10px] tabular-nums flex items-center justify-end gap-0.5"
                            style={{ color: todayChg.changePct >= 0 ? 'var(--income)' : 'var(--rose)' }}>
                            {todayChg.changePct >= 0 ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
                            {todayChg.changePct >= 0 ? '+' : ''}{todayChg.changePct.toFixed(2)}%
                          </div>
                        )}
                      </td>

                      {/* Return */}
                      <td className="px-4 py-3 text-right">
                        <div className="font-bold tabular-nums" style={{ color: retColor, fontSize: 13 }}>
                          {retPct >= 0 ? '+' : ''}{retPct.toFixed(2)}%
                        </div>
                        <div className="text-[10px] tabular-nums" style={{ color: retColor }}>
                          {absRt >= 0 ? '+' : ''}₹{Math.abs(Math.round(absRt)).toLocaleString('en-IN')}
                        </div>
                      </td>

                      {/* Invested */}
                      <td className="px-4 py-3 text-right tabular-nums font-semibold" style={{ color: 'var(--text2)' }}>
                        {fmt(invested)}
                        <div className="text-[10px]" style={{ color: 'var(--text3)' }}>@ ₹{Number(s.avg_buy_price).toFixed(2)}</div>
                      </td>

                      {/* Current value */}
                      <td className="px-4 py-3 text-right">
                        <div className="tabular-nums font-bold" style={{ color: retColor, fontSize: 13 }}>{fmt(currVal)}</div>
                        <div className="text-[10px] mt-0.5" style={{ color: 'var(--text3)' }}>
                          {(currentValue > 0 ? currVal / currentValue * 100 : 0).toFixed(1)}% of portfolio
                        </div>
                        <div className="h-1.5 mt-1 rounded-full overflow-hidden" style={{ background: 'var(--bg2)' }}>
                          <div className="h-full rounded-full" style={{ width: `${currentValue > 0 ? Math.min(100, currVal / currentValue * 100) : 0}%`, background: sColor }} />
                        </div>
                      </td>

                      {/* Qty */}
                      <td className="px-4 py-3 text-right tabular-nums text-[11px]" style={{ color: 'var(--text3)' }}>
                        {Number(s.quantity).toFixed(s.exchange === 'NSE' ? 0 : 3)}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => setAddLots(s)} className="wl-btn wl-btn-sm" style={{ color: 'var(--accent2)', borderColor: 'var(--accent-border)', background: 'var(--accent-bg)' }}>+ Buy</button>
                          <div style={{ color: 'var(--text3)' }}>
                            {isExpanded ? <ArrowUpDown size={12} /> : <ArrowUpDown size={12} style={{ opacity: 0.3 }} />}
                          </div>
                        </div>
                      </td>
                    </tr>,

                    isExpanded && (
                      <tr key={`${s.id}-detail`} style={{ background: '#FAFAFE', borderBottom: '1px solid var(--track)' }}>
                        <td colSpan={7} className="px-6 py-4">
                          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            {[
                              ['Symbol',      s.symbol],
                              ['Exchange',    s.exchange || 'NSE'],
                              ['Sector',      s.sector || '—'],
                              ['Avg Buy Price', `₹${Number(s.avg_buy_price).toFixed(2)}`],
                              ['Live Price',  `₹${price.toFixed(2)}${hasLive ? ' ●' : ' (stored)'}`],
                              ['Price Change', todayChg ? `${todayChg.changePct >= 0 ? '+' : ''}${todayChg.changePct.toFixed(2)}% today` : '—'],
                              ['Quantity',    Number(s.quantity).toFixed(0)],
                              ['Return',      `${retPct >= 0 ? '+' : ''}${retPct.toFixed(2)}%`],
                            ].map(([l, v]) => (
                              <div key={l}>
                                <div className="text-[10px]" style={{ color: 'var(--text3)' }}>{l}</div>
                                <div className="text-[12px] font-semibold" style={{ color: 'var(--text)' }}>{v}</div>
                              </div>
                            ))}
                          </div>
                          {/* Purchase history — initial holding + dated buy lots */}
                          {(() => {
                            const lots = txnsByStock[s.id] ?? []
                            const recorded = lots.reduce((a: number, t: any) => a + Number(t.units || 0), 0)
                            const opening = Number(s.quantity || 0) - recorded
                            if (lots.length === 0 && opening <= 0.001) return null
                            // Opening shares' true cost = total invested − recorded lots' cost
                            const lotsInvested = lots.reduce((a: number, t: any) => a + Number(t.amount || 0), 0)
                            const openingInvested = Math.max(0, Number(s.quantity || 0) * Number(s.avg_buy_price || 0) - lotsInvested)
                            const openingPrice = opening > 0.001 ? openingInvested / opening : 0
                            return (
                              <div className="mt-4">
                                <div className="text-[11px] font-medium mb-2" style={{ color: 'var(--text3)' }}>Purchase History</div>
                                <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                                  {opening > 0.001 && (
                                    <div className="flex items-center justify-between text-[11px] rounded-lg px-3 py-1.5" style={{ background: 'var(--card)', border: '1px dashed var(--border2)' }}>
                                      <div style={{ color: 'var(--text3)' }}>Initial holding · <span className="tabular-nums">{+opening.toFixed(3)}</span> sh @ ₹{openingPrice.toFixed(2)}</div>
                                      <div className="tabular-nums font-semibold" style={{ color: 'var(--text)' }}>₹{Math.round(openingInvested).toLocaleString('en-IN')}</div>
                                    </div>
                                  )}
                                  {lots.map((t: any, i: number) => (
                                    <div key={t.id ?? i} className="flex items-center gap-2 text-[11px] rounded-lg px-3 py-1.5" style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
                                      <div className="flex-1" style={{ color: 'var(--text2)' }}>{t.txn_date} · <span className="tabular-nums">{Number(t.units)}</span> sh @ ₹{Number(t.nav).toFixed(2)}</div>
                                      <div className="tabular-nums font-semibold" style={{ color: 'var(--text)' }}>₹{Math.round(Number(t.amount)).toLocaleString('en-IN')}</div>
                                      <button onClick={() => setEditLot({ stock: s, lot: t })} className="p-1 rounded hover:bg-blue-50" style={{ color: 'var(--blue)' }} aria-label="Edit purchase"><Pencil size={11} /></button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )
                          })()}
                          <div className="mt-4 flex gap-2">
                            <button onClick={() => setAddLots(s)} className="wl-btn wl-btn-primary" style={{ height: 34 }}><IndianRupee size={13} />Buy more</button>
                            <button onClick={() => setEditStock(s)} className="wl-btn" style={{ height: 34, background: '#fff' }}><Pencil size={13} />Edit</button>
                            <button onClick={() => setDeleteStock(s)} className="wl-btn" style={{ height: 34, background: '#fff', color: '#DC2626' }}><Trash2 size={13} />Delete</button>
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
            {visible.map(s => {
              const price     = livePrices[s.id] ?? Number(s.current_price ?? s.avg_buy_price)
              const invested  = Number(s.quantity) * Number(s.avg_buy_price)
              const currVal   = Number(s.quantity) * price
              const retPct    = getReturn(s, livePrices)
              const absRt     = currVal - invested
              const todayChg  = priceChange[s.id]
              const hasLive   = !!livePrices[s.id]
              const retColor  = retPct >= 0 ? 'var(--income)' : 'var(--rose)'
              const sectorIdx = bySector.findIndex(b => b.sector === (s.sector || 'Other'))
              const sColor    = SECTOR_COLORS[sectorIdx >= 0 ? sectorIdx % SECTOR_COLORS.length : 0]
              const isExpanded = expandedId === s.id
              const weight    = currentValue > 0 ? currVal / currentValue * 100 : 0
              return (
                <div key={s.id} className="py-3">
                  <div className="flex items-center gap-3 px-4 active:bg-[#FAFAFE]" role="button" aria-expanded={isExpanded}
                    onClick={() => setExpandedId(isExpanded ? null : s.id)}>
                    <span className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0 text-[14px] font-bold" style={{ background: sColor + '1A', color: sColor }}>{String(s.symbol).trim()[0]}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-[13.5px] truncate" style={{ color: 'var(--text)' }}>{s.symbol} <span className="font-normal text-[12px]" style={{ color: 'var(--text3)' }}>{s.name}</span></div>
                      <div className="text-[11.5px] truncate flex items-center gap-1" style={{ color: 'var(--text3)' }}>
                        {s.sector && <><span className="font-medium" style={{ color: sColor }}>{s.sector}</span><span>·</span></>}
                        <span className="font-semibold" style={{ color: retColor }}>{retPct >= 0 ? '+' : ''}{retPct.toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-[13.5px] font-semibold tabular-nums" style={{ color: 'var(--text)' }}>{fmt(currVal)}</div>
                      <div className="text-[11px] tabular-nums" style={{ color: 'var(--text4)' }}>{weight.toFixed(1)}% · ₹{price.toFixed(2)}</div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-2.5 mx-4 mb-1 rounded-2xl p-3 flex flex-col gap-3" style={{ background: 'var(--canvas)', border: '1px solid var(--line)' }}>
                      <div className="grid grid-cols-3 gap-2">
                        {([
                          ['Shares', Number(s.quantity).toFixed(s.exchange === 'NSE' ? 0 : 3)],
                          ['Avg buy', `₹${Number(s.avg_buy_price).toFixed(2)}`],
                          ['Price now', `₹${price.toFixed(2)}`],
                          ['Gain', `${absRt >= 0 ? '+' : '−'}${fmt(Math.abs(absRt))}`],
                          ['Today', todayChg ? `${todayChg.changePct >= 0 ? '+' : ''}${todayChg.changePct.toFixed(2)}%` : '—'],
                          ['Exchange', `${s.exchange || 'NSE'}${hasLive ? ' · live' : ''}`],
                        ] as [string, string][]).map(([l, v]) => (
                          <div key={l} className="rounded-xl px-2.5 py-2 min-w-0" style={{ background: '#fff', border: '1px solid var(--line)' }}>
                            <div className="text-[11px]" style={{ color: 'var(--text4)' }}>{l}</div>
                            <div className="text-[12.5px] font-semibold tabular-nums truncate"
                              style={{ color: l === 'Gain' ? (absRt >= 0 ? '#16A34A' : '#DC2626') : l === 'Today' && todayChg ? (todayChg.changePct >= 0 ? '#16A34A' : '#DC2626') : 'var(--text)' }}>{v}</div>
                          </div>
                        ))}
                      </div>
                      {(() => {
                        const lots = txnsByStock[s.id] ?? []
                        const recorded = lots.reduce((a: number, t: any) => a + Number(t.units || 0), 0)
                        const opening = Number(s.quantity || 0) - recorded
                        if (lots.length === 0 && opening <= 0.001) return null
                        const lotsInvested = lots.reduce((a: number, t: any) => a + Number(t.amount || 0), 0)
                        const openingInvested = Math.max(0, Number(s.quantity || 0) * Number(s.avg_buy_price || 0) - lotsInvested)
                        const openingPrice = opening > 0.001 ? openingInvested / opening : 0
                        const dt = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                        return (
                          <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid var(--line)' }}>
                            <div className="px-3 py-2 text-[12.5px] font-semibold" style={{ color: 'var(--text)', borderBottom: '1px solid var(--line)' }}>Purchases</div>
                            <div className="max-h-52 overflow-y-auto">
                              {opening > 0.001 && (
                                <div className="flex items-center gap-2 px-3 py-2">
                                  <div className="flex-1 min-w-0 text-[12px]" style={{ color: 'var(--text3)' }}>Opening holding · {+opening.toFixed(3)} shares at ₹{openingPrice.toFixed(2)}</div>
                                  <div className="text-[12.5px] font-semibold tabular-nums" style={{ color: 'var(--text)' }}>₹{Math.round(openingInvested).toLocaleString('en-IN')}</div>
                                </div>
                              )}
                              {lots.map((t: any, i: number) => (
                                <div key={t.id ?? i} className="flex items-center gap-2 px-3 py-2" style={{ borderTop: i || opening > 0.001 ? '1px solid var(--track)' : undefined }}>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-[12.5px] font-medium" style={{ color: 'var(--text)' }}>{dt(t.txn_date)}</div>
                                    <div className="text-[11.5px] tabular-nums" style={{ color: 'var(--text3)' }}>{Number(t.units)} shares at ₹{Number(t.nav).toFixed(2)}</div>
                                  </div>
                                  <div className="text-[12.5px] font-semibold tabular-nums" style={{ color: 'var(--text)' }}>₹{Math.round(Number(t.amount)).toLocaleString('en-IN')}</div>
                                  <button onClick={() => setEditLot({ stock: s, lot: t })} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ color: 'var(--text3)' }} aria-label="Edit purchase"><Pencil size={13} /></button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })()}
                      <div className="grid grid-cols-3 gap-2">
                        <button onClick={() => setAddLots(s)} className="wl-btn wl-btn-primary justify-center" style={{ height: 40 }}><IndianRupee size={14} />Buy</button>
                        <button onClick={() => setEditStock(s)} className="wl-btn justify-center" style={{ height: 40, background: '#fff' }}><Pencil size={14} />Edit</button>
                        <button onClick={() => setDeleteStock(s)} className="wl-btn justify-center" style={{ height: 40, background: '#fff', color: '#DC2626' }}><Trash2 size={14} />Delete</button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
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
      {tab === 'news' && (
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
