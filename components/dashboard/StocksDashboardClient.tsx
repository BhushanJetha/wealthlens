'use client'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList,
} from 'recharts'
import {
  RefreshCw, Plus, TrendingUp, TrendingDown, X,
  Newspaper, BarChart2, ListFilter, ArrowUpDown, IndianRupee, FileUp, Pencil, Trash2, GraduationCap, ChevronDown,
} from 'lucide-react'
import Link from 'next/link'
import AddInvestmentModal from '@/components/forms/AddInvestmentModal'
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
const SECTOR_COLORS = ['#3D7A58','#3B7DD8','#D4920A','#C96A3A','#7C5CBF','#2E7D52','#B45309','#0891B2','#6D28D9']

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
  const [showAdd, setShowAdd]         = useState(false)
  const [showImport, setShowImport]   = useState(false)
  const [txnsByStock, setTxnsByStock] = useState<Record<string, any[]>>({})
  const [allStockTxns, setAllStockTxns] = useState<any[]>([])
  const [editStock, setEditStock]     = useState<any | null>(null)
  const [deleteStock, setDeleteStock] = useState<any | null>(null)
  const [deleting, setDeleting]       = useState(false)
  const [lumpsumStock, setLumpsumStock] = useState<any | null>(null)
  const [lumpsumQty, setLumpsumQty]   = useState('')
  const [lumpsumPrice, setLumpsumPrice] = useState('')
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

  // ── investment transaction history ─────────────────────────────────────
  useEffect(() => {
    (async () => {
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
    })()
  }, []) // eslint-disable-line

  async function confirmDelete() {
    if (!deleteStock) return
    setDeleting(true)
    await supabase.from('investment_transactions').delete().eq('asset_id', deleteStock.id).then(() => {}, () => {})
    const { error } = await supabase.from('stocks').delete().eq('id', deleteStock.id)
    if (!error) setStocks(prev => prev.filter(x => x.id !== deleteStock.id))
    setDeleting(false); setDeleteStock(null); router.refresh()
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
      const ds = new Date().toISOString().slice(0, 10)
      await Promise.all([
        supabase.from('stocks').update({ quantity: newQty, avg_buy_price: newAvg }).eq('id', lumpsumStock.id),
        supabase.from('transactions').insert({ user_id: user.id, txn_date: ds, merchant: lumpsumStock.name ?? lumpsumStock.symbol, description: `Buy ${addQty} shares of ${lumpsumStock.symbol} @ ₹${addPrice}`, category: 'Investment', sub_category: 'Stock Purchase', amount: addQty * addPrice, currency: lumpsumStock.currency ?? 'INR', country: lumpsumStock.country ?? 'India', txn_type: 'expense', source: 'manual' }),
        supabase.from('investment_transactions').insert({ user_id: user.id, asset_type: 'stock', asset_id: lumpsumStock.id, asset_name: lumpsumStock.symbol, txn_date: ds, txn_type: 'purchase', amount: addQty * addPrice, units: addQty, nav: addPrice, currency: lumpsumStock.currency ?? 'INR', source: 'buy_action' }).then(() => {}, () => {}),
      ])
      setStocks(prev => prev.map(s => s.id === lumpsumStock.id ? { ...s, quantity: newQty, avg_buy_price: newAvg } : s))
    }
    setLumpsumStock(null); setLumpsumQty(''); setLumpsumPrice(''); setLumpsumSaving(false); router.refresh()
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
          style={{ borderColor: 'var(--border)', color: 'var(--text3)', background: 'var(--bg2)' }}>
          <FileUp size={14} className="inline mr-1.5" /> Import from PDF
        </button>
      </div>
      {showAdd && <AddInvestmentModal onClose={() => { setShowAdd(false); router.refresh() }} defaultType="stock" />}
      {showImport && <HoldingsUploadModal kind="stocks" onClose={() => { setShowImport(false); router.refresh() }} />}
    </div>
  )

  const Overlay = ({ children }: { children: React.ReactNode }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>{children}</div>
  )

  return (
    <div className="space-y-4 animate-fade-up">

      {/* Lumpsum modal */}
      {lumpsumStock && (
        <Overlay>
          <div className="rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between">
              <div className="text-[15px] font-bold" style={{ color: 'var(--text)' }}>Buy More Shares</div>
              <button onClick={() => { setLumpsumStock(null); setLumpsumQty(''); setLumpsumPrice('') }} style={{ color: 'var(--text3)' }}><X size={16} /></button>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-[14px] font-bold" style={{ color: 'var(--text)' }}>{lumpsumStock.symbol}</div>
              <div className="text-[11px] px-2 py-0.5 rounded" style={{ background: 'var(--bg2)', color: 'var(--text3)' }}>{lumpsumStock.name}</div>
            </div>
            <div className="p-3 rounded-xl" style={{ background: 'var(--bg2)' }}>
              <div className="text-[10px]" style={{ color: 'var(--text3)' }}>Current Price</div>
              <div className="text-[20px] font-bold font-mono" style={{ color: 'var(--text)' }}>
                ₹{(livePrices[lumpsumStock.id] ?? Number(lumpsumStock.current_price ?? lumpsumStock.avg_buy_price)).toFixed(2)}
                {livePrices[lumpsumStock.id] && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ background: '#D1FAE5', color: '#065F46' }}>Live</span>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text3)' }}>Shares to Buy</label>
                <input type="number" value={lumpsumQty} onChange={e => setLumpsumQty(e.target.value)} placeholder="10" className="wl-input mt-1 w-full" style={{ background: 'var(--bg2)' }} />
              </div>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--text3)' }}>Price per Share (₹)</label>
                <input type="number" value={lumpsumPrice} onChange={e => setLumpsumPrice(e.target.value)}
                  placeholder={(livePrices[lumpsumStock.id] ?? Number(lumpsumStock.current_price ?? lumpsumStock.avg_buy_price)).toFixed(2)}
                  className="wl-input mt-1 w-full" style={{ background: 'var(--bg2)' }} />
              </div>
            </div>
            {lumpsumQty && lumpsumPrice && (
              <div className="p-3 rounded-xl" style={{ background: 'var(--sage-bg)' }}>
                <div className="text-[11px]" style={{ color: 'var(--text3)' }}>Total Cost</div>
                <div className="text-[18px] font-bold font-mono" style={{ color: 'var(--sage)' }}>
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
              <button onClick={() => { setLumpsumStock(null); setLumpsumQty(''); setLumpsumPrice('') }}
                className="flex-1 py-2.5 rounded-xl border text-[12px] font-semibold"
                style={{ borderColor: 'var(--border)', color: 'var(--text3)', background: 'var(--bg2)' }}>Cancel</button>
              <button onClick={saveLumpsum} disabled={lumpsumSaving || !lumpsumQty || !lumpsumPrice}
                className="flex-1 py-2.5 rounded-xl text-white text-[12px] font-bold"
                style={{ background: 'var(--sage)', opacity: (!lumpsumQty || !lumpsumPrice) ? 0.5 : 1 }}>
                {lumpsumSaving ? 'Saving…' : 'Buy Shares'}
              </button>
            </div>
          </div>
        </Overlay>
      )}

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Stock Portfolio</h1>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--text3)' }}>
            {priceLoading ? 'Fetching live prices…' : lastUpdated ? `Prices updated ${lastUpdated.toLocaleTimeString()}` : 'NSE · Live prices'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchLivePrices} disabled={priceLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border"
            style={{ borderColor: 'var(--border)', color: 'var(--text3)', background: 'var(--bg2)' }}>
            <RefreshCw size={11} className={priceLoading ? 'animate-spin' : ''} /> {priceLoading ? 'Updating…' : 'Refresh Prices'}
          </button>
          <Link href="/dashboard/learn"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border"
            style={{ borderColor: 'var(--sage)', color: 'var(--sage)', background: 'var(--sage-bg)' }}>
            <GraduationCap size={12} /> Learn
          </Link>
          <button onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border"
            style={{ borderColor: 'var(--border)', color: 'var(--text3)', background: 'var(--bg2)' }}>
            <FileUp size={12} /> Import PDF
          </button>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-[12px] font-bold"
            style={{ background: 'var(--sage)' }}>
            <Plus size={13} /> Add Stock
          </button>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'Invested',        value: fmt(totalInvested),                                          accent: '#6B7280' },
          { label: 'Current Value',   value: fmt(currentValue),                                           accent: absRet >= 0 ? '#3D7A58' : '#E11D48' },
          { label: 'Total Return',    value: `${totalRet >= 0 ? '+' : ''}${totalRet.toFixed(2)}%`,       accent: totalRet >= 0 ? '#3D7A58' : '#E11D48' },
          { label: 'Gain / Loss',     value: `${absRet >= 0 ? '+' : ''}${fmt(Math.abs(absRet))}`,       accent: absRet >= 0 ? '#3D7A58' : '#E11D48' },
          { label: 'Portfolio Health', value: `${health.score}/100`,                                      accent: health.score >= 75 ? '#3D7A58' : health.score >= 50 ? '#D4920A' : '#E11D48' },
        ].map(k => (
          <div key={k.label} className="wl-card px-4 py-3" style={{ borderLeft: `3px solid ${k.accent}` }}>
            <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text3)' }}>{k.label}</div>
            <div className="text-[18px] font-bold font-mono mt-0.5" style={{ color: k.accent }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--bg2)', width: 'fit-content' }}>
        {([['portfolio', 'Portfolio', ListFilter], ['analytics', 'Analytics', BarChart2], ['growth', 'Growth', TrendingUp], ['news', 'News', Newspaper]] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key as Tab)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-semibold transition-all"
            style={tab === key
              ? { background: 'var(--card)', color: 'var(--sage)', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }
              : { color: 'var(--text3)' }}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {/* ── PORTFOLIO TAB ─────────────────────────────────────────────────────── */}
      {tab === 'portfolio' && (
        <div className="wl-card overflow-hidden">
          <div className="overflow-x-auto hidden md:block">
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
                  {([
                    ['name',     'Stock',         '260px', 'left'  ],
                    ['price',    'Price',         '110px', 'right' ],
                    ['return',   'Return',        '110px', 'right' ],
                    ['invested', 'Invested',      '100px', 'right' ],
                    ['value',    'Current Value', '110px', 'right' ],
                    [null,       'Qty',           '70px',  'right' ],
                    [null,       'Actions',       '100px', 'center'],
                  ] as const).map(([key, label, w, align]) => (
                    <th key={label} className="px-4 py-3 font-semibold"
                      style={{ minWidth: w, textAlign: align, color: 'var(--text3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', cursor: key ? 'pointer' : 'default' }}
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
                {sorted.map((s, idx) => {
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
                    <tr key={s.id}
                      style={{ borderBottom: isExpanded ? 'none' : '1px solid var(--border)', background: idx % 2 === 0 ? 'transparent' : 'var(--bg2)11', cursor: 'pointer' }}
                      onClick={() => setExpandedId(isExpanded ? null : s.id)}>

                      {/* Stock name */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-1 h-10 rounded-full flex-shrink-0" style={{ background: sColor }} />
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
                          <span className="font-mono font-bold" style={{ color: 'var(--text)' }}>
                            {priceLoading && !hasLive ? '…' : `₹${price.toFixed(2)}`}
                          </span>
                        </div>
                        {todayChg && (
                          <div className="text-[10px] font-mono flex items-center justify-end gap-0.5"
                            style={{ color: todayChg.changePct >= 0 ? 'var(--income)' : 'var(--rose)' }}>
                            {todayChg.changePct >= 0 ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
                            {todayChg.changePct >= 0 ? '+' : ''}{todayChg.changePct.toFixed(2)}%
                          </div>
                        )}
                      </td>

                      {/* Return */}
                      <td className="px-4 py-3 text-right">
                        <div className="font-bold font-mono" style={{ color: retColor, fontSize: 13 }}>
                          {retPct >= 0 ? '+' : ''}{retPct.toFixed(2)}%
                        </div>
                        <div className="text-[10px] font-mono" style={{ color: retColor }}>
                          {absRt >= 0 ? '+' : ''}₹{Math.abs(Math.round(absRt)).toLocaleString('en-IN')}
                        </div>
                      </td>

                      {/* Invested */}
                      <td className="px-4 py-3 text-right font-mono font-semibold" style={{ color: 'var(--text2)' }}>
                        {fmt(invested)}
                        <div className="text-[10px]" style={{ color: 'var(--text3)' }}>@ ₹{Number(s.avg_buy_price).toFixed(2)}</div>
                      </td>

                      {/* Current value */}
                      <td className="px-4 py-3 text-right">
                        <div className="font-mono font-bold" style={{ color: retColor, fontSize: 13 }}>{fmt(currVal)}</div>
                        <div className="text-[10px] mt-0.5" style={{ color: 'var(--text3)' }}>
                          {(currentValue > 0 ? currVal / currentValue * 100 : 0).toFixed(1)}% of portfolio
                        </div>
                        <div className="h-1.5 mt-1 rounded-full overflow-hidden" style={{ background: 'var(--bg2)' }}>
                          <div className="h-full rounded-full" style={{ width: `${currentValue > 0 ? Math.min(100, currVal / currentValue * 100) : 0}%`, background: sColor }} />
                        </div>
                      </td>

                      {/* Qty */}
                      <td className="px-4 py-3 text-right font-mono text-[11px]" style={{ color: 'var(--text3)' }}>
                        {Number(s.quantity).toFixed(s.exchange === 'NSE' ? 0 : 3)}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => { setLumpsumStock(s); setLumpsumQty(''); setLumpsumPrice(String((livePrices[s.id] ?? Number(s.current_price ?? s.avg_buy_price)).toFixed(2))) }}
                            className="px-2.5 py-1 rounded text-[10px] font-semibold border transition-all hover:shadow-sm"
                            style={{ borderColor: 'var(--sage)', color: 'var(--sage)', background: 'var(--sage-bg)' }}>
                            + Buy
                          </button>
                          <div style={{ color: 'var(--text3)' }}>
                            {isExpanded ? <ArrowUpDown size={12} /> : <ArrowUpDown size={12} style={{ opacity: 0.3 }} />}
                          </div>
                        </div>
                      </td>
                    </tr>,

                    isExpanded && (
                      <tr key={`${s.id}-detail`} style={{ background: 'var(--bg2)40', borderBottom: '1px solid var(--border)' }}>
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
                          <div className="mt-4 flex gap-2">
                            <button onClick={() => { setLumpsumStock(s); setLumpsumQty(''); setLumpsumPrice(String(price.toFixed(2))) }}
                              className="text-[11px] font-semibold px-4 py-1.5 rounded-lg border"
                              style={{ borderColor: 'var(--sage)', color: 'var(--sage)', background: 'var(--sage-bg)' }}>
                              <IndianRupee size={10} className="inline mr-1" /> Buy More Shares
                            </button>
                            <button onClick={() => setEditStock(s)}
                              className="text-[11px] font-semibold px-4 py-1.5 rounded-lg border"
                              style={{ borderColor: 'var(--border)', color: 'var(--text3)', background: 'var(--bg2)' }}>
                              <Pencil size={10} className="inline mr-1" /> Edit
                            </button>
                            <button onClick={() => setDeleteStock(s)}
                              className="text-[11px] font-semibold px-4 py-1.5 rounded-lg border"
                              style={{ borderColor: 'var(--rose)', color: 'var(--rose)', background: 'transparent' }}>
                              <Trash2 size={10} className="inline mr-1" /> Delete
                            </button>
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
          <div className="md:hidden divide-y" style={{ borderColor: 'var(--border)' }}>
            {sorted.map(s => {
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
                  <div className="flex items-start gap-2.5 active:opacity-70"
                    onClick={() => setExpandedId(isExpanded ? null : s.id)}>
                    <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ background: sColor, minHeight: 42 }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-bold text-[13px] leading-snug" style={{ color: 'var(--text)' }}>{s.symbol}</div>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <span className="text-[10px] truncate max-w-[150px]" style={{ color: 'var(--text3)' }}>{s.name}</span>
                            {s.sector && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold" style={{ background: sColor + '18', color: sColor }}>
                                {SECTOR_EMOJI[s.sector] ?? '🏭'} {s.sector}
                              </span>
                            )}
                          </div>
                        </div>
                        <ChevronDown size={16} className={`transition-transform flex-shrink-0 mt-0.5 ${isExpanded ? 'rotate-180' : ''}`} style={{ color: 'var(--text3)' }} />
                      </div>
                      <div className="flex items-end justify-between gap-2 mt-2">
                        <div>
                          <div className="text-[9px]" style={{ color: 'var(--text3)' }}>Current</div>
                          <div className="font-mono font-bold text-[14px]" style={{ color: retColor }}>{fmt(currVal)}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[9px]" style={{ color: 'var(--text3)' }}>Return</div>
                          <div className="font-mono font-bold text-[13px]" style={{ color: retColor }}>{retPct >= 0 ? '+' : ''}{retPct.toFixed(2)}%</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[9px]" style={{ color: 'var(--text3)' }}>Price</div>
                          <div className="font-mono font-semibold text-[12px] flex items-center gap-1 justify-end" style={{ color: 'var(--text)' }}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: hasLive ? '#10B981' : 'var(--text3)' }} />₹{price.toFixed(2)}
                          </div>
                          {todayChg && (
                            <div className="text-[9px] font-mono" style={{ color: todayChg.changePct >= 0 ? 'var(--income)' : 'var(--rose)' }}>
                              {todayChg.changePct >= 0 ? '+' : ''}{todayChg.changePct.toFixed(2)}% today
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="mt-2">
                        <div className="flex items-center justify-between text-[9px] mb-0.5" style={{ color: 'var(--text3)' }}>
                          <span>{fmt(invested)} @ ₹{Number(s.avg_buy_price).toFixed(2)}</span><span>{weight.toFixed(1)}% of portfolio</span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg2)' }}>
                          <div className="h-full rounded-full" style={{ width: `${Math.min(100, weight)}%`, background: sColor }} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 rounded-xl p-3 space-y-3" style={{ background: 'var(--bg2)' }}>
                      <div className="grid grid-cols-3 gap-y-2 gap-x-2">
                        {([
                          ['Qty', Number(s.quantity).toFixed(s.exchange === 'NSE' ? 0 : 3)],
                          ['Exchange', s.exchange || 'NSE'],
                          ['Sector', s.sector || '—'],
                          ['Avg Buy', `₹${Number(s.avg_buy_price).toFixed(2)}`],
                          ['Abs P/L', `${absRt >= 0 ? '+' : ''}₹${Math.abs(Math.round(absRt)).toLocaleString('en-IN')}`],
                          ['Live', hasLive ? 'Live ●' : 'Stored'],
                        ] as [string, string][]).map(([l, v]) => (
                          <div key={l}>
                            <div className="text-[9px]" style={{ color: 'var(--text3)' }}>{l}</div>
                            <div className="text-[11px] font-semibold truncate" style={{ color: 'var(--text)' }}>{v}</div>
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <button onClick={() => { setLumpsumStock(s); setLumpsumQty(''); setLumpsumPrice(String(price.toFixed(2))) }}
                          className="wl-tap flex items-center justify-center gap-1 px-2 rounded-lg border text-[11px] font-semibold"
                          style={{ borderColor: 'var(--sage)', color: 'var(--sage)', background: 'var(--sage-bg)' }}>
                          <IndianRupee size={11} /> Buy
                        </button>
                        <button onClick={() => setEditStock(s)}
                          className="wl-tap flex items-center justify-center gap-1 px-2 rounded-lg border text-[11px] font-semibold"
                          style={{ borderColor: 'var(--border)', color: 'var(--text2)', background: 'var(--bg2)' }}>
                          <Pencil size={11} /> Edit
                        </button>
                        <button onClick={() => setDeleteStock(s)}
                          className="wl-tap flex items-center justify-center gap-1 px-2 rounded-lg border text-[11px] font-semibold"
                          style={{ borderColor: 'var(--rose)', color: 'var(--rose)', background: 'transparent' }}>
                          <Trash2 size={11} /> Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── ANALYTICS TAB ─────────────────────────────────────────────────────── */}
      {tab === 'analytics' && (
        <div className="space-y-4">

          {/* Portfolio Health */}
          <div className="wl-card p-5">
            <div className="text-[11px] font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--text3)' }}>Portfolio Health</div>
            <div className="flex items-start gap-6 flex-wrap">
              <div className="text-center">
                <div className="text-[48px] font-bold font-mono" style={{ color: health.color }}>{health.score}</div>
                <div className="text-[12px] font-semibold mt-1" style={{ color: health.color }}>{health.label}</div>
                <div className="text-[10px] mt-0.5" style={{ color: 'var(--text3)' }}>out of 100</div>
              </div>
              <div className="flex-1 space-y-2 min-w-[200px]">
                {health.insights.map((ins, i) => (
                  <div key={i} className="flex items-start gap-2 text-[12px]">
                    <span>{ins.startsWith('✓') ? '✅' : '⚠️'}</span>
                    <span style={{ color: 'var(--text)' }}>{ins.replace(/^[✓⚠] /, '')}</span>
                  </div>
                ))}
                <div className="pt-2">
                  <div className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--bg2)' }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${health.score}%`, background: health.color }} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sector Exposure + HHI */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="wl-card p-5">
              <div className="text-[11px] font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--text3)' }}>Sector Exposure</div>
              {bySector.length === 0 ? (
                <div className="text-[12px]" style={{ color: 'var(--text3)' }}>Add sector info to your stocks for sector analysis</div>
              ) : (
                <div className="space-y-3">
                  {bySector.map(b => (
                    <div key={b.sector}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[12px] font-semibold" style={{ color: 'var(--text)' }}>{b.emoji} {b.sector}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-[11px] font-mono" style={{ color: 'var(--text2)' }}>{fmt(b.value)}</span>
                          <span className="text-[11px] font-bold" style={{ color: b.color }}>{b.pct}%</span>
                        </div>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg2)' }}>
                        <div className="h-full rounded-full" style={{ width: `${b.pct}%`, background: b.pct > 50 ? 'var(--rose)' : b.color }} />
                      </div>
                      {b.pct > 50 && <div className="text-[10px] mt-0.5" style={{ color: 'var(--rose)' }}>⚠ Over-concentrated in this sector</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="wl-card p-5">
              <div className="text-[11px] font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--text3)' }}>Concentration Risk</div>
              <div className="flex items-center gap-3 mb-4">
                <div className="text-[36px] font-bold font-mono" style={{ color: hhi < 0.15 ? 'var(--income)' : hhi < 0.25 ? 'var(--gold)' : 'var(--rose)' }}>
                  {hhi.toFixed(2)}
                </div>
                <div>
                  <div className="text-[12px] font-semibold" style={{ color: hhi < 0.15 ? 'var(--income)' : hhi < 0.25 ? 'var(--gold)' : 'var(--rose)' }}>
                    {hhi < 0.15 ? 'Well Diversified' : hhi < 0.25 ? 'Moderate' : 'Highly Concentrated'}
                  </div>
                  <div className="text-[10px]" style={{ color: 'var(--text3)' }}>Herfindahl Index (lower = better)</div>
                </div>
              </div>
              <div className="space-y-2">
                {[...stocks].sort((a, b) => {
                  const va = Number(a.quantity) * (livePrices[a.id] ?? Number(a.current_price ?? a.avg_buy_price))
                  const vb = Number(b.quantity) * (livePrices[b.id] ?? Number(b.current_price ?? b.avg_buy_price))
                  return vb - va
                }).slice(0, 5).map((s, i) => {
                  const val = Number(s.quantity) * (livePrices[s.id] ?? Number(s.current_price ?? s.avg_buy_price))
                  const pct = currentValue > 0 ? Math.round(val / currentValue * 100) : 0
                  return (
                    <div key={s.id} className="flex items-center gap-2">
                      <div className="text-[10px] w-4 text-center font-bold" style={{ color: 'var(--text3)' }}>{i+1}</div>
                      <div className="text-[11px] font-semibold flex-1" style={{ color: 'var(--text)' }}>{s.symbol}</div>
                      <div className="w-24">
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg2)' }}>
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: SECTOR_COLORS[i % SECTOR_COLORS.length] }} />
                        </div>
                      </div>
                      <div className="text-[11px] font-bold w-8 text-right" style={{ color: SECTOR_COLORS[i % SECTOR_COLORS.length] }}>{pct}%</div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Return comparison */}
          <div className="wl-card p-5">
            <div className="text-[11px] font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--text3)' }}>Return Comparison</div>
            <ResponsiveContainer width="100%" height={Math.max(120, stocks.length * 44)}>
              <BarChart layout="vertical"
                data={[...stocks].sort((a,b) => getReturn(b,livePrices) - getReturn(a,livePrices)).map(s => ({
                  name: s.symbol,
                  return: Math.round(getReturn(s, livePrices) * 10) / 10,
                }))}
                margin={{ left: 20, right: 55 }}>
                <XAxis type="number" tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11, fontWeight: 600 }} />
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <Tooltip formatter={(v: any) => [`${v}%`, 'Return']} />
                <Bar dataKey="return" radius={[0, 5, 5, 0]}>
                  {[...stocks].sort((a,b) => getReturn(b,livePrices) - getReturn(a,livePrices)).map((s, i) => (
                    <Cell key={i} fill={getReturn(s, livePrices) >= 0 ? 'var(--income)' : 'var(--rose)'} />
                  ))}
                  <LabelList dataKey="return" position="right" formatter={(v: any) => `${v>0?'+':''}${v}%`} style={{ fontSize: 10 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── NEWS TAB ──────────────────────────────────────────────────────────── */}
      {tab === 'news' && (
        <div className="wl-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Newspaper size={14} style={{ color: 'var(--sage)' }} />
            <div className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>Stock Market News</div>
          </div>
          {newsLoading ? (
            <div className="space-y-3">
              {[1,2,3,4,5].map(i => <div key={i} className="h-14 rounded-xl animate-pulse" style={{ background: 'var(--bg2)' }} />)}
            </div>
          ) : news.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-3xl mb-2">📰</div>
              <div className="text-[13px]" style={{ color: 'var(--text3)' }}>News feed unavailable. Try refreshing.</div>
            </div>
          ) : (
            <div className="space-y-2">
              {news.map((article, i) => (
                <a key={i} href={article.link} target="_blank" rel="noopener noreferrer"
                  className="flex items-start gap-4 p-4 rounded-xl transition-all hover:shadow-md block"
                  style={{ background: 'var(--bg2)', border: '1px solid var(--border)' }}>
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-[16px]"
                    style={{ background: '#3B7DD818' }}>📈</div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold leading-snug" style={{ color: 'var(--text)' }}>{article.title}</div>
                    <div className="text-[11px] mt-1" style={{ color: 'var(--text3)' }}>
                      {article.source} · {article.pubDate ? new Date(article.pubDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}
                    </div>
                  </div>
                  <TrendingUp size={14} style={{ color: '#3B7DD8', flexShrink: 0 }} />
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── GROWTH TAB (Month-on-Month / Year-on-Year) ────────────────────────── */}
      {tab === 'growth' && (
        <div className="space-y-4">
          <div className="wl-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={15} style={{ color: 'var(--sage)' }} />
              <div className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>Overall Stock Portfolio Growth</div>
            </div>
            <InvestmentTimeline txns={allStockTxns} invested={totalInvested} currentValue={currentValue} />
          </div>

          {allStockTxns.length === 0 && (
            <div className="wl-card p-4 text-[12px] flex items-start gap-2" style={{ color: 'var(--text3)' }}>
              <span>💡</span>
              <span>Month-on-month and year-on-year trends build up from your buy history. Use <strong>Buy More Shares</strong> and each purchase is recorded with its date.</span>
            </div>
          )}

          <div className="wl-card p-5">
            <div className="text-[13px] font-bold mb-3" style={{ color: 'var(--text)' }}>Invested per Year — by Stock</div>
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

      {showAdd && <AddInvestmentModal onClose={() => { setShowAdd(false); router.refresh() }} defaultType="stock" />}
      {showImport && <HoldingsUploadModal kind="stocks" onClose={() => { setShowImport(false); router.refresh() }} />}
      {editStock && <AddInvestmentModal editData={{ ...editStock, _type: 'stock' }} onClose={() => { setEditStock(null); router.refresh() }} />}
      {deleteStock && (
        <Overlay>
          <div className="rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between">
              <div className="text-[15px] font-bold" style={{ color: 'var(--text)' }}>Delete Stock?</div>
              <button onClick={() => setDeleteStock(null)} style={{ color: 'var(--text3)' }}><X size={16} /></button>
            </div>
            <div className="text-[12px]" style={{ color: 'var(--text2)' }}>
              Remove <strong style={{ color: 'var(--text)' }}>{deleteStock.symbol}</strong> and its recorded buy history? This can't be undone.
            </div>
            <div className="flex gap-2">
              <button onClick={() => setDeleteStock(null)} className="flex-1 py-2.5 rounded-xl border text-[12px] font-semibold" style={{ borderColor: 'var(--border)', color: 'var(--text3)', background: 'var(--bg2)' }}>Cancel</button>
              <button onClick={confirmDelete} disabled={deleting} className="flex-1 py-2.5 rounded-xl text-white text-[12px] font-bold" style={{ background: 'var(--rose)' }}>{deleting ? 'Deleting…' : 'Delete'}</button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  )
}
