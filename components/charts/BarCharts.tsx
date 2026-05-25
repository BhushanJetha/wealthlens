'use client'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface Props {
  data: Array<{ month: string; value: number }>
  sym?: string
  color?: string
  height?: number
}

export function MonthlyBarChart({ data, sym = '₹', color = '#4A90D9', height = 220 }: Props) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis dataKey="month" tick={{ fill: '#6A7F92', fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: '#6A7F92', fontSize: 10 }} axisLine={false} tickLine={false}
          tickFormatter={v => v >= 10000000 ? `${(v/10000000).toFixed(1)}Cr`
            : v >= 100000 ? `${(v/100000).toFixed(0)}L`
            : v >= 1000 ? `${(v/1000).toFixed(0)}k`
            : v.toString()} />
        <Tooltip
          cursor={{ fill: 'rgba(255,255,255,0.03)' }}
          contentStyle={{ background: '#1E2D40', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }}
          labelStyle={{ color: '#A0B0C0' }}
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
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis dataKey={xKey} tick={{ fill: '#6A7F92', fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: '#6A7F92', fontSize: 10 }} axisLine={false} tickLine={false}
          tickFormatter={v => v >= 100000 ? `${(v/100000).toFixed(0)}L` : v.toLocaleString()} />
        <Tooltip
          cursor={{ fill: 'rgba(255,255,255,0.03)' }}
          contentStyle={{ background: '#1E2D40', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }}
          formatter={(v: any, name: string) => [`${sym}${Number(v).toLocaleString('en-IN')}`, name]}
        />
        {keys.map(k => (
          <Bar key={k.key} dataKey={k.key} name={k.label} stackId="s" fill={k.color}
            radius={keys.indexOf(k) === keys.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
