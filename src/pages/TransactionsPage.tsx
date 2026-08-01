import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowDownUp, CalendarRange, Plus, Trash2 } from 'lucide-react'
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
} from '@/lib/constants'
import { listAccounts } from '@/services/accountService'
import {
  createTransaction,
  deleteTransaction,
  listTransactions,
  refreshTransactionsFromCloud,
} from '@/services/transactionService'
import type { Account, Transaction, TransactionType } from '@/types'
import { formatMoney, formatDate, todayIsoDate } from '@/utils/format'

interface TransactionsPageProps {
  refreshKey?: number
}

type SortKey = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc'

export function TransactionsPage({ refreshKey = 0 }: TransactionsPageProps) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const [filterAccountId, setFilterAccountId] = useState('')
  /** YYYY-MM；空字符串表示不限月份 */
  const [filterMonth, setFilterMonth] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('date_desc')

  const [form, setForm] = useState({
    date: todayIsoDate(),
    amount: '',
    type: 'expense' as TransactionType,
    accountId: '',
    toAccountId: '',
    category: EXPENSE_CATEGORIES[0] as string,
    note: '',
  })

  async function refresh() {
    try {
      await refreshTransactionsFromCloud()
    } catch {
      // 展示本地缓存；写入仍要求联网
    }
    const [accs, txs] = await Promise.all([
      listAccounts(),
      listTransactions({
        accountId: filterAccountId || undefined,
      }),
    ])
    setAccounts(accs)
    setTransactions(txs)
    if (!form.accountId && accs[0]) {
      setForm((prev) => ({ ...prev, accountId: accs[0]!.id }))
    }
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterAccountId, refreshKey])

  const categories = useMemo(() => {
    if (form.type === 'income') return INCOME_CATEGORIES
    if (form.type === 'transfer') return ['转账'] as const
    return EXPENSE_CATEGORIES
  }, [form.type])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await createTransaction({
        date: form.date,
        amount: Number(form.amount),
        type: form.type,
        accountId: form.accountId,
        toAccountId: form.type === 'transfer' ? form.toAccountId : undefined,
        category: form.category,
        note: form.note,
      })
      setShowForm(false)
      setForm((prev) => ({
        ...prev,
        amount: '',
        note: '',
        date: todayIsoDate(),
      }))
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('确认删除该笔流水？余额将回滚。')) return
    await deleteTransaction(id)
    await refresh()
  }

  const accountMap = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.name])),
    [accounts],
  )

  const filteredTransactions = useMemo(() => {
    if (!filterMonth) return transactions
    return transactions.filter((t) => t.date.startsWith(filterMonth))
  }, [transactions, filterMonth])

  const summary = useMemo(() => {
    let income = 0
    let expense = 0
    let incomeCount = 0
    let expenseCount = 0
    let transferCount = 0
    for (const t of filteredTransactions) {
      if (t.type === 'income') {
        income += t.amount
        incomeCount += 1
      } else if (t.type === 'expense') {
        expense += t.amount
        expenseCount += 1
      } else {
        transferCount += 1
      }
    }
    return {
      total: filteredTransactions.length,
      income,
      expense,
      incomeCount,
      expenseCount,
      transferCount,
      net: Math.round((income - expense) * 100) / 100,
    }
  }, [filteredTransactions])

  const sortedTransactions = useMemo(() => {
    const rows = [...filteredTransactions]
    rows.sort((a, b) => {
      if (sortKey === 'date_asc') {
        if (a.date === b.date) return a.createdAt.localeCompare(b.createdAt)
        return a.date.localeCompare(b.date)
      }
      if (sortKey === 'amount_desc') {
        if (a.amount !== b.amount) return b.amount - a.amount
        return b.date.localeCompare(a.date)
      }
      if (sortKey === 'amount_asc') {
        if (a.amount !== b.amount) return a.amount - b.amount
        return b.date.localeCompare(a.date)
      }
      // date_desc（默认）
      if (a.date === b.date) return b.createdAt.localeCompare(a.createdAt)
      return b.date.localeCompare(a.date)
    })
    return rows
  }, [filteredTransactions, sortKey])

  function applyThisMonth() {
    setFilterMonth(todayIsoDate().slice(0, 7))
  }

  function clearDateFilters() {
    setFilterMonth('')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">流水记录</h1>
          <p className="mt-1 text-sm text-muted">记录收入、支出与账户间转账</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white"
        >
          <Plus size={16} />
          记一笔
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={filterAccountId}
          onChange={(e) => setFilterAccountId(e.target.value)}
          className="panel rounded-xl px-3 py-2 text-sm"
        >
          <option value="">全部账户</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <label className="panel inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm">
          <CalendarRange size={14} className="text-muted" />
          <span className="text-muted">月份</span>
          <input
            type="month"
            value={filterMonth}
            max={todayIsoDate().slice(0, 7)}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="bg-transparent outline-none"
            aria-label="按月份筛选"
          />
        </label>
        <button
          type="button"
          onClick={applyThisMonth}
          className="rounded-xl border border-[var(--color-line)] px-3 py-2 text-sm text-muted"
        >
          本月
        </button>
        <button
          type="button"
          onClick={clearDateFilters}
          className="rounded-xl border border-[var(--color-line)] px-3 py-2 text-sm text-muted"
        >
          全部日期
        </button>
        <label className="panel inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm">
          <ArrowDownUp size={14} className="text-muted" />
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="bg-transparent outline-none"
            aria-label="排序"
          >
            <option value="date_desc">日期从新到旧</option>
            <option value="date_asc">日期从旧到新</option>
            <option value="amount_desc">金额从大到小</option>
            <option value="amount_asc">金额从小到大</option>
          </select>
        </label>
      </div>

      <section className="panel grid grid-cols-2 gap-3 rounded-3xl p-4 sm:grid-cols-4">
        <SummaryItem label="笔数" value={`${summary.total} 笔`} />
        <SummaryItem
          label={`收入（${summary.incomeCount}）`}
          value={formatMoney(summary.income)}
          tone="income"
        />
        <SummaryItem
          label={`支出（${summary.expenseCount}）`}
          value={formatMoney(summary.expense)}
          tone="expense"
        />
        <SummaryItem
          label="结余"
          value={formatMoney(summary.net, { sign: true })}
          tone={summary.net >= 0 ? 'income' : 'expense'}
        />
      </section>

      {showForm && (
        <form onSubmit={handleSubmit} className="panel space-y-3 rounded-3xl p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="日期">
              <input
                type="date"
                required
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="field-input"
              />
            </Field>
            <Field label="金额">
              <input
                type="number"
                required
                min="0.01"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="field-input"
                placeholder="0.00"
              />
            </Field>
            <Field label="类型">
              <select
                value={form.type}
                onChange={(e) => {
                  const type = e.target.value as TransactionType
                  setForm({
                    ...form,
                    type,
                    category:
                      type === 'income'
                        ? INCOME_CATEGORIES[0]
                        : type === 'transfer'
                          ? '转账'
                          : EXPENSE_CATEGORIES[0],
                  })
                }}
                className="field-input"
              >
                <option value="expense">支出</option>
                <option value="income">收入</option>
                <option value="transfer">转账</option>
              </select>
            </Field>
            <Field label={form.type === 'transfer' ? '转出账户' : '账户'}>
              <select
                required
                value={form.accountId}
                onChange={(e) => setForm({ ...form, accountId: e.target.value })}
                className="field-input"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
            {form.type === 'transfer' && (
              <Field label="转入账户">
                <select
                  required
                  value={form.toAccountId}
                  onChange={(e) => setForm({ ...form, toAccountId: e.target.value })}
                  className="field-input"
                >
                  <option value="">请选择</option>
                  {accounts
                    .filter((a) => a.id !== form.accountId)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </select>
              </Field>
            )}
            <Field label="类别">
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="field-input"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="备注">
              <input
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                className="field-input"
                placeholder="可选"
              />
            </Field>
          </div>

          {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-xl border border-[var(--color-line)] px-4 py-2 text-sm"
            >
              取消
            </button>
            <button
              type="submit"
              className="rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white"
            >
              保存
            </button>
          </div>
        </form>
      )}

      <div className="panel overflow-hidden rounded-3xl">
        {sortedTransactions.length === 0 ? (
          <p className="p-6 text-sm text-muted">暂无流水</p>
        ) : (
          <ul className="divide-y divide-[var(--color-line)]">
            {sortedTransactions.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{t.category}</span>
                    <span className="rounded-md bg-[color-mix(in_oklab,var(--color-line)_80%,transparent)] px-1.5 py-0.5 text-xs text-muted">
                      {t.type === 'expense' ? '支出' : t.type === 'income' ? '收入' : '转账'}
                    </span>
                    {t.source && t.source !== 'manual' && (
                      <span className="text-xs text-muted">{t.source}</span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-sm text-muted">
                    {formatDate(t.date)} · {accountMap.get(t.accountId) ?? '未知账户'}
                    {t.toAccountId ? ` → ${accountMap.get(t.toAccountId) ?? ''}` : ''}
                    {t.note ? ` · ${t.note}` : ''}
                  </p>
                </div>
                <span
                  className={
                    t.type === 'income'
                      ? 'shrink-0 font-medium text-[var(--color-income)]'
                      : t.type === 'expense'
                        ? 'shrink-0 font-medium text-[var(--color-expense)]'
                        : 'shrink-0 font-medium'
                  }
                >
                  {t.type === 'income' ? '+' : t.type === 'expense' ? '-' : ''}
                  {formatMoney(t.amount)}
                </span>
                <button
                  type="button"
                  onClick={() => void handleDelete(t.id)}
                  className="rounded-lg p-2 text-muted hover:bg-[color-mix(in_oklab,var(--color-danger)_10%,transparent)] hover:text-[var(--color-danger)]"
                  aria-label="删除"
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <style>{`
        .field-input {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid var(--color-line);
          background: transparent;
          padding: 0.625rem 0.75rem;
          outline: none;
        }
        .field-input:focus {
          box-shadow: 0 0 0 2px var(--color-accent);
        }
      `}</style>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block text-muted">{label}</span>
      {children}
    </label>
  )
}

function SummaryItem({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'income' | 'expense'
}) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p
        className={
          tone === 'income'
            ? 'mt-1 text-sm font-medium text-[var(--color-income)]'
            : tone === 'expense'
              ? 'mt-1 text-sm font-medium text-[var(--color-expense)]'
              : 'mt-1 text-sm font-medium'
        }
      >
        {value}
      </p>
    </div>
  )
}
