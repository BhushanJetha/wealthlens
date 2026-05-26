'use client'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface Props {
  data: Array<{ month: string; value: number }>
  sym?: string
  color?: string
  height?: number
}

export function MonthlyBarChart({ data, sym = '₹', color = 'var(--blue)', height = 220 }: Props) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="month" tick={{ fill: '#9CA3AF', fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: '#9CA3AF', fontSize: 10 }} axisLine={false} tickLine={false}
          tickFormatter={v => v >= 10000000 ? `${(v / 10000000).toFixed(1)}Cr`
            : v >= 100000 ? `${(v / 100000).toFixed(0)}L`
            : v >= 1000 ? `${(v / 1000).toFixed(0)}k`
            : v.toString()} />
        <Tooltip
          cursor={{ fill: 'rgba(0,0,0,0.03)' }}
          contentStyle={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }}
          labelStyle={{ color: 'var(--text3)' }}
          formatter={(v: any) => [`${sym}${Number(v).toLocaleString('en-IN')}`, 'Amount']}
        />
        <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  )
}

interface StackedProps {
  data: Array<Record<string, any>>
  keys: Array<{ key: string; color: string; label: string }>
  xKey?: string
  sym?: string
  height?: number
}

export function StackedBarChart({ data, keys, xKey = 'month', sym = '₹', height = 240 }: StackedProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey={xKey} tick={{ fill: '#9CA3AF', fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: '#9CA3AF', fontSize: 10 }} axisLine={false} tickLine={false}
          tickFormatter={v => v >= 100000 ? `${(v / 100000).toFixed(0)}L` : v.toLocaleString()} />
        <Tooltip
          cursor={{ fill: 'rgba(0,0,0,0.03)' }}
          contentStyle={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }}
          formatter={(v: any, name: string) => [`${sym}${Number(v).toLocaleString('en-IN')}`, name]}
        />
        {keys.map((k, idx) => (
          <Bar key={k.key} dataKey={k.key} name={k.label} stackId="s" fill={k.color}
            radius={idx === keys.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
