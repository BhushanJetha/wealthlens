'use client'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

const DEFAULT_COLORS = ['#00C9A7','#4A90D9','#F4A535','#7C5CBF','#E8556D','#3CC68A','#FF8C42','#A0B0C0']

interface Props {
  data: Array<{ name: string; value: number }>
  sym?: string
  colors?: string[]
  innerRadius?: number
  outerRadius?: number
  height?: number
  showLegend?: boolean
}

export function DonutChart({ data, sym = '₹', colors = DEFAULT_COLORS, innerRadius = 50, outerRadius = 78, height = 200, showLegend = true }: Props) {
  const total = data.reduce((a, d) => a + d.value, 0)

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie data={data} dataKey="value" cx="50%" cy="50%"
            innerRadius={innerRadius} outerRadius={outerRadius} paddingAngle={2}>
            {data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} strokeWidth={0} />)}
          </Pie>
          <Tooltip
            contentStyle={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }}
            formatter={(v: any, name: string) => [
              `${sym}${Number(v).toLocaleString('en-IN')} (${total > 0 ? Math.round(Number(v)/total*100) : 0}%)`,
              name
            ]}
          />
        </PieChart>
      </ResponsiveContainer>

      {showLegend && (
        <div className="flex flex-wrap gap-x-3 gap-y-1.5 justify-center mt-1">
          {data.map((d, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--text3)' }}>
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: colors[i % colors.length] }} />
              <span>{d.name}</span>
              {total > 0 && <span style={{ color: 'var(--text3)' }}>({Math.round(d.value/total*100)}%)</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
