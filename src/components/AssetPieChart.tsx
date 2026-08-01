import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { formatMoney } from '@/utils/format'

/** 饼图只需要名称 / 余额 / 颜色（账户或快照分布均可） */
export interface AssetPieSlice {
  name: string
  balance: number
  color: string
}

interface AssetPieChartProps {
  accounts: AssetPieSlice[]
}

export function AssetPieChart({ accounts }: AssetPieChartProps) {
  const data = [...accounts]
    .filter((a) => a.balance > 0)
    .sort((a, b) => b.balance - a.balance)
    .map((a) => ({
      name: a.name,
      value: a.balance,
      color: a.color,
    }))

  if (data.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-muted">
        暂无正余额账户可展示分布
      </div>
    )
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={58}
            outerRadius={88}
            paddingAngle={2}
            stroke="none"
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) => formatMoney(Number(value ?? 0))}
            contentStyle={{
              background: 'var(--color-surface-elevated)',
              border: '1px solid var(--color-line)',
              borderRadius: 12,
              color: 'var(--color-ink)',
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
