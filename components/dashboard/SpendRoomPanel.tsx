'use client'
import { fmtMoney } from '@/lib/format'
import { fmtDay } from '@/lib/insights'
import { labelOf } from '@/lib/money'
import { Panel } from '@/components/ui/kit'
import type { SpendRoom } from '@/lib/spendRoom'

export type RoomCard = SpendRoom & { until: string; perDay: number | null }

// How much more you can spend: per category, what's left of its budget (or a
// rough allowance from your last 3 months), never above what's actually free.
export default function SpendRoomPanel({ rooms }: { rooms: RoomCard[] }) {
  if (!rooms.some(r => r.lines.length)) return null
  return (
    <Panel title="How much more can you spend">
      <div className={`mt-2 grid gap-4 ${rooms.length > 1 ? 'md:grid-cols-2' : ''}`}>
        {rooms.map(r => {
          const m = (n: number) => fmtMoney(n, r.cur)
          return (
            <div key={r.cur} className="min-w-0">
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <span className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>
                  {r.safe > 0 ? <>{m(r.safe)} free</> : <span style={{ color: '#DC2626' }}>Nothing free right now</span>}
                  {rooms.length > 1 && <span className="font-normal" style={{ color: 'var(--text3)' }}> · {r.cur === 'AED' ? 'UAE' : 'India'}</span>}
                </span>
                <span className="text-[11.5px]" style={{ color: 'var(--text3)' }}>until {fmtDay(r.until)}{r.perDay ? ` · ${m(r.perDay)}/day` : ''}</span>
              </div>
              <ul className="mt-1.5">
                {r.lines.slice(0, 8).map(l => {
                  const pct = l.cap > 0 ? Math.min(100, l.spent / l.cap * 100) : 100, over = l.left < 0
                  return (
                    <li key={l.category} className="py-2" style={{ borderTop: '1px solid var(--track)' }}>
                      <div className="flex items-baseline justify-between gap-2 text-[13px]">
                        <span className="min-w-0 truncate" style={{ color: 'var(--text)' }}>{labelOf(l.category)}
                          {l.estimated && <span className="ml-1.5 text-[10.5px] font-semibold px-1.5 py-[1px] rounded-full" style={{ background: '#F1F0F7', color: '#5B5A75' }}>estimate</span>}
                        </span>
                        <span className="font-semibold tabular-nums flex-shrink-0" style={{ color: over ? '#DC2626' : 'var(--text)' }}>
                          {over ? `over by ${m(-l.left)}` : `${m(l.room)} more`}
                        </span>
                      </div>
                      <div className="h-[5px] rounded-full mt-1.5 overflow-hidden" style={{ background: 'var(--track)' }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: over ? '#DC2626' : pct >= 85 ? '#D97706' : 'var(--accent)' }} />
                      </div>
                      <div className="text-[11.5px] mt-1" style={{ color: 'var(--text3)' }}>{m(l.spent)} of {m(l.cap)}{l.estimated ? ' (your usual)' : ''}</div>
                    </li>
                  )
                })}
              </ul>
              {r.tight && r.safe > 0 && (
                <div className="text-[12px] rounded-[10px] px-3 py-2 mt-1 leading-[1.45]" style={{ background: '#FFF8EC', color: '#8A5A12' }}>
                  These allow {m(r.totalLeft)} in total, but only {m(r.safe)} is free, so it’s shared: spending in one leaves less for the others.
                </div>
              )}
            </div>
          )
        })}
      </div>
      <p className="mt-2.5 text-[11.5px] leading-snug" style={{ color: 'var(--text4)' }}>
        Free = bank &amp; cash minus what’s due before payday. “Estimate” is your average over the last 3 months plus 10%, for categories with no budget; set a budget to use your own number.
      </p>
    </Panel>
  )
}
