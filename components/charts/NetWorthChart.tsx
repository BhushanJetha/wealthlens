'use client'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

export function NetWorthChart({ data }: { data: Array<{ month: string; value: number }> }) {
  return (
    <ResponsiveContainer width="100%" height="90%">
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey="month" tick={{ fill: '#6A7F92', fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: '#6A7F92', fontSize: 10 }} axisLine={false} tickLine={false}
          tickFormatter={v => v >= 10000000 ? `${(v/10000000).toFixed(1)}Cr` : v >= 100000 ? `${(v/100000).toFixed(0)}L` : v.toLocaleString()} />
        <Tooltip
          contentStyle={{ background: '#1E2D40', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: '#A0B0C0' }}
          itemStyle={{ color: '#00C9A7' }}
          formatter={(v: any) => [`₹${Number(v).toLocaleString('en-IN')}`, 'Net Worth']}
        />
        <Line type="monotone" dataKey="value" stroke="#00C9A7" strokeWidth={2} dot={{ fill: '#00C9A7', r: 3 }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}
