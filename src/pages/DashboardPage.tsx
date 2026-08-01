import { useEffect, useState, type ReactNode } from 'react'
import { Activity, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { AccountCard } from '@/components/AccountCard'
import { AssetPieChart } from '@/components/AssetPieChart'
import { TrendLineChart } from '@/components/TrendLineChart'
import { listAccounts, sumBalances } from '@/services/accountService'
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

  useEffect(() => {
    void (async () => {
      try {
        await refreshTransactionsFromCloud()
      } catch {
        // 列表仍可读本地缓存；记账时会强制联网
      }
      const [accs, all] = await Promise.all([listAccounts(), listTransactions()])
      setAccounts(accs)
      setAllTx(all)
      setRecent(all.slice(0, 8))

      const monthKey = new Date().toISOString().slice(0, 7)
      let income = 0
      let expense = 0
      for (const t of all) {
        if (!t.date.startsWith(monthKey)) continue
        if (t.type === 'income') income += t.amount
        if (t.type === 'expense') expense += t.amount
      }
      setMonthStats({ income, expense })
    })()
  }, [refreshKey])

  const total = sumBalances(accounts)

  return (
    <div className="space-y-4 md:space-y-6">
      <section className="panel rounded-3xl p-4 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted">总资产</p>
            <p className="font-display mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
              {formatMoney(total)}
            </p>
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

      {/* 宽屏：饼图 + 折线图并排；手机：仅饼图 */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="panel rounded-3xl p-4 sm:p-5">
          <div className="mb-2 flex items-center gap-2">
            <Wallet size={18} className="text-[var(--color-accent)]" />
            <h2 className="font-display text-lg font-semibold">资产分布</h2>
          </div>
          <AssetPieChart accounts={accounts} />
          <ul className="mt-2 space-y-1.5">
            {accounts
              .filter((a) => a.balance !== 0)
              .map((a) => (
                <li key={a.id} className="flex items-center justify-between text-sm">
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
        </div>

        <div className="panel hidden rounded-3xl p-4 sm:p-5 md:block">
          <div className="mb-2 flex items-center gap-2">
            <Activity size={18} className="text-[var(--color-accent)]" />
            <h2 className="font-display text-lg font-semibold">近 14 日趋势</h2>
          </div>
          <TrendLineChart transactions={allTx} days={14} />
        </div>
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
