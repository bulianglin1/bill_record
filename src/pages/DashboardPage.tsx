import { useEffect, useMemo, useState, type ReactNode } from 'react'
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
import { TrendLineChart } from '@/components/TrendLineChart'
import { listAccounts, sumBalances } from '@/services/accountService'
import {
  currentYearMonth,
  getLatestSnapshotInMonth,
  listMonthlyLastSnapshots,
  shiftMonth,
  type AssetDistributionItem,
  type AssetSnapshot,
  type MonthAssetPoint,
} from '@/services/cloudAssetSnapshotService'
import { recordTodayAssetSnapshotSafe } from '@/services/assetSnapshotService'
import {
  listTransactions,
  refreshTransactionsFromCloud,
} from '@/services/transactionService'
import type { Account, Transaction } from '@/types'
import { formatMoney, formatDate } from '@/utils/format'

interface DashboardPageProps {
  refreshKey?: number
}

/** 生成可选月份列表（含当前月，向前共 months 个月） */
function buildMonthOptions(endMonth: string, months = 18): string[] {
  const list: string[] = []
  for (let i = months - 1; i >= 0; i -= 1) {
    list.push(shiftMonth(endMonth, -i))
  }
  return list
}

function sumMonthStats(txs: Transaction[], yearMonth: string) {
  let income = 0
  let expense = 0
  for (const t of txs) {
    if (!t.date.startsWith(yearMonth)) continue
    if (t.type === 'income') income += t.amount
    if (t.type === 'expense') expense += t.amount
  }
  return { income, expense }
}

function formatMonthLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split('-')
  return `${y}年${Number(m)}月`
}

export function DashboardPage({ refreshKey = 0 }: DashboardPageProps) {
  const thisMonth = currentYearMonth()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [recent, setRecent] = useState<Transaction[]>([])
  const [allTx, setAllTx] = useState<Transaction[]>([])
  const [selectedMonth, setSelectedMonth] = useState(thisMonth)
  const [monthPoints, setMonthPoints] = useState<MonthAssetPoint[]>([])
  const [selectedSnap, setSelectedSnap] = useState<AssetSnapshot | null>(null)
  const [compareSnap, setCompareSnap] = useState<AssetSnapshot | null>(null)

  const monthOptions = useMemo(() => buildMonthOptions(thisMonth, 18), [thisMonth])
  const compareMonth = shiftMonth(selectedMonth, -1)
  const isCurrentMonth = selectedMonth === thisMonth

  useEffect(() => {
    void (async () => {
      try {
        await refreshTransactionsFromCloud()
      } catch {
        // 列表仍可读本地缓存
      }

      const [accs, all] = await Promise.all([listAccounts(), listTransactions()])
      setAccounts(accs)
      setAllTx(all)
      setRecent(all.slice(0, 8))

      await recordTodayAssetSnapshotSafe()

      try {
        setMonthPoints(await listMonthlyLastSnapshots(12))
      } catch {
        setMonthPoints([])
      }
    })()
  }, [refreshKey])

  // 切换月份时拉取该月 / 对比月快照
  useEffect(() => {
    void (async () => {
      try {
        const [snap, prev] = await Promise.all([
          getLatestSnapshotInMonth(selectedMonth),
          getLatestSnapshotInMonth(compareMonth),
        ])
        setSelectedSnap(snap)
        setCompareSnap(prev)
      } catch {
        setSelectedSnap(null)
        setCompareSnap(null)
      }
    })()
  }, [selectedMonth, compareMonth, refreshKey])

  const monthStats = useMemo(
    () => sumMonthStats(allTx, selectedMonth),
    [allTx, selectedMonth],
  )
  const compareStats = useMemo(
    () => sumMonthStats(allTx, compareMonth),
    [allTx, compareMonth],
  )

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
            <input
              type="month"
              value={selectedMonth}
              max={thisMonth}
              min={monthOptions[0]}
              onChange={(e) => {
                const v = e.target.value
                if (v && v <= thisMonth) setSelectedMonth(v)
              }}
              className="rounded-xl border border-[var(--color-line)] bg-transparent px-3 py-2 text-sm font-medium"
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
            <TrendLineChart transactions={allTx} days={14} />
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
