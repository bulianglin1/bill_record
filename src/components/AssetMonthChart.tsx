import { useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type {
  AssetDistributionItem,
  MonthAssetPoint,
} from '@/services/cloudAssetSnapshotService'
import { formatMoney } from '@/utils/format'

interface AssetMonthChartProps {
  points: MonthAssetPoint[]
  /** 受控选中月份 YYYY-MM */
  selectedMonth?: string
  onSelectMonth?: (month: string) => void
}

interface ChartRow {
  label: string
  month: string
  value: number
  date: string
  distribution: AssetDistributionItem[]
}

/** 各月「最晚一天」总资产折线；点选后展示当时账户明细 */
export function AssetMonthChart({
  points,
  selectedMonth: controlledMonth,
  onSelectMonth,
}: AssetMonthChartProps) {
  const data = useMemo<ChartRow[]>(
    () =>
      points.map((p) => ({
        label: p.month.slice(5), // MM
        month: p.month,
        value: p.totalAssets,
        date: p.snapshotDate,
        distribution: p.distribution ?? [],
      })),
    [points],
  )

  const [innerMonth, setInnerMonth] = useState<string | null>(
    () => controlledMonth ?? data[data.length - 1]?.month ?? null,
  )

  useEffect(() => {
    if (controlledMonth) {
      setInnerMonth(controlledMonth)
    }
  }, [controlledMonth])

  const selectedMonth = controlledMonth ?? innerMonth
  const selected =
    data.find((d) => d.month === selectedMonth) ?? data[data.length - 1]

  function selectMonth(month: string) {
    setInnerMonth(month)
    onSelectMonth?.(month)
  }

  if (points.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-muted">
        暂无月度快照。登录或改动资产后会自动记录每天总资产与分布。
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="h-56 w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
            onClick={(state) => {
              const payload = (
                state as { activePayload?: Array<{ payload?: ChartRow }> } | undefined
              )?.activePayload?.[0]?.payload
              if (payload?.month) selectMonth(payload.month)
            }}
          >
            <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tick={{ fill: 'var(--color-ink-muted)', fontSize: 12 }}
              axisLine={{ stroke: 'var(--color-line)' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: 'var(--color-ink-muted)', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={56}
            />
            <Tooltip content={<MonthTooltip />} />
            <Line
              type="monotone"
              dataKey="value"
              name="总资产"
              stroke="var(--color-accent)"
              strokeWidth={2.5}
              dot={{ r: 4, cursor: 'pointer' }}
              activeDot={{ r: 6, cursor: 'pointer' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {selected ? (
        <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-3 sm:px-4">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-medium">
              {selected.month} 明细
              <span className="ml-2 font-normal text-muted">
                快照日 {selected.date}
              </span>
            </p>
            <p className="text-sm font-medium text-[var(--color-accent)]">
              合计 {formatMoney(selected.value)}
            </p>
          </div>
          {selected.distribution.length === 0 ? (
            <p className="text-xs text-muted">
              该日快照没有账户分布（可能是升级前写入的）。登录或改动资产后会补上当天明细。
            </p>
          ) : (
            <ul className="space-y-1.5">
              {[...selected.distribution]
                .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance))
                .map((item) => (
                  <li
                    key={item.accountId || item.name}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="truncate">{item.name}</span>
                      <span className="shrink-0 text-xs text-muted">{item.type}</span>
                    </span>
                    <span className="shrink-0 text-muted">{formatMoney(item.balance)}</span>
                  </li>
                ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}

function MonthTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload?: ChartRow }>
}) {
  if (!active || !payload?.[0]?.payload) return null
  const row = payload[0].payload
  const dist = [...(row.distribution ?? [])]
    .filter((d) => d.balance !== 0)
    .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance))
    .slice(0, 6)

  return (
    <div className="max-w-[240px] rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm shadow-sm">
      <p className="font-medium">
        {row.month}
        <span className="ml-1 font-normal text-muted">快照 {row.date}</span>
      </p>
      <p className="mt-1 text-[var(--color-accent)]">总资产 {formatMoney(row.value)}</p>
      {dist.length > 0 ? (
        <ul className="mt-2 space-y-1 border-t border-[var(--color-line)] pt-2 text-xs">
          {dist.map((d) => (
            <li key={d.accountId || d.name} className="flex justify-between gap-3">
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: d.color }}
                />
                <span className="truncate">{d.name}</span>
              </span>
              <span className="shrink-0 text-muted">{formatMoney(d.balance)}</span>
            </li>
          ))}
          {(row.distribution?.length ?? 0) > 6 ? (
            <li className="text-muted">点选该月可看完整明细…</li>
          ) : null}
        </ul>
      ) : (
        <p className="mt-1 text-xs text-muted">无分布明细</p>
      )}
    </div>
  )
}
