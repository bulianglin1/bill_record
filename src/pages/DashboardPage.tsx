import { useEffect, useState, type ReactNode } from 'react'
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
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

export function DashboardPage({ refreshKey = 0 }: DashboardPageProps) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [recent, setRecent] = useState<Transaction[]>([])
  const [allTx, setAllTx] = useState<Transaction[]>([])
  const [monthStats, setMonthStats] = useState({ income: 0, expense: 0 })
  const [monthPoints, setMonthPoints] = useState<MonthAssetPoint[]>([])
  const [prevMonthAssets, setPrevMonthAssets] = useState<number | null>(null)
  const [prevMonthLabel, setPrevMonthLabel] = useState('')
  const [prevSnapshotDate, setPrevSnapshotDate] = useState('')
  const [prevDistribution, setPrevDistribution] = useState<AssetDistributionItem[]>([])

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

      // 刷新当天快照（总资产变动后看板也会再记一次）
      await recordTodayAssetSnapshotSafe()

      const monthKey = currentYearMonth()
      let income = 0
      let expense = 0
      for (const t of all) {
        if (!t.date.startsWith(monthKey)) continue
        if (t.type === 'income') income += t.amount
        if (t.type === 'expense') expense += t.amount
      }
      setMonthStats({ income, expense })

      try {
        const prevKey = shiftMonth(monthKey, -1)
        const [points, prevSnap] = await Promise.all([
          listMonthlyLastSnapshots(12),
          getLatestSnapshotInMonth(prevKey),
        ])
        setMonthPoints(points)
        setPrevMonthLabel(prevKey)
        if (prevSnap) {
          setPrevMonthAssets(prevSnap.totalAssets)
          setPrevSnapshotDate(prevSnap.snapshotDate)
          setPrevDistribution(prevSnap.distribution)
        } else {
          setPrevMonthAssets(null)
          setPrevSnapshotDate('')
          setPrevDistribution([])
        }
      } catch {
        setMonthPoints([])
        setPrevMonthAssets(null)
        setPrevDistribution([])
      }
    })()
  }, [refreshKey])

  const total = sumBalances(accounts)
  const delta =
    prevMonthAssets === null ? null : Math.round((total - prevMonthAssets) * 100) / 100

  return (
    <div className="space-y-4 md:space-y-6">
      <section className="panel rounded-3xl p-4 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted">总资产（当前）</p>
            <p className="font-display mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
              {formatMoney(total)}
            </p>
            {prevMonthAssets !== null && delta !== null ? (
              <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
                <span className="text-muted">
                  较上月末（{prevMonthLabel}，快照 {prevSnapshotDate}）
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
                <span className="text-muted">上月 {formatMoney(prevMonthAssets)}</span>
              </p>
            ) : (
              <p className="mt-2 text-sm text-muted">
                暂无上月快照。持续使用后将按「每月最晚一天」对比。
              </p>
            )}
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:gap-3">
            <StatChip
              icon={<TrendingUp size={16} />}
              label="本月收入"
              value={formatMoney(monthStats.income)}
              tone="income"
            />
            <StatChip
              icon={<TrendingDown size={16} />}
              label="本月支出"
              value={formatMoney(monthStats.expense)}
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
          每天登录或改动资产时更新当日快照（含各账户余额）；每月取该月最晚一天画点，点选可看明细。
        </p>
        <AssetMonthChart points={monthPoints} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="panel rounded-3xl p-4 sm:p-5">
          <div className="mb-2 flex items-center gap-2">
            <Wallet size={18} className="text-[var(--color-accent)]" />
            <h2 className="font-display text-lg font-semibold">当前资产分布</h2>
          </div>
          <AssetPieChart accounts={accounts} />
          <DistributionList
            items={accounts.map((a) => ({
              key: a.id,
              name: a.name,
              balance: a.balance,
              color: a.color,
            }))}
          />
        </div>

        {prevDistribution.length > 0 ? (
          <div className="panel rounded-3xl p-4 sm:p-5">
            <div className="mb-2 flex items-center gap-2">
              <Wallet size={18} className="text-[var(--color-accent)]" />
              <h2 className="font-display text-lg font-semibold">
                上月末分布（{prevMonthLabel}）
              </h2>
            </div>
            <p className="mb-1 text-xs text-muted">快照日 {prevSnapshotDate}</p>
            <AssetPieChart accounts={prevDistribution} />
            <DistributionList
              items={prevDistribution.map((a) => ({
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
        <h2 className="font-display text-lg font-semibold">账户余额</h2>
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
              <li key={t.id} className="flex min-h-12 items-center justify-between gap-3 py-3 text-sm">
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
