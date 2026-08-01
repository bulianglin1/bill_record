import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Transaction } from '@/types'
import { formatMoney } from '@/utils/format'

interface TrendLineChartProps {
  transactions: Transaction[]
  /** 统计最近天数，默认 14 */
  days?: number
}

function buildSeries(transactions: Transaction[], days: number) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const map = new Map<string, { date: string; income: number; expense: number }>()
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    map.set(key, {
      date: `${d.getMonth() + 1}/${d.getDate()}`,
      income: 0,
      expense: 0,
    })
  }

  for (const t of transactions) {
    const row = map.get(t.date.slice(0, 10))
    if (!row) continue
    if (t.type === 'income') row.income += t.amount
    if (t.type === 'expense') row.expense += t.amount
  }

  return Array.from(map.values())
}

/** 宽屏趋势折线图：近 N 日收入 / 支出 */
export function TrendLineChart({ transactions, days = 14 }: TrendLineChartProps) {
  const data = buildSeries(transactions, days)
  const hasData = data.some((d) => d.income > 0 || d.expense > 0)

  if (!hasData) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted">
        近 {days} 日暂无收支数据
      </div>
    )
  }

  return (
    <div className="h-64 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tick={{ fill: 'var(--color-ink-muted)', fontSize: 12 }}
            axisLine={{ stroke: 'var(--color-line)' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: 'var(--color-ink-muted)', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          <Tooltip
            formatter={(value) => formatMoney(Number(value ?? 0))}
            contentStyle={{
              background: 'var(--color-surface-elevated)',
              border: '1px solid var(--color-line)',
              borderRadius: 12,
              color: 'var(--color-ink)',
            }}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="income"
            name="收入"
            stroke="var(--color-income)"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="expense"
            name="支出"
            stroke="var(--color-expense)"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
