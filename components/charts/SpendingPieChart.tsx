'use client'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

const COLORS = ['#00C9A7','#4A90D9','#F4A535','#7C5CBF','#E8556D','#3CC68A','#FF8C42','#A0B0C0']

export function SpendingPieChart({ data }: { data: Array<{ name: string; value: number }> }) {
  const total = data.reduce((a, d) => a + d.value, 0)
  return (
    <div className="flex flex-col h-full">
      <ResponsiveContainer width="100%" height={150}>
        <PieChart>
          <Pie data={data} dataKey="value" cx="50%" cy="50%" innerRadius={40} outerRadius={68} paddingAngle={2}>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip
            contentStyle={{ background: '#1E2D40', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }}
            formatter={(v: any) => [`₹${Number(v).toLocaleString('en-IN')}`, '']}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
        {data.slice(0, 6).map((d, i) => (
          <div key={i} className="flex items-center gap-1 text-[10px] text-slate-400">
            <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
            {d.name} {total > 0 ? `${Math.round(d.value / total * 100)}%` : ''}
          </div>
        ))}
      </div>
    </div>
  )
}
