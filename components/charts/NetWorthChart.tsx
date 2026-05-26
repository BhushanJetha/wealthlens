'use client'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

export function NetWorthChart({ data }: { data: Array<{ month: string; value: number }> }) {
  return (
    <ResponsiveContainer width="100%" height="90%">
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="month" tick={{ fill: '#9CA3AF', fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: '#9CA3AF', fontSize: 10 }} axisLine={false} tickLine={false}
          tickFormatter={v => v >= 10000000 ? `${(v / 10000000).toFixed(1)}Cr` : v >= 100000 ? `${(v / 100000).toFixed(0)}L` : v.toLocaleString()} />
        <Tooltip
          contentStyle={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: 'var(--text3)' }}
          itemStyle={{ color: 'var(--sage)' }}
          formatter={(v: any) => [`₹${Number(v).toLocaleString('en-IN')}`, 'Net Worth']}
        />
        <Line type="monotone" dataKey="value" stroke="var(--sage)" strokeWidth={2}
          dot={{ fill: 'var(--sage)', r: 3 }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}
