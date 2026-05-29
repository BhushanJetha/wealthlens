'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import Link from 'next/link'
import {
  Target, TrendingUp, Shield, CheckCircle2, AlertTriangle, ChevronRight,
  Star, Zap, Heart, BookOpen, Award, Layers, PiggyBank, BarChart2, Globe, Clock,
} from 'lucide-react'

// ── Scroll animation helpers ──────────────────────────────────────────────────
function useInView(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect() } },
      { threshold }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold])
  return { ref, visible }
}

function FadeUp({ children, delay = 0, className = '' }: {
  children: React.ReactNode; delay?: number; className?: string
}) {
  const { ref, visible } = useInView()
  return (
    <div ref={ref} className={className} style={{
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(24px)',
      transition: `opacity 0.55s ease ${delay}ms, transform 0.55s ease ${delay}ms`,
    }}>
      {children}
    </div>
  )
}

function AnimBar({ pct, color, delay = 0 }: { pct: number; color: string; delay?: number }) {
  const { ref, visible } = useInView()
  return (
    <div ref={ref} className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--bg2)' }}>
      <div style={{
        height: '100%', borderRadius: 9999,
        width: visible ? `${Math.min(100, pct)}%` : '0%',
        background: color,
        transition: `width 0.9s ease ${delay}ms`,
      }} />
    </div>
  )
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface Props {
  stocks: any[]; mutualFunds: any[]; fixedDeposits: any[]; recurringDeposits: any[]
  npsAccounts: any[]; licPolicies: any[]; goldInvestments: any[]; bondInvestments: any[]
  etfInvestments: any[]; loans: any[]; transactions: any[]; goals: any[]; goalInvestments: any[]
}

interface HealthData {
  score: number
  pillars: { label: string; pts: number; max: number; desc: string; color: string; bg: string }[]
  equityVal: number; debtVal: number; totalCurr: number; numTypes: number
  fdVal: number; rdVal: number; savingsRate: number; goalCount: number
  linkedInvPct: number; avgMonthlyIncome: number; totalRet: number; licPaid: number
}

// ── Health score computation ───────────────────────────────────────────────────
function computeHealthData(p: Props): HealthData {
  const sum = (arr: any[], key: string) => arr.reduce((a, x) => a + (Number(x[key]) || 0), 0)

  const stockVal = sum(p.stocks, 'current_value')
  const mfVal    = sum(p.mutualFunds, 'current_value')
  const fdVal    = sum(p.fixedDeposits, 'principal_amount')
  const rdVal    = sum(p.recurringDeposits, 'monthly_installment') * 12
  const npsVal   = sum(p.npsAccounts, 'current_value')
  const goldVal  = sum(p.goldInvestments, 'current_value')
  const bondVal  = sum(p.bondInvestments, 'current_value')
  const etfVal   = sum(p.etfInvestments, 'current_value')
  const licPaid  = sum(p.licPolicies, 'annual_premium')

  const equityVal = stockVal + mfVal + etfVal + npsVal
  const debtVal   = fdVal + rdVal + bondVal
  const totalCurr = equityVal + debtVal + goldVal

  const numTypes = [stockVal, mfVal, fdVal, rdVal, npsVal, goldVal, bondVal, etfVal].filter(v => v > 0).length

  const incomes = p.transactions.filter((t: any) => t.txn_type === 'income')
  const avgMonthlyIncome = incomes.length
    ? incomes.reduce((a, t) => a + (Number(t.amount) || 0), 0) / Math.max(1, incomes.length)
    : 50000

  const savingsRate = avgMonthlyIncome > 0
    ? Math.min(100, Math.round((totalCurr / (avgMonthlyIncome * 12)) * 100)) : 0

  const goalCount   = p.goals.length
  const linkedIds   = new Set(p.goalInvestments.map((gi: any) => gi.investment_id))
  const allInvIds   = [
    ...p.stocks, ...p.mutualFunds, ...p.fixedDeposits, ...p.npsAccounts,
    ...p.goldInvestments, ...p.bondInvestments, ...p.etfInvestments,
  ].map((x: any) => x.id)
  const linkedInvPct = allInvIds.length > 0
    ? Math.round((allInvIds.filter(id => linkedIds.has(id)).length / allInvIds.length) * 100) : 0

  const mfRets = p.mutualFunds.map((m: any) => Number(m.returns_1yr) || 0).filter(Boolean)
  const totalRet = mfRets.length ? mfRets.reduce((a, b) => a + b, 0) / mfRets.length : 0

  const emergencyPts = Math.min(20, avgMonthlyIncome > 0
    ? Math.round(((fdVal + rdVal) / (avgMonthlyIncome * 6)) * 20) : 0)
  const diversityPts = Math.min(20, numTypes * 3)
  const goalPts      = Math.min(20, goalCount > 0 ? Math.round(linkedInvPct / 5) : 0)
  const returnPts    = totalRet >= 15 ? 20 : totalRet >= 10 ? 16 : totalRet >= 8 ? 12 : totalRet > 0 ? 8 : 4
  const savingsPts   = savingsRate >= 20 ? 20 : savingsRate >= 10 ? 14 : savingsRate >= 5 ? 8 : 4

  return {
    score: emergencyPts + diversityPts + goalPts + returnPts + savingsPts,
    pillars: [
      { label: 'Emergency Fund',  pts: emergencyPts, max: 20, desc: '6-month expenses in FD / RD', color: '#2563EB', bg: '#EFF6FF' },
      { label: 'Diversification', pts: diversityPts, max: 20, desc: 'Spread across asset classes', color: '#7C3AED', bg: '#F5F3FF' },
      { label: 'Goal Coverage',   pts: goalPts,      max: 20, desc: 'Investments linked to goals', color: '#16A34A', bg: '#F0FDF4' },
      { label: 'Return Quality',  pts: returnPts,    max: 20, desc: 'Avg MF 1-yr return benchmark', color: '#D97706', bg: '#FFFBEB' },
      { label: 'Savings Rate',    pts: savingsPts,   max: 20, desc: '% of annual income invested', color: '#E11D48', bg: '#FFF1F2' },
    ],
    equityVal, debtVal, totalCurr, numTypes, fdVal, rdVal, savingsRate,
    goalCount, linkedInvPct, avgMonthlyIncome, totalRet, licPaid,
  }
}

// ── Pyramid ───────────────────────────────────────────────────────────────────
const PYRAMID = [
  { level: 5, name: 'Legacy',      icon: Globe,      color: '#D97706', lightBg: '#FFFBEB',
    desc: 'Estate planning, wealth transfer, philanthropy',
    check: (d: HealthData) => d.numTypes >= 5 && d.totalCurr > 5_000_000 },
  { level: 4, name: 'Flexibility', icon: Zap,        color: '#7C3AED', lightBg: '#F5F3FF',
    desc: 'Multiple income streams, financial freedom',
    check: (d: HealthData) => d.goalCount > 0 && d.linkedInvPct > 40 },
  { level: 3, name: 'Growth',      icon: TrendingUp, color: '#16A34A', lightBg: '#F0FDF4',
    desc: 'Equity investments, wealth accumulation',
    check: (d: HealthData) => d.equityVal > 50_000 },
  { level: 2, name: 'Stability',   icon: Shield,     color: '#2563EB', lightBg: '#EFF6FF',
    desc: 'Emergency fund, insurance, debt-free lifestyle',
    check: (d: HealthData) => d.fdVal + d.rdVal > 30_000 },
  { level: 1, name: 'Foundation',  icon: PiggyBank,  color: '#6B7280', lightBg: '#F9FAFB',
    desc: 'Basic savings, life insurance, budgeting',
    check: (d: HealthData) => d.fdVal + d.rdVal > 0 || d.licPaid > 0 },
]

// ── Decades ───────────────────────────────────────────────────────────────────
const DECADES = [
  { label: '20s', phase: 'Build Foundation',      icon: '🌱', color: '#16A34A',
    goals: ['Start emergency fund (3–6 months)', 'Get health + term life insurance',
             'Begin SIP — even ₹500/mo matters',   'Pay off student loans aggressively'],
    milestone: 'Save your first ₹1 lakh',
    tip: 'Time is your biggest asset. Start now, even small.', widthPct: 20 },
  { label: '30s', phase: 'Accelerate Growth',     icon: '🌿', color: '#2563EB',
    goals: ['Increase SIP to 20% of income',  'Term cover = 10× annual income',
             'Goal-based investing (home, education)', 'Net worth target: 2× annual salary'],
    milestone: 'Net worth ≥ 2× annual salary',
    tip: 'Compound interest rewards patience. Stay invested.', widthPct: 40 },
  { label: '40s', phase: 'Maximise Accumulation', icon: '🌳', color: '#7C3AED',
    goals: ['60% equity, 40% debt allocation', 'Max NPS for retirement corpus',
             "Fund children's education goals", 'Net worth target: 5× annual salary'],
    milestone: 'Net worth ≥ 5× annual salary',
    tip: 'Peak earning years — maximise every rupee invested.', widthPct: 60 },
  { label: '50s', phase: 'Preserve & Shift',      icon: '🏡', color: '#D97706',
    goals: ['Gradually shift to 50:50 equity-debt', 'Pre-pay home loan if outstanding',
             'Retirement corpus = 25× annual expenses', 'Review and reduce insurance cover'],
    milestone: 'Retirement corpus = 25× annual expenses',
    tip: 'Preserve your gains. Reduce volatility risk gradually.', widthPct: 80 },
  { label: '60s', phase: 'Harvest & Legacy',      icon: '🌅', color: '#E11D48',
    goals: ['Set up systematic withdrawal plan (SWP)', 'Equity < 30%, Debt > 70%',
             'Write a Will and do estate planning',   'Senior Citizen FD / SCSS for income'],
    milestone: 'Sustainable income for 30+ years',
    tip: "Make your money work, so you don't have to.", widthPct: 100 },
]

// ── 10 Money Habits ───────────────────────────────────────────────────────────
const HABITS = [
  { icon: '📊', title: 'Track Every Rupee',        desc: 'Know where your money goes before optimising it' },
  { icon: '🎯', title: 'Pay Yourself First',        desc: 'Auto-invest before spending. SIP on salary day.' },
  { icon: '🛡️', title: 'Insurance Before Invest',  desc: 'Term + health cover before any investment product' },
  { icon: '🚫', title: 'Avoid Lifestyle Inflation', desc: "Don't increase spending every time income grows" },
  { icon: '📈', title: "Invest, Don't Just Save",   desc: 'Idle cash loses to inflation. Put it to work.' },
  { icon: '🔄', title: 'Automate Everything',       desc: 'SIP, EMI, tax savings — set it and forget it' },
  { icon: '📚', title: 'Learn Continuously',        desc: '1 finance book or podcast per month minimum' },
  { icon: '⚖️', title: 'Rebalance Annually',        desc: 'Realign your equity-debt ratio every year' },
  { icon: '🧾', title: 'Optimise Tax',              desc: '80C, 80D, ELSS, NPS — use every exemption' },
  { icon: '🎁', title: 'Give & Gratitude',           desc: 'Generosity builds an abundance mindset' },
]

// ── Age equity rules ──────────────────────────────────────────────────────────
const AGE_RULES = [
  { name: '100 − Age', desc: 'Conservative', color: '#2563EB', lightBg: '#EFF6FF', rule: (a: number) => 100 - a },
  { name: '110 − Age', desc: 'Moderate',     color: '#7C3AED', lightBg: '#F5F3FF', rule: (a: number) => 110 - a },
  { name: '120 − Age', desc: 'Aggressive',   color: '#E11D48', lightBg: '#FFF1F2', rule: (a: number) => 120 - a },
]

// ── Score helpers ─────────────────────────────────────────────────────────────
function scoreInfo(s: number) {
  if (s >= 80) return { label: 'Excellent', color: '#16A34A', lightBg: '#F0FDF4', ring: '#16A34A' }
  if (s >= 60) return { label: 'Good',      color: '#2563EB', lightBg: '#EFF6FF', ring: '#2563EB' }
  if (s >= 40) return { label: 'Fair',      color: '#D97706', lightBg: '#FFFBEB', ring: '#D97706' }
  return               { label: 'Needs Work', color: '#E11D48', lightBg: '#FFF1F2', ring: '#E11D48' }
}

function fmtV(n: number) {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(1)}Cr`
  if (n >= 1_00_000)    return `₹${(n / 1_00_000).toFixed(1)}L`
  if (n >= 1_000)       return `₹${(n / 1_000).toFixed(0)}K`
  return `₹${n.toFixed(0)}`
}

// ── Section header ─────────────────────────────────────────────────────────────
function SectionHeader({ icon: Icon, color, title, sub }: {
  icon: any; color: string; title: string; sub?: string
}) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-0.5">
        <Icon size={17} style={{ color }} />
        <h2 className="text-[16px] font-bold" style={{ color: 'var(--text)' }}>{title}</h2>
      </div>
      {sub && <p className="text-[12px]" style={{ color: 'var(--text3)' }}>{sub}</p>}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function FinancialHealthClient(props: Props) {
  const data = useMemo(() => computeHealthData(props), [])
  const [age, setAge] = useState(30)
  const [activeDecade, setActiveDecade] = useState(0)

  const si = scoreInfo(data.score)

  const pyramidLevel = useMemo(() => {
    for (const p of PYRAMID) { if (p.check(data)) return p.level }
    return 0
  }, [data])

  const currentPyramidEntry = PYRAMID.find(p => p.level === pyramidLevel)
  const nextSteps = data.pillars.filter(p => p.pts < p.max * 0.6).slice(0, 3)

  return (
    <div className="space-y-8 animate-fade-up pb-16">

      {/* ── HERO SCORE ── */}
      <FadeUp>
        <div className="wl-card p-6" style={{ borderColor: `${si.color}30` }}>
          <div className="flex flex-col sm:flex-row sm:items-center gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Heart size={16} style={{ color: si.color }} />
                <span className="text-[11px] font-semibold uppercase tracking-widest"
                  style={{ color: 'var(--text3)' }}>Financial Health Score</span>
              </div>
              <div className="flex items-end gap-3 mb-3">
                <span className="text-[52px] font-black leading-none" style={{ color: si.color }}>
                  {data.score}
                </span>
                <span className="text-[16px] font-semibold mb-2" style={{ color: 'var(--text3)' }}>/100</span>
                <span className="mb-2 px-3 py-1 rounded-full text-[12px] font-bold"
                  style={{ background: si.lightBg, color: si.color }}>
                  {si.label}
                </span>
              </div>
              <p className="text-[13px]" style={{ color: 'var(--text2)' }}>
                Measured across 5 pillars of financial wellness. Improve each pillar to level up your wealth stage.
              </p>
            </div>

            {/* Score ring */}
            <div className="relative w-32 h-32 shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="50" fill="none" stroke="var(--border)" strokeWidth="10" />
                <circle cx="60" cy="60" r="50" fill="none" stroke={si.ring} strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={`${(data.score / 100) * 314} 314`}
                  style={{ transition: 'stroke-dasharray 1.2s ease' }} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[22px] font-black" style={{ color: si.color }}>{data.score}</span>
                <span className="text-[10px] font-semibold" style={{ color: 'var(--text3)' }}>/ 100</span>
              </div>
            </div>
          </div>
        </div>
      </FadeUp>

      {/* ── 5-PILLAR BREAKDOWN ── */}
      <div>
        <FadeUp>
          <SectionHeader icon={BarChart2} color="var(--blue)" title="Score Breakdown"
            sub="How each pillar contributes to your overall financial health" />
        </FadeUp>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {data.pillars.map((p, i) => (
            <FadeUp key={p.label} delay={i * 70}>
              <div className="wl-card p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{p.label}</span>
                  <span className="text-[13px] font-bold" style={{ color: p.color }}>{p.pts}/{p.max}</span>
                </div>
                <AnimBar pct={(p.pts / p.max) * 100} color={p.color} delay={i * 70 + 200} />
                <p className="text-[11px] mt-1.5" style={{ color: 'var(--text3)' }}>{p.desc}</p>
              </div>
            </FadeUp>
          ))}
        </div>

        {nextSteps.length > 0 && (
          <FadeUp delay={380} className="mt-3">
            <div className="wl-card p-4" style={{ borderColor: '#D9770630', background: '#FFFBEB' }}>
              <div className="flex items-center gap-2 mb-2.5">
                <AlertTriangle size={14} style={{ color: '#D97706' }} />
                <span className="text-[12px] font-bold" style={{ color: '#D97706' }}>
                  Quick wins to boost your score
                </span>
              </div>
              {nextSteps.map(s => (
                <div key={s.label} className="flex items-start gap-2 text-[12px] mb-1.5"
                  style={{ color: 'var(--text2)' }}>
                  <ChevronRight size={13} className="shrink-0 mt-0.5" style={{ color: '#D97706' }} />
                  <span>
                    <strong style={{ color: 'var(--text)' }}>{s.label}</strong> — {s.desc}{' '}
                    <span style={{ color: '#D97706' }}>({s.pts}/{s.max} pts, +{s.max - s.pts} possible)</span>
                  </span>
                </div>
              ))}
            </div>
          </FadeUp>
        )}
      </div>

      {/* ── FINANCIAL PYRAMID ── */}
      <div>
        <FadeUp>
          <SectionHeader icon={Layers} color="var(--purple)" title="Financial Wellness Pyramid"
            sub="Build from the base upward — which level are you at?" />
        </FadeUp>

        <div className="flex flex-col gap-2.5 max-w-xl mx-auto">
          {PYRAMID.map((lvl, i) => {
            const Icon     = lvl.icon
            const achieved = lvl.check(data)
            const isCurrent = lvl.level === pyramidLevel
            const widths   = ['w-full', 'w-5/6', 'w-4/6', 'w-3/6', 'w-2/6']
            return (
              <FadeUp key={lvl.name} delay={i * 90} className={`mx-auto ${widths[i]}`}>
                <div className="wl-card p-3.5 flex items-center gap-3 transition-all"
                  style={achieved
                    ? { borderColor: `${lvl.color}40`, background: lvl.lightBg }
                    : { opacity: 0.45 }}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: achieved ? `${lvl.color}20` : 'var(--bg2)' }}>
                    <Icon size={17} style={{ color: achieved ? lvl.color : 'var(--text3)' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>
                        {lvl.name}
                      </span>
                      {isCurrent && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold animate-pulse"
                          style={{ background: `${lvl.color}20`, color: lvl.color }}>
                          YOU ARE HERE
                        </span>
                      )}
                      {achieved && !isCurrent && (
                        <CheckCircle2 size={13} style={{ color: '#16A34A' }} />
                      )}
                    </div>
                    <p className="text-[11px] truncate" style={{ color: 'var(--text3)' }}>{lvl.desc}</p>
                  </div>
                  <span className="text-[11px] font-bold shrink-0" style={{ color: lvl.color }}>
                    L{lvl.level}
                  </span>
                </div>
              </FadeUp>
            )
          })}
        </div>

        <FadeUp delay={500} className="mt-4">
          <div className="wl-card p-3.5 text-center" style={{ background: 'var(--bg2)' }}>
            <span className="text-[13px]" style={{ color: 'var(--text2)' }}>
              You are at{' '}
              <strong style={{ color: 'var(--text)' }}>Level {pyramidLevel}</strong> —{' '}
              <strong style={{ color: currentPyramidEntry?.color ?? 'var(--text)' }}>
                {currentPyramidEntry?.name ?? 'Starting Out'}
              </strong>.{' '}
              {pyramidLevel < 5
                ? `Next: reach Level ${pyramidLevel + 1} (${PYRAMID.find(p => p.level === pyramidLevel + 1)?.name})`
                : '🎉 You\'ve reached the top tier!'}
            </span>
          </div>
        </FadeUp>
      </div>

      {/* ── EQUITY BY AGE ── */}
      <div>
        <FadeUp>
          <SectionHeader icon={Target} color="var(--sage)" title="Equity Exposure by Age"
            sub="Slide your age to see recommended equity allocation by popular thumb rules" />
        </FadeUp>

        <FadeUp delay={80}>
          <div className="wl-card p-5">
            {/* Slider */}
            <div className="flex items-center gap-4 mb-5">
              <span className="text-[12px] font-semibold w-8" style={{ color: 'var(--text3)' }}>Age</span>
              <input type="range" min={20} max={70} value={age}
                onChange={e => setAge(Number(e.target.value))}
                className="flex-1 cursor-pointer" style={{ accentColor: 'var(--sage)' }} />
              <span className="text-[22px] font-black w-10 text-right" style={{ color: 'var(--text)' }}>
                {age}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {AGE_RULES.map(rule => {
                const eq   = Math.max(0, Math.min(100, rule.rule(age)))
                const debt = 100 - eq
                return (
                  <div key={rule.name} className="rounded-xl p-4" style={{ background: rule.lightBg }}>
                    <div className="text-[10px] font-semibold uppercase tracking-wide mb-0.5"
                      style={{ color: 'var(--text3)' }}>{rule.name}</div>
                    <div className="text-[12px] font-bold mb-1" style={{ color: rule.color }}>
                      {rule.desc}
                    </div>
                    <div className="flex items-end gap-1.5 mb-2.5">
                      <span className="text-[28px] font-black leading-none" style={{ color: rule.color }}>
                        {eq}%
                      </span>
                      <span className="text-[11px] mb-0.5" style={{ color: 'var(--text3)' }}>equity</span>
                    </div>
                    {/* stacked bar */}
                    <div className="h-2.5 rounded-full overflow-hidden flex gap-0.5"
                      style={{ background: 'var(--border)' }}>
                      <div className="h-full rounded-l-full transition-all duration-700"
                        style={{ width: `${eq}%`, background: rule.color }} />
                      <div className="h-full flex-1 rounded-r-full"
                        style={{ background: `${rule.color}25` }} />
                    </div>
                    <div className="flex justify-between text-[10px] mt-1" style={{ color: 'var(--text3)' }}>
                      <span>Equity {eq}%</span>
                      <span>Debt {debt}%</span>
                    </div>
                  </div>
                )
              })}
            </div>

            {data.totalCurr > 0 && (
              <div className="mt-4 p-3 rounded-xl flex items-center gap-2"
                style={{ background: 'var(--bg2)' }}>
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: '#D97706' }} />
                <span className="text-[12px]" style={{ color: 'var(--text2)' }}>
                  Your current portfolio:{' '}
                  <strong style={{ color: 'var(--text)' }}>{fmtV(data.equityVal)}</strong> equity (
                  {Math.round((data.equityVal / Math.max(1, data.totalCurr)) * 100)}%) vs{' '}
                  <strong style={{ color: 'var(--text)' }}>{fmtV(data.debtVal)}</strong> debt (
                  {Math.round((data.debtVal / Math.max(1, data.totalCurr)) * 100)}%)
                </span>
              </div>
            )}
          </div>
        </FadeUp>

        {/* Thumb rules */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
          {[
            { icon: '⚡', title: 'Rule of 72',         color: '#2563EB', bg: '#EFF6FF',
              desc: 'Divide 72 by your annual return to find years needed to double your money.',
              eg: '72 ÷ 12% = 6 years to 2×' },
            { icon: '📈', title: 'SIP Step-Up Rule',   color: '#16A34A', bg: '#F0FDF4',
              desc: 'Increase your SIP by 10–15% every year as income grows.',
              eg: '₹5K SIP + 10%/yr → ₹15K in 12 yrs' },
            { icon: '🏠', title: 'Debt-Free by 50',    color: '#D97706', bg: '#FFFBEB',
              desc: 'Clear all liabilities before shifting focus to retirement.',
              eg: 'No EMI after 50 = 40% more investable cash' },
          ].map((r, i) => (
            <FadeUp key={r.title} delay={i * 80}>
              <div className="wl-card p-4 h-full">
                <div className="text-2xl mb-2">{r.icon}</div>
                <div className="text-[13px] font-bold mb-1" style={{ color: 'var(--text)' }}>{r.title}</div>
                <p className="text-[11px] mb-2" style={{ color: 'var(--text2)' }}>{r.desc}</p>
                <div className="text-[11px] px-2.5 py-1.5 rounded-lg font-semibold"
                  style={{ background: r.bg, color: r.color }}>{r.eg}</div>
              </div>
            </FadeUp>
          ))}
        </div>
      </div>

      {/* ── WEALTH BY DECADE ── */}
      <div>
        <FadeUp>
          <SectionHeader icon={Clock} color="var(--gold)" title="Wealth Milestones by Decade"
            sub="Where should you be at each life stage?" />
        </FadeUp>

        <FadeUp delay={80}>
          <div className="flex gap-2 overflow-x-auto pb-1 mb-3">
            {DECADES.map((d, i) => (
              <button key={d.label} onClick={() => setActiveDecade(i)}
                className="shrink-0 px-4 py-2 rounded-xl text-[12px] font-bold transition-all border"
                style={activeDecade === i
                  ? { background: d.color, color: '#fff', borderColor: d.color }
                  : { background: 'var(--bg2)', color: 'var(--text3)', borderColor: 'var(--border)' }}>
                {d.icon} {d.label}
              </button>
            ))}
          </div>
        </FadeUp>

        {DECADES.map((d, i) => i !== activeDecade ? null : (
          <FadeUp key={d.label} delay={160}>
            <div className="wl-card p-5" style={{ borderColor: `${d.color}30` }}>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">{d.icon}</span>
                <div>
                  <h3 className="text-[14px] font-bold" style={{ color: 'var(--text)' }}>{d.phase}</h3>
                  <p className="text-[12px] font-semibold" style={{ color: d.color }}>In your {d.label}</p>
                </div>
              </div>

              <div className="p-3 rounded-xl text-center text-[13px] font-semibold mb-4"
                style={{ background: `${d.color}12`, color: d.color, border: `1px solid ${d.color}25` }}>
                🏆 Milestone: {d.milestone}
              </div>

              <ul className="space-y-2 mb-4">
                {d.goals.map((g, gi) => (
                  <li key={gi} className="flex items-start gap-2 text-[13px]"
                    style={{ color: 'var(--text2)' }}>
                    <CheckCircle2 size={14} className="shrink-0 mt-0.5" style={{ color: d.color }} />
                    {g}
                  </li>
                ))}
              </ul>

              <div className="p-3 rounded-xl flex gap-2 mb-4"
                style={{ background: 'var(--bg2)' }}>
                <Star size={14} className="shrink-0 mt-0.5" style={{ color: '#D97706' }} />
                <span className="text-[12px] italic" style={{ color: 'var(--text3)' }}>{d.tip}</span>
              </div>

              <div>
                <div className="flex justify-between text-[11px] mb-1" style={{ color: 'var(--text3)' }}>
                  <span>Journey Progress</span><span>{d.widthPct}%</span>
                </div>
                <AnimBar pct={d.widthPct} color={d.color} delay={200} />
              </div>
            </div>
          </FadeUp>
        ))}
      </div>

      {/* ── 10 MONEY HABITS ── */}
      <div>
        <FadeUp>
          <SectionHeader icon={Award} color="var(--rose)" title="10 Money Habits of the Wealthy"
            sub="Behaviours that separate the financially free from the financially stressed" />
        </FadeUp>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {HABITS.map((h, i) => (
            <FadeUp key={h.title} delay={i * 40}>
              <div className="wl-card p-4 flex items-start gap-3">
                <span className="text-2xl shrink-0">{h.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-bold mb-0.5" style={{ color: 'var(--text)' }}>
                    {h.title}
                  </div>
                  <p className="text-[11px]" style={{ color: 'var(--text3)' }}>{h.desc}</p>
                </div>
                <span className="text-[11px] font-bold shrink-0" style={{ color: 'var(--border2)' }}>
                  #{i + 1}
                </span>
              </div>
            </FadeUp>
          ))}
        </div>
      </div>

      {/* ── FINANCIAL LITERACY ── */}
      <FadeUp>
        <div className="wl-card p-5" style={{ background: '#F0FDF4', borderColor: '#16A34A30' }}>
          <div className="flex items-center gap-2 mb-4">
            <BookOpen size={16} style={{ color: '#16A34A' }} />
            <h2 className="text-[15px] font-bold" style={{ color: 'var(--text)' }}>
              Financial Literacy Essentials
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { term: 'CAGR',           def: 'Compounded Annual Growth Rate — how fast wealth grows year-over-year' },
              { term: 'XIRR',           def: 'Actual return on uneven cash flows like SIPs (Extended IRR)' },
              { term: 'Net Worth',      def: 'Total Assets − Total Liabilities = your real wealth number' },
              { term: 'Expense Ratio',  def: 'Annual fee charged by mutual funds. Lower = more returns for you.' },
              { term: 'Rebalancing',    def: 'Resetting portfolio back to target allocation every year.' },
              { term: 'Inflation',      def: 'Money loses ~6–7% value per year. Invest to beat it.' },
              { term: 'Liquidity',      def: 'How quickly you can convert assets to cash without loss.' },
              { term: 'Risk Profile',   def: 'Conservative / Moderate / Aggressive based on goals & age.' },
              { term: 'Asset Allocation', def: 'Splitting investments across equity, debt, gold, etc.' },
            ].map(item => (
              <div key={item.term} className="p-3 rounded-xl" style={{ background: '#fff', border: '1px solid #16A34A15' }}>
                <div className="text-[12px] font-bold mb-0.5" style={{ color: '#16A34A' }}>{item.term}</div>
                <p className="text-[11px]" style={{ color: 'var(--text2)' }}>{item.def}</p>
              </div>
            ))}
          </div>
        </div>
      </FadeUp>

      {/* ── CTA ── */}
      <FadeUp>
        <div className="wl-card p-6 text-center" style={{ background: 'var(--bg2)' }}>
          <div className="text-4xl mb-3">🚀</div>
          <h2 className="text-[17px] font-bold mb-2" style={{ color: 'var(--text)' }}>
            Ready to level up your finances?
          </h2>
          <p className="text-[13px] mb-5 max-w-sm mx-auto" style={{ color: 'var(--text2)' }}>
            Set goals, link investments, and watch your health score climb over time.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link href="/dashboard/goals"
              className="px-5 py-2.5 rounded-xl font-bold text-[13px] text-white transition-all hover:opacity-90"
              style={{ background: 'var(--sage)' }}>
              Manage Goals
            </Link>
            <Link href="/dashboard/investments"
              className="px-5 py-2.5 rounded-xl font-bold text-[13px] transition-all hover:opacity-80"
              style={{ background: '#EFF6FF', color: '#2563EB' }}>
              View Investments
            </Link>
          </div>
        </div>
      </FadeUp>

    </div>
  )
}
