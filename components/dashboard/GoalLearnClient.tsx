'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import {
  Target, TrendingUp, Shield, Clock, Zap, Star,
  ChevronRight, Play, ArrowRight, CheckCircle2,
  Briefcase, Home, GraduationCap, Plane, Heart, Car,
} from 'lucide-react'

// ── Intersection Observer hook ────────────────────────────────────────────────
function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setInView(true) }, { threshold })
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold])
  return { ref, inView }
}

// ── Counter animation ─────────────────────────────────────────────────────────
function AnimCounter({ to, duration = 1400, prefix = '', suffix = '' }: { to: number; duration?: number; prefix?: string; suffix?: string }) {
  const [val, setVal] = useState(0)
  const { ref, inView } = useInView()
  useEffect(() => {
    if (!inView) return
    let start = 0
    const step = Math.ceil(to / (duration / 16))
    const id = setInterval(() => {
      start = Math.min(start + step, to)
      setVal(start)
      if (start >= to) clearInterval(id)
    }, 16)
    return () => clearInterval(id)
  }, [inView, to, duration])
  return <span ref={ref}>{prefix}{val.toLocaleString('en-IN')}{suffix}</span>
}

// ── Progress bar animated ─────────────────────────────────────────────────────
function AnimBar({ pct, color, delay = 0 }: { pct: number; color: string; delay?: number }) {
  const { ref, inView } = useInView()
  return (
    <div ref={ref} className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--bg2)' }}>
      <div className="h-full rounded-full transition-all" style={{
        width: inView ? `${pct}%` : '0%',
        background: color,
        transitionDuration: '1.2s',
        transitionDelay: `${delay}ms`,
        transitionTimingFunction: 'cubic-bezier(0.4,0,0.2,1)',
      }} />
    </div>
  )
}

// ── Card fade-up ──────────────────────────────────────────────────────────────
function FadeUp({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const { ref, inView } = useInView()
  return (
    <div ref={ref} className={className} style={{
      opacity: inView ? 1 : 0,
      transform: inView ? 'translateY(0)' : 'translateY(24px)',
      transition: `opacity 0.6s ease ${delay}ms, transform 0.6s ease ${delay}ms`,
    }}>
      {children}
    </div>
  )
}

// ── Goal examples data ────────────────────────────────────────────────────────
const GOAL_EXAMPLES = [
  {
    term: 'Short-Term',
    horizon: '< 1 Year',
    color: '#3B7DD8',
    bg: 'var(--blue-bg)',
    icon: Car,
    examples: ['Emergency Fund', 'New Laptop / Gadget', 'Vacation', 'Vehicle Down Payment'],
    instruments: ['Fixed Deposits', 'Liquid Mutual Funds', 'Recurring Deposits'],
    tip: 'Capital preservation is key. Avoid equity for goals less than 12 months away.',
    growth: '5–7% p.a.',
  },
  {
    term: 'Mid-Term',
    horizon: '1–3 Years',
    color: '#D4920A',
    bg: '#FFFBEB',
    icon: Home,
    examples: ['Home Down Payment', 'Higher Education', 'Wedding Fund', 'Business Capital'],
    instruments: ['Hybrid Mutual Funds', 'Debt Funds', 'Short-Term FDs', 'ETFs'],
    tip: 'Balance growth and safety. Hybrid funds give equity exposure with downside protection.',
    growth: '8–11% p.a.',
  },
  {
    term: 'Long-Term',
    horizon: '3+ Years',
    color: '#3D7A58',
    bg: 'var(--sage-bg)',
    icon: Briefcase,
    examples: ['Retirement Corpus', "Child's Education", 'Financial Freedom', 'Wealth Creation'],
    instruments: ['Equity Mutual Funds', 'Stocks', 'NPS', 'ELSS', 'Index Funds'],
    tip: 'Time in the market beats timing the market. Compounding at 12–15% can 10× your money in 20 years.',
    growth: '12–15% p.a.',
  },
]

// ── Benefits data ─────────────────────────────────────────────────────────────
const BENEFITS = [
  {
    icon: Target,
    color: '#3D7A58',
    bg: 'var(--sage-bg)',
    title: 'Purpose-Driven Investing',
    body: 'Every rupee has a destination. When investments are tied to goals, you invest with conviction and avoid impulsive decisions.',
  },
  {
    icon: TrendingUp,
    color: '#3B7DD8',
    bg: 'var(--blue-bg)',
    title: 'Optimized Asset Allocation',
    body: 'Match the right instrument to the right timeline — equity for long goals, debt for short ones — maximizing returns at every horizon.',
  },
  {
    icon: Shield,
    color: '#7C5CBF',
    bg: '#EDE9FE',
    title: 'Emotional Discipline',
    body: 'Seeing progress toward a named goal (like "Daughter\'s College") prevents panic-selling during market dips. You stay the course.',
  },
  {
    icon: Clock,
    color: '#D4920A',
    bg: '#FFFBEB',
    title: 'Time-Awareness',
    body: 'Goal-based tracking reveals exactly how much time and money you need, making course-corrections early — before it\'s too late.',
  },
  {
    icon: Zap,
    color: '#C96A3A',
    bg: '#FEF3EC',
    title: 'Harness Compounding',
    body: '₹5,000/month in equity SIP for 20 years at 12% CAGR = ₹49.9 Lakhs. Goals give you the motivation to stay invested long enough.',
  },
]

// ── Compounding table data ────────────────────────────────────────────────────
const COMPOUND_ROWS = [
  { years: 5,  rate: 12, sip: 5000,  result: 408154  },
  { years: 10, rate: 12, sip: 5000,  result: 1123391 },
  { years: 15, rate: 12, sip: 5000,  result: 2502321 },
  { years: 20, rate: 12, sip: 5000,  result: 4993725 },
  { years: 25, rate: 12, sip: 5000,  result: 9499020 },
]

// ── Real goals showcase ───────────────────────────────────────────────────────
const SHOWCASE_GOALS = [
  { icon: '🏠', label: 'Dream Home',        target: '60L',  sip: '18,500', years: 10, pct: 45, color: '#3B7DD8' },
  { icon: '🎓', label: "Child's Education", target: '25L',  sip: '7,200',  years: 12, pct: 28, color: '#3D7A58' },
  { icon: '✈️', label: 'World Tour',        target: '5L',   sip: '6,800',  years: 5,  pct: 72, color: '#D4920A' },
  { icon: '🏖️', label: 'Retirement Corpus', target: '2Cr',  sip: '22,000', years: 20, pct: 18, color: '#7C5CBF' },
]

export default function GoalLearnClient() {
  const [activeGoal, setActiveGoal] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setActiveGoal(p => (p + 1) % GOAL_EXAMPLES.length), 4000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="space-y-16 pb-10">

      {/* ── Hero ─────────────────────────────────────────────── */}
      <div className="relative rounded-2xl overflow-hidden p-8 md:p-12"
        style={{ background: 'linear-gradient(135deg, #0F2A1C 0%, #1B4332 40%, #2D6A4F 100%)' }}>
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, #52B788 0%, transparent 50%), radial-gradient(circle at 80% 20%, #74C69D 0%, transparent 40%)' }} />

        <div className="relative z-10 max-w-2xl">
          <div className="flex items-center gap-2 mb-4">
            <div className="px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase"
              style={{ background: 'rgba(82,183,136,0.2)', color: '#74C69D' }}>
              Goal-Based Investing
            </div>
          </div>
          <h1 className="text-3xl md:text-4xl font-black leading-tight mb-4" style={{ color: '#fff' }}>
            Every Rupee Deserves<br />
            <span style={{ color: '#74C69D' }}>A Purpose</span>
          </h1>
          <p className="text-[14px] leading-relaxed mb-8 max-w-lg" style={{ color: '#B7E4C7' }}>
            Stop investing randomly. Goal-based investing maps your money to life milestones —
            so each investment works toward something meaningful, and you always know where you stand.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/dashboard/goals"
              className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-[13px]"
              style={{ background: '#52B788', color: '#fff' }}>
              <Target size={15} /> Start Building Goals
            </Link>
            <a href="#how-it-works"
              className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-[13px]"
              style={{ background: 'rgba(255,255,255,0.1)', color: '#B7E4C7' }}>
              <Play size={14} /> See How It Works
            </a>
          </div>
        </div>

        {/* Floating stats */}
        <div className="absolute right-8 top-1/2 -translate-y-1/2 hidden lg:flex flex-col gap-3">
          {[
            { label: 'avg returns vs random investing', value: '+2.3x', color: '#74C69D' },
            { label: 'investors stay invested longer', value: '87%',   color: '#52B788' },
            { label: 'reach goals on time',             value: '3x more', color: '#95D5B2' },
          ].map((s, i) => (
            <div key={i} className="px-4 py-3 rounded-xl text-right"
              style={{ background: 'rgba(255,255,255,0.07)', backdropFilter: 'blur(8px)' }}>
              <div className="text-[20px] font-black" style={{ color: s.color }}>{s.value}</div>
              <div className="text-[10px]" style={{ color: '#95D5B2' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── How It Works ─────────────────────────────────────── */}
      <div id="how-it-works">
        <FadeUp>
          <div className="text-center mb-10">
            <div className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text3)' }}>
              The Framework
            </div>
            <h2 className="text-2xl font-black" style={{ color: 'var(--text)' }}>How Goal-Based Investing Works</h2>
          </div>
        </FadeUp>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { step: '01', icon: Target,    color: '#3D7A58', bg: 'var(--sage-bg)', title: 'Define Your Goals', body: 'Name each financial milestone — retirement, home, education. Set a target amount and timeline.' },
            { step: '02', icon: TrendingUp, color: '#3B7DD8', bg: 'var(--blue-bg)', title: 'Match Investments', body: 'WealthLens scores every investment against each goal\'s category and time horizon automatically.' },
            { step: '03', icon: Star,       color: '#D4920A', bg: '#FFFBEB',       title: 'Track & Win',       body: 'Watch your progress in real-time. Get alerts when you\'re off-track and celebrate milestones.' },
          ].map((s, i) => (
            <FadeUp key={i} delay={i * 150}>
              <div className="wl-card p-6 relative overflow-hidden group hover:shadow-md transition-shadow">
                <div className="absolute top-4 right-4 text-[42px] font-black opacity-5 select-none"
                  style={{ color: s.color }}>{s.step}</div>
                <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: s.bg }}>
                  <s.icon size={20} style={{ color: s.color }} />
                </div>
                <div className="text-[15px] font-bold mb-2" style={{ color: 'var(--text)' }}>{s.title}</div>
                <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text3)' }}>{s.body}</p>
              </div>
            </FadeUp>
          ))}
        </div>
      </div>

      {/* ── Short / Mid / Long Term ───────────────────────────── */}
      <div>
        <FadeUp>
          <div className="text-center mb-8">
            <div className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text3)' }}>
              Investment Horizons
            </div>
            <h2 className="text-2xl font-black" style={{ color: 'var(--text)' }}>Match the Right Instrument to Your Timeline</h2>
            <p className="text-[13px] mt-2" style={{ color: 'var(--text3)' }}>
              WealthLens auto-detects whether your goal is short, mid, or long-term and recommends matching investments.
            </p>
          </div>
        </FadeUp>

        {/* Term selector tabs */}
        <div className="flex justify-center gap-2 mb-6">
          {GOAL_EXAMPLES.map((g, i) => (
            <button key={i} onClick={() => setActiveGoal(i)}
              className="px-5 py-2.5 rounded-xl font-bold text-[12px] transition-all"
              style={{
                background: activeGoal === i ? g.color : 'var(--bg2)',
                color: activeGoal === i ? '#fff' : 'var(--text3)',
                transform: activeGoal === i ? 'scale(1.02)' : 'scale(1)',
              }}>
              {g.term}
            </button>
          ))}
        </div>

        {/* Active goal panel */}
        {GOAL_EXAMPLES.map((g, i) => (
          <div key={i} style={{ display: activeGoal === i ? 'block' : 'none' }}>
            <div className="wl-card p-6 border-2 transition-all" style={{ borderColor: g.color + '40' }}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: g.bg }}>
                      <g.icon size={22} style={{ color: g.color }} />
                    </div>
                    <div>
                      <div className="text-[18px] font-black" style={{ color: g.color }}>{g.term}</div>
                      <div className="text-[12px]" style={{ color: 'var(--text3)' }}>{g.horizon} · {g.growth}</div>
                    </div>
                  </div>
                  <div className="p-3 rounded-xl text-[12px] leading-relaxed" style={{ background: g.bg, color: g.color }}>
                    {g.tip}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>
                    Example Goals
                  </div>
                  <div className="space-y-2">
                    {g.examples.map((ex, j) => (
                      <div key={j} className="flex items-center gap-2 text-[12px]">
                        <CheckCircle2 size={13} style={{ color: g.color, flexShrink: 0 }} />
                        <span style={{ color: 'var(--text2)' }}>{ex}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text3)' }}>
                    Recommended Instruments
                  </div>
                  <div className="space-y-2">
                    {g.instruments.map((inst, j) => (
                      <div key={j} className="flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-semibold"
                        style={{ background: g.bg, color: g.color }}>
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: g.color }} />
                        {inst}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Benefits ─────────────────────────────────────────── */}
      <div>
        <FadeUp>
          <div className="text-center mb-8">
            <div className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text3)' }}>
              Why It Works
            </div>
            <h2 className="text-2xl font-black" style={{ color: 'var(--text)' }}>5 Benefits of Goal-Based Investing</h2>
          </div>
        </FadeUp>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {BENEFITS.map((b, i) => (
            <FadeUp key={i} delay={i * 100}>
              <div className="wl-card p-5 h-full hover:shadow-md transition-shadow group">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform"
                    style={{ background: b.bg }}>
                    <b.icon size={18} style={{ color: b.color }} />
                  </div>
                  <div>
                    <div className="text-[13px] font-bold mb-1.5" style={{ color: 'var(--text)' }}>{b.title}</div>
                    <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text3)' }}>{b.body}</p>
                  </div>
                </div>
              </div>
            </FadeUp>
          ))}
        </div>
      </div>

      {/* ── Power of SIP + Compounding ────────────────────────── */}
      <div className="wl-card p-6 md:p-8">
        <FadeUp>
          <div className="text-center mb-8">
            <div className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text3)' }}>
              The Magic of Compounding
            </div>
            <h2 className="text-2xl font-black" style={{ color: 'var(--text)' }}>
              ₹5,000/month SIP at 12% CAGR
            </h2>
            <p className="text-[13px] mt-2" style={{ color: 'var(--text3)' }}>
              See how goal-linked SIPs grow over time — patience is the real superpower.
            </p>
          </div>
        </FadeUp>

        <div className="space-y-4">
          {COMPOUND_ROWS.map((row, i) => {
            const total_invested = row.sip * 12 * row.years
            const gains          = row.result - total_invested
            const gainPct        = (gains / total_invested) * 100
            const barMax         = COMPOUND_ROWS[COMPOUND_ROWS.length - 1].result

            return (
              <FadeUp key={i} delay={i * 120}>
                <div className="p-4 rounded-xl" style={{ background: 'var(--bg2)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[12px] font-black"
                        style={{ background: 'var(--sage-bg)', color: 'var(--sage)' }}>
                        {row.years}y
                      </div>
                      <div>
                        <div className="text-[12px] font-bold" style={{ color: 'var(--text)' }}>
                          {row.years} Years Goal
                        </div>
                        <div className="text-[10px]" style={{ color: 'var(--text3)' }}>
                          Invested: ₹{(total_invested / 100000).toFixed(1)}L
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[16px] font-black" style={{ color: 'var(--sage)' }}>
                        <AnimCounter to={Math.round(row.result / 1000)} suffix="K" prefix="₹" />
                      </div>
                      <div className="text-[10px] font-bold" style={{ color: '#10B981' }}>
                        +{gainPct.toFixed(0)}% gains
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <AnimBar pct={(total_invested / barMax) * 100} color="#94A3B8" delay={i * 120} />
                    <AnimBar pct={(row.result / barMax) * 100} color="var(--sage)" delay={i * 120 + 200} />
                  </div>
                  <div className="flex justify-between text-[9px] mt-1" style={{ color: 'var(--text3)' }}>
                    <span>Invested (grey) vs Corpus (green)</span>
                    <span>Gains: ₹{(gains / 100000).toFixed(1)}L</span>
                  </div>
                </div>
              </FadeUp>
            )
          })}
        </div>
      </div>

      {/* ── Goal Showcase ────────────────────────────────────── */}
      <div>
        <FadeUp>
          <div className="text-center mb-8">
            <div className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text3)' }}>
              See It In Action
            </div>
            <h2 className="text-2xl font-black" style={{ color: 'var(--text)' }}>Popular Life Goals — How to Plan Them</h2>
          </div>
        </FadeUp>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {SHOWCASE_GOALS.map((g, i) => (
            <FadeUp key={i} delay={i * 100}>
              <div className="wl-card p-5 hover:shadow-md transition-shadow">
                <div className="text-3xl mb-3">{g.icon}</div>
                <div className="text-[14px] font-bold mb-1" style={{ color: 'var(--text)' }}>{g.label}</div>
                <div className="text-[11px] mb-4" style={{ color: 'var(--text3)' }}>
                  Target: ₹{g.target} in {g.years} yrs · SIP: ₹{g.sip}/mo
                </div>
                <div className="mb-1.5">
                  <div className="flex justify-between text-[10px] mb-1">
                    <span style={{ color: 'var(--text3)' }}>Progress (demo)</span>
                    <span className="font-bold" style={{ color: g.color }}>{g.pct}%</span>
                  </div>
                  <AnimBar pct={g.pct} color={g.color} delay={i * 150} />
                </div>
              </div>
            </FadeUp>
          ))}
        </div>
      </div>

      {/* ── Key Principles ───────────────────────────────────── */}
      <FadeUp>
        <div className="rounded-2xl p-8" style={{ background: 'linear-gradient(135deg, #1B4332, #2D6A4F)' }}>
          <div className="text-center mb-8">
            <h2 className="text-2xl font-black mb-2" style={{ color: '#fff' }}>Golden Rules of Goal-Based Investing</h2>
            <p className="text-[13px]" style={{ color: '#B7E4C7' }}>Follow these principles to build wealth with purpose</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { num: '01', rule: 'One goal, one portfolio',      body: 'Keep investments for each goal separate. Don\'t mix your emergency fund with your retirement corpus.' },
              { num: '02', rule: 'Risk = Time horizon',          body: 'More time = more equity. Less time = more debt. Never take equity risk for goals less than 3 years away.' },
              { num: '03', rule: 'Automate with SIPs',           body: 'Link a SIP to every goal. Automation removes emotion and ensures consistent progress even in volatile markets.' },
              { num: '04', rule: 'Review annually',              body: 'Markets move. Life changes. Review goal allocations every year and rebalance to stay on track.' },
              { num: '05', rule: 'Step-up SIPs every year',      body: 'Increase your SIP by 10% annually — even small increases dramatically accelerate goal achievement.' },
              { num: '06', rule: 'Don\'t touch goal money',      body: 'Resist the urge to redeem goal-linked investments for lifestyle expenses. Let compounding do its work.' },
            ].map((r, i) => (
              <div key={i} className="p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.07)' }}>
                <div className="text-[28px] font-black mb-2" style={{ color: '#52B788', opacity: 0.4 }}>{r.num}</div>
                <div className="text-[13px] font-bold mb-1.5" style={{ color: '#fff' }}>{r.rule}</div>
                <p className="text-[11px] leading-relaxed" style={{ color: '#95D5B2' }}>{r.body}</p>
              </div>
            ))}
          </div>
        </div>
      </FadeUp>

      {/* ── CTA ──────────────────────────────────────────────── */}
      <FadeUp>
        <div className="wl-card p-8 text-center border-2" style={{ borderColor: 'var(--sage)', background: 'var(--sage-bg)' }}>
          <div className="text-4xl mb-4">🎯</div>
          <h2 className="text-2xl font-black mb-3" style={{ color: 'var(--text)' }}>
            Ready to Invest With Purpose?
          </h2>
          <p className="text-[13px] max-w-md mx-auto mb-6 leading-relaxed" style={{ color: 'var(--text3)' }}>
            Create your first goal, link your investments, and watch your progress in real-time.
            WealthLens makes goal-based investing effortless.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/dashboard/goals"
              className="flex items-center gap-2 px-8 py-3.5 rounded-xl font-bold text-[14px] text-white"
              style={{ background: 'var(--sage)' }}>
              <Target size={16} /> Create Your First Goal
              <ArrowRight size={14} />
            </Link>
            <Link href="/dashboard/investments"
              className="flex items-center gap-2 px-8 py-3.5 rounded-xl font-bold text-[14px]"
              style={{ background: 'var(--bg2)', color: 'var(--text)' }}>
              <ChevronRight size={14} /> View Investments
            </Link>
          </div>
        </div>
      </FadeUp>

    </div>
  )
}
