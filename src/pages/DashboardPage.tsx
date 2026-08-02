import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Minus,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { AccountCard } from '@/components/AccountCard'
import { AssetMonthChart } from '@/components/AssetMonthChart'
import { AssetPieChart } from '@/components/AssetPieChart'
import { MonthPicker } from '@/components/MonthPicker'
import { TrendLineChart } from '@/components/TrendLineChart'
import { listAccounts, sumBalances } from '@/services/accountService'
import {
  currentYearMonth,
  findMonthPoint,
  listMonthlyLastSnapshots,
  monthDateRange,
  shiftMonth,
  snapshotFromMonthPoint,
  type AssetDistributionItem,
  type AssetSnapshot,
  type MonthAssetPoint,
} from '@/services/cloudAssetSnapshotService'
import { listTransactions } from '@/services/transactionService'
import type { Account, Transaction } from '@/types'
import { formatMoney, formatDate, todayIsoDate } from '@/utils/format'

const RECENT_TX_LIMIT = 8
const TREND_DAYS = 14
/** 月份选择器跨度；与折线图展示月数可不同 */
const MONTH_OPTIONS_COUNT = 18
const CHART_MONTHS = 12

/** 近 N 天的起始日期（含今天，本地时区 YYYY-MM-DD） */
function startDateDaysAgo(days: number): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - (days - 1))
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

interface DashboardPageProps {
  refreshKey?: number
}

/** 生成可选月份列表（含当前月，向前共 months 个月） */
function buildMonthOptions(endMonth: string, months = MONTH_OPTIONS_COUNT): string[] {
  const list: string[] = []
  for (let i = months - 1; i >= 0; i -= 1) {
    list.push(shiftMonth(endMonth, -i))
  }
  return list
}

/** 按自然月拆分流水（date 为 YYYY-MM-DD） */
function filterTxByMonth(txs: Transaction[], yearMonth: string): Transaction[] {
  return txs.filter((t) => t.date.startsWith(yearMonth))
}

/** 折线图只用最近 CHART_MONTHS 个月 */
function toChartPoints(points: MonthAssetPoint[]): MonthAssetPoint[] {
  if (points.length <= CHART_MONTHS) return points
  return points.slice(points.length - CHART_MONTHS)
}

/** 汇总已按月份云端过滤后的流水收支 */
function sumMonthStats(txs: Transaction[]) {
  let income = 0
  let expense = 0
  for (const t of txs) {
    if (t.type === 'income') income += t.amount
    if (t.type === 'expense') expense += t.amount
  }
  return { income, expense }
}

function formatMonthLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split('-')
  return `${y}年${Number(m)}月`
}

/** 同一 refreshKey 下缓存账户/近况/月度快照，切换月份时不再重复请求 */
interface DashboardBaseCache {
  refreshKey: number
  accounts: Account[]
  recent: Transaction[]
  trendTx: Transaction[]
  allPoints: MonthAssetPoint[]
  /** 看本月时合并拉回的流水，可直接派生双月统计 */
  seedMonthTxs?: Transaction[]
  seedMonth?: string
  seedCompareMonth?: string
}

/**
 * 模块级进行中请求：React Strict Mode 会卸载再挂载（useRef 会丢），
 * 用模块变量才能合并两次 mount 的首屏请求。
 */
const dashboardBaseInflight = new Map<number, Promise<DashboardBaseCache>>()

export function DashboardPage({ refreshKey = 0 }: DashboardPageProps) {
  const thisMonth = currentYearMonth()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [recent, setRecent] = useState<Transaction[]>([])
  const [trendTx, setTrendTx] = useState<Transaction[]>([])
  const [monthTx, setMonthTx] = useState<Transaction[]>([])
  const [compareTx, setCompareTx] = useState<Transaction[]>([])
  const [selectedMonth, setSelectedMonth] = useState(thisMonth)
  const [monthPoints, setMonthPoints] = useState<MonthAssetPoint[]>([])
  const [selectedSnap, setSelectedSnap] = useState<AssetSnapshot | null>(null)
  const [compareSnap, setCompareSnap] = useState<AssetSnapshot | null>(null)
  /** 仅在当前挂载生命周期内复用；切走 Tab 卸载后下次会重新拉取 */
  const baseCacheRef = useRef<DashboardBaseCache | null>(null)

  const monthOptions = useMemo(
    () => buildMonthOptions(thisMonth, MONTH_OPTIONS_COUNT),
    [thisMonth],
  )
  const compareMonth = shiftMonth(selectedMonth, -1)
  const isCurrentMonth = selectedMonth === thisMonth

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const { start: rangeStart } = monthDateRange(compareMonth)
      const { end: rangeEnd } = monthDateRange(selectedMonth)
      const trendStart = startDateDaysAgo(TREND_DAYS)
      const today = todayIsoDate()

      const applySnaps = (points: MonthAssetPoint[]) => {
        setSelectedSnap(
          snapshotFromMonthPoint(findMonthPoint(points, selectedMonth)),
        )
        setCompareSnap(
          snapshotFromMonthPoint(findMonthPoint(points, compareMonth)),
        )
      }

      const applyBase = (base: DashboardBaseCache) => {
        setAccounts(base.accounts)
        setRecent(base.recent)
        setTrendTx(base.trendTx)
        setMonthPoints(toChartPoints(base.allPoints))
        applySnaps(base.allPoints)
      }

      let base =
        baseCacheRef.current?.refreshKey === refreshKey
          ? baseCacheRef.current
          : null

      // 首屏 / 数据刷新：合并为 accounts + 流水 + 月度快照（看本月时流水只需 1 次）
      if (!base) {
        const viewingCurrent = selectedMonth === thisMonth
        const mergedTxStart =
          rangeStart < trendStart ? rangeStart : trendStart

        let promise = dashboardBaseInflight.get(refreshKey)
        if (!promise) {
          promise = (async (): Promise<DashboardBaseCache> => {
            const [accs, points, primaryTxs] = await Promise.all([
              listAccounts(),
              listMonthlyLastSnapshots(MONTH_OPTIONS_COUNT).catch(
                () => [] as MonthAssetPoint[],
              ),
              listTransactions({
                startDate: viewingCurrent ? mergedTxStart : trendStart,
                endDate: today,
              }),
            ])
            const recentTx = primaryTxs.slice(0, RECENT_TX_LIMIT)
            const trend = primaryTxs.filter((t) => t.date >= trendStart)
            return {
              refreshKey,
              accounts: accs,
              recent: recentTx,
              trendTx: trend,
              allPoints: points,
              // 看本月时把月度流水也带上，避免再打一枪
              ...(viewingCurrent
                ? {
                    seedMonthTxs: primaryTxs,
                    seedMonth: selectedMonth,
                    seedCompareMonth: compareMonth,
                  }
                : {}),
            }
          })()
          dashboardBaseInflight.set(refreshKey, promise)
          void promise.finally(() => {
            if (dashboardBaseInflight.get(refreshKey) === promise) {
              dashboardBaseInflight.delete(refreshKey)
            }
          })
        }

        base = await promise
        baseCacheRef.current = base
        if (cancelled) return
      }

      applyBase(base)

      // 本月首屏：流水已在合并请求里，直接派生双月数据
      if (
        base.seedMonthTxs &&
        base.seedMonth === selectedMonth &&
        base.seedCompareMonth === compareMonth
      ) {
        setMonthTx(filterTxByMonth(base.seedMonthTxs, selectedMonth))
        setCompareTx(filterTxByMonth(base.seedMonthTxs, compareMonth))
        return
      }

      const monthRangeTxs = await listTransactions({
        startDate: rangeStart,
        endDate: rangeEnd,
      })
      if (cancelled) return
      setMonthTx(filterTxByMonth(monthRangeTxs, selectedMonth))
      setCompareTx(filterTxByMonth(monthRangeTxs, compareMonth))
    })()

    return () => {
      cancelled = true
    }
  }, [refreshKey, selectedMonth, compareMonth, thisMonth])

  const monthStats = useMemo(() => sumMonthStats(monthTx), [monthTx])
  const compareStats = useMemo(() => sumMonthStats(compareTx), [compareTx])

  const total = sumBalances(accounts)
  /** 所选月展示用总资产：当月用实时余额，历史月用该月末快照 */
  const displayAssets = isCurrentMonth
    ? total
    : (selectedSnap?.totalAssets ?? null)
  const compareAssets = compareSnap?.totalAssets ?? null
  const delta =
    displayAssets === null || compareAssets === null
      ? null
      : Math.round((displayAssets - compareAssets) * 100) / 100

  const selectedDistribution: AssetDistributionItem[] = isCurrentMonth
    ? accounts.map((a) => ({
        accountId: a.id,
        name: a.name,
        type: a.type,
        balance: a.balance,
        currency: a.currency,
        color: a.color,
      }))
    : (selectedSnap?.distribution ?? [])

  const minMonth = monthOptions[0]!
  const canGoPrev = selectedMonth > minMonth
  const canGoNext = selectedMonth < thisMonth

  function goMonth(deltaMonths: number) {
    const next = shiftMonth(selectedMonth, deltaMonths)
    if (next > thisMonth || next < minMonth) return
    setSelectedMonth(next)
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <section className="panel rounded-3xl p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">查看月份</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!canGoPrev}
              onClick={() => goMonth(-1)}
              className="rounded-xl border border-[var(--color-line)] p-2 text-muted disabled:opacity-40"
              aria-label="上一月"
            >
              <ChevronLeft size={18} />
            </button>
            <MonthPicker
              value={selectedMonth}
              min={monthOptions[0]}
              max={thisMonth}
              onChange={(v) => {
                if (v) setSelectedMonth(v)
              }}
              aria-label="查看月份"
            />
            <button
              type="button"
              disabled={!canGoNext}
              onClick={() => goMonth(1)}
              className="rounded-xl border border-[var(--color-line)] p-2 text-muted disabled:opacity-40"
              aria-label="下一月"
            >
              <ChevronRight size={18} />
            </button>
            {!isCurrentMonth && (
              <button
                type="button"
                onClick={() => setSelectedMonth(thisMonth)}
                className="rounded-xl border border-[var(--color-line)] px-3 py-2 text-xs text-muted"
              >
                回到本月
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted">
              {isCurrentMonth
                ? '总资产（当前）'
                : `总资产（${formatMonthLabel(selectedMonth)}末快照）`}
            </p>
            <p className="font-display mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
              {displayAssets === null ? '暂无快照' : formatMoney(displayAssets)}
            </p>
            {compareAssets !== null && delta !== null ? (
              <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
                <span className="text-muted">
                  较{formatMonthLabel(compareMonth)}末
                  {compareSnap ? `（${compareSnap.snapshotDate}）` : ''}
                </span>
                <span
                  className={
                    delta > 0
                      ? 'inline-flex items-center gap-0.5 font-medium text-[var(--color-income)]'
                      : delta < 0
                        ? 'inline-flex items-center gap-0.5 font-medium text-[var(--color-expense)]'
                        : 'inline-flex items-center gap-0.5 font-medium text-muted'
                  }
                >
                  {delta > 0 ? (
                    <ArrowUpRight size={16} />
                  ) : delta < 0 ? (
                    <ArrowDownRight size={16} />
                  ) : (
                    <Minus size={16} />
                  )}
                  {formatMoney(delta, { sign: true })}
                </span>
              </p>
            ) : (
              <p className="mt-2 text-sm text-muted">
                暂无{formatMonthLabel(compareMonth)}快照，无法对比。
              </p>
            )}
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:w-auto">
            <StatChip
              icon={<TrendingUp size={16} />}
              label={`${formatMonthLabel(selectedMonth)}收入`}
              value={formatMoney(monthStats.income)}
              tone="income"
            />
            <StatChip
              icon={<TrendingDown size={16} />}
              label={`${formatMonthLabel(selectedMonth)}支出`}
              value={formatMoney(monthStats.expense)}
              tone="expense"
            />
            <StatChip
              icon={<TrendingUp size={16} />}
              label={`${formatMonthLabel(compareMonth)}收入`}
              value={formatMoney(compareStats.income)}
              tone="income"
            />
            <StatChip
              icon={<TrendingDown size={16} />}
              label={`${formatMonthLabel(compareMonth)}支出`}
              value={formatMoney(compareStats.expense)}
              tone="expense"
            />
          </div>
        </div>
      </section>

      <section className="panel rounded-3xl p-4 sm:p-5">
        <div className="mb-2 flex items-center gap-2">
          <Activity size={18} className="text-[var(--color-accent)]" />
          <h2 className="font-display text-lg font-semibold">每月总资产</h2>
        </div>
        <p className="mb-3 text-xs text-muted">
          点选折线可切换查看月份；也可使用上方月份选择器。
        </p>
        <AssetMonthChart
          points={monthPoints}
          selectedMonth={selectedMonth}
          onSelectMonth={setSelectedMonth}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="panel rounded-3xl p-4 sm:p-5">
          <div className="mb-2 flex items-center gap-2">
            <Wallet size={18} className="text-[var(--color-accent)]" />
            <h2 className="font-display text-lg font-semibold">
              {isCurrentMonth
                ? '当前资产分布'
                : `${formatMonthLabel(selectedMonth)}资产分布`}
            </h2>
          </div>
          {!isCurrentMonth && selectedSnap && (
            <p className="mb-1 text-xs text-muted">
              快照日 {selectedSnap.snapshotDate}
            </p>
          )}
          {!isCurrentMonth && !selectedSnap ? (
            <p className="py-10 text-center text-sm text-muted">
              该月暂无资产快照
            </p>
          ) : (
            <>
              <AssetPieChart accounts={selectedDistribution} />
              <DistributionList
                items={selectedDistribution.map((a) => ({
                  key: a.accountId || a.name,
                  name: a.name,
                  balance: a.balance,
                  color: a.color,
                }))}
              />
            </>
          )}
        </div>

        {compareSnap && compareSnap.distribution.length > 0 ? (
          <div className="panel rounded-3xl p-4 sm:p-5">
            <div className="mb-2 flex items-center gap-2">
              <Wallet size={18} className="text-[var(--color-accent)]" />
              <h2 className="font-display text-lg font-semibold">
                {formatMonthLabel(compareMonth)}末分布
              </h2>
            </div>
            <p className="mb-1 text-xs text-muted">
              快照日 {compareSnap.snapshotDate}
            </p>
            <AssetPieChart accounts={compareSnap.distribution} />
            <DistributionList
              items={compareSnap.distribution.map((a) => ({
                key: a.accountId || a.name,
                name: a.name,
                balance: a.balance,
                color: a.color,
              }))}
            />
          </div>
        ) : (
          <div className="panel hidden rounded-3xl p-4 sm:p-5 md:block">
            <div className="mb-2 flex items-center gap-2">
              <Activity size={18} className="text-[var(--color-accent)]" />
              <h2 className="font-display text-lg font-semibold">近 14 日收支</h2>
            </div>
            <TrendLineChart transactions={trendTx} days={TREND_DAYS} />
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">账户余额（当前）</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {accounts.map((account) => (
            <AccountCard key={account.id} account={account} />
          ))}
        </div>
      </section>

      <section className="panel rounded-3xl p-4 sm:p-5">
        <h2 className="font-display mb-3 text-lg font-semibold sm:mb-4">最近流水</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-muted">暂无流水，点右下角 + 快速记一笔。</p>
        ) : (
          <ul className="divide-y divide-[var(--color-line)]">
            {recent.map((t) => (
              <li
                key={t.id}
                className="flex min-h-12 items-center justify-between gap-3 py-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{t.category || '未分类'}</p>
                  <p className="truncate text-muted">
                    {formatDate(t.date)}
                    {t.note ? ` · ${t.note}` : ''}
                  </p>
                </div>
                <span
                  className={
                    t.type === 'income'
                      ? 'shrink-0 font-medium text-[var(--color-income)]'
                      : t.type === 'expense'
                        ? 'shrink-0 font-medium text-[var(--color-expense)]'
                        : 'shrink-0 font-medium text-muted'
                  }
                >
                  {t.type === 'income' ? '+' : t.type === 'expense' ? '-' : ''}
                  {formatMoney(t.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function StatChip({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode
  label: string
  value: string
  tone: 'income' | 'expense'
}) {
  return (
    <div className="rounded-2xl border border-[var(--color-line)] px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-xs text-muted">
        {icon}
        {label}
      </div>
      <p
        className={
          tone === 'income'
            ? 'mt-1 font-medium text-[var(--color-income)]'
            : 'mt-1 font-medium text-[var(--color-expense)]'
        }
      >
        {value}
      </p>
    </div>
  )
}

function DistributionList({
  items,
}: {
  items: { key: string; name: string; balance: number; color: string }[]
}) {
  return (
    <ul className="mt-2 space-y-1.5">
      {[...items]
        .filter((a) => a.balance !== 0)
        .sort((a, b) => b.balance - a.balance)
        .map((a) => (
          <li key={a.key} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: a.color }}
              />
              {a.name}
            </span>
            <span className="text-muted">{formatMoney(a.balance)}</span>
          </li>
        ))}
    </ul>
  )
}
