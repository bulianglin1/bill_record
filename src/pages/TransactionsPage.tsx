import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { DatePicker } from '@/components/DatePicker'
import { MonthPicker } from '@/components/MonthPicker'
import { SelectField } from '@/components/SelectField'
import { useConfirm } from '@/context/ConfirmContext'
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
} from '@/lib/constants'
import { listAccounts } from '@/services/accountService'
import {
  listMonthlySurplus,
  recalculateMonthlySurplus,
} from '@/services/monthlySurplusService'
import {
  createTransaction,
  deleteTransaction,
  listTransactionsPaged,
  summarizeTransactions,
  type CloudTransactionSummary,
  type TransactionSortKey,
} from '@/services/transactionService'
import type {
  Account,
  MonthlyAccountSurplus,
  Transaction,
  TransactionType,
} from '@/types'
import { formatMoney, formatDate, todayIsoDate } from '@/utils/format'

interface TransactionsPageProps {
  refreshKey?: number
}

const PAGE_SIZE = 20

const EMPTY_SUMMARY: CloudTransactionSummary = {
  total: 0,
  income: 0,
  expense: 0,
  incomeCount: 0,
  expenseCount: 0,
  transferCount: 0,
  net: 0,
}

export function TransactionsPage({ refreshKey = 0 }: TransactionsPageProps) {
  const confirm = useConfirm()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [summary, setSummary] = useState<CloudTransactionSummary>(EMPTY_SUMMARY)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  /** 跳转页输入（与 page 同步展示） */
  const [jumpPageInput, setJumpPageInput] = useState('1')
  const [jumpError, setJumpError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const [filterAccountId, setFilterAccountId] = useState('')
  /** YYYY-MM；空字符串表示不限月份 */
  const [filterMonth, setFilterMonth] = useState('')
  const [sortKey, setSortKey] = useState<TransactionSortKey>('date_desc')
  const [cloudSurplus, setCloudSurplus] = useState<MonthlyAccountSurplus | null>(
    null,
  )
  const [cloudSurplusLoaded, setCloudSurplusLoaded] = useState(false)
  const [cloudSurplusBusy, setCloudSurplusBusy] = useState(false)
  const [cloudSurplusError, setCloudSurplusError] = useState('')

  const [form, setForm] = useState({
    date: todayIsoDate(),
    amount: '',
    type: 'expense' as TransactionType,
    accountId: '',
    toAccountId: '',
    category: EXPENSE_CATEGORIES[0] as string,
    note: '',
  })

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  useEffect(() => {
    setJumpPageInput(String(page))
  }, [page, totalPages])

  function handleJumpToPage() {
    const raw = jumpPageInput.trim()
    const n = Number(raw)
    if (!Number.isInteger(n) || n < 1 || n > totalPages) {
      setJumpError(`请输入 1–${totalPages} 之间的整数页码`)
      setJumpPageInput(String(page))
      return
    }
    setJumpError('')
    setPage(n)
  }

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const filter = {
        accountId: filterAccountId || undefined,
        yearMonth: filterMonth || undefined,
      }
      const [accs, paged, stats] = await Promise.all([
        listAccounts(),
        listTransactionsPaged({
          ...filter,
          page,
          pageSize: PAGE_SIZE,
          sortKey,
        }),
        summarizeTransactions(filter),
      ])
      if (cancelled) return
      setAccounts(accs)
      setTransactions(paged.items)
      setTotal(paged.total)
      setSummary(stats)
      // 删到末页变空时回退一页
      if (paged.items.length === 0 && page > 1 && paged.total > 0) {
        setPage(Math.max(1, Math.ceil(paged.total / PAGE_SIZE)))
        return
      }
      if (accs[0]) {
        setForm((prev) =>
          prev.accountId ? prev : { ...prev, accountId: accs[0]!.id },
        )
      }
    })()

    return () => {
      cancelled = true
    }
  }, [filterAccountId, filterMonth, sortKey, page, refreshKey])

  useEffect(() => {
    if (!filterAccountId || !filterMonth) {
      setCloudSurplus(null)
      setCloudSurplusLoaded(false)
      setCloudSurplusError('')
      return
    }
    let cancelled = false
    setCloudSurplusLoaded(false)
    void (async () => {
      try {
        const list = await listMonthlySurplus({
          accountId: filterAccountId,
          startMonth: filterMonth,
          endMonth: filterMonth,
        })
        if (cancelled) return
        setCloudSurplus(list[0] ?? null)
        setCloudSurplusError('')
      } catch (err) {
        if (!cancelled) {
          setCloudSurplus(null)
          setCloudSurplusError(
            err instanceof Error ? err.message : '加载云端结余失败',
          )
        }
      } finally {
        if (!cancelled) setCloudSurplusLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [filterAccountId, filterMonth, refreshKey])

  async function handleUpdateCloudSurplus() {
    if (!filterAccountId || !filterMonth) return
    setCloudSurplusBusy(true)
    setCloudSurplusError('')
    try {
      const list = await recalculateMonthlySurplus(filterAccountId, [
        filterMonth,
      ])
      setCloudSurplus(list.find((r) => r.yearMonth === filterMonth) ?? null)
      setCloudSurplusLoaded(true)
    } catch (err) {
      setCloudSurplusError(err instanceof Error ? err.message : '更新云端结余失败')
    } finally {
      setCloudSurplusBusy(false)
    }
  }

  async function refresh() {
    const filter = {
      accountId: filterAccountId || undefined,
      yearMonth: filterMonth || undefined,
    }
    const [accs, paged, stats] = await Promise.all([
      listAccounts(),
      listTransactionsPaged({
        ...filter,
        page,
        pageSize: PAGE_SIZE,
        sortKey,
      }),
      summarizeTransactions(filter),
    ])
    setAccounts(accs)
    setTransactions(paged.items)
    setTotal(paged.total)
    setSummary(stats)
    if (paged.items.length === 0 && page > 1 && paged.total > 0) {
      setPage(Math.max(1, Math.ceil(paged.total / PAGE_SIZE)))
    }
    if (!form.accountId && accs[0]) {
      setForm((prev) => ({ ...prev, accountId: accs[0]!.id }))
    }
  }

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
    const ok = await confirm({
      title: '删除流水',
      message: '确认删除该笔流水？账户余额将回滚。',
      confirmText: '删除',
      danger: true,
    })
    if (!ok) return
    await deleteTransaction(id)
    await refresh()
  }

  const accountMap = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.name])),
    [accounts],
  )

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

      <div className="grid grid-cols-3 gap-2">
        <SelectField
          value={filterAccountId}
          onChange={(v) => {
            setPage(1)
            setFilterAccountId(v)
          }}
          aria-label="按账户筛选"
          className="min-w-0"
          options={[
            { value: '', label: '全部账户' },
            ...accounts.map((a) => ({ value: a.id, label: a.name })),
          ]}
        />
        <MonthPicker
          value={filterMonth}
          max={todayIsoDate().slice(0, 7)}
          allowClear
          placeholder="全部月份"
          aria-label="按月份筛选"
          className="min-w-0"
          buttonClassName="w-full justify-between"
          onChange={(v) => {
            setPage(1)
            setFilterMonth(v)
          }}
        />
        <SelectField
          value={sortKey}
          onChange={(v) => {
            setPage(1)
            setSortKey(v as TransactionSortKey)
          }}
          aria-label="排序"
          className="min-w-0"
          options={[
            { value: 'date_desc', label: '日期新→旧' },
            { value: 'date_asc', label: '日期旧→新' },
            { value: 'amount_desc', label: '金额大→小' },
            { value: 'amount_asc', label: '金额小→大' },
          ]}
        />
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

      {filterAccountId && filterMonth && (
        <section className="panel space-y-2 rounded-3xl p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">云端月结余</p>
              <p className="text-xs text-muted">
                与上方即时汇总独立；需手动更新后才会写入云端
              </p>
            </div>
            <button
              type="button"
              disabled={cloudSurplusBusy}
              onClick={() => void handleUpdateCloudSurplus()}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[var(--color-line)] px-3 text-sm disabled:opacity-50"
            >
              <RefreshCw
                size={14}
                className={cloudSurplusBusy ? 'animate-spin' : ''}
              />
              更新本月结余
            </button>
          </div>
          {!cloudSurplusLoaded ? (
            <p className="text-sm text-muted">加载中…</p>
          ) : cloudSurplus ? (
            <p className="text-sm">
              <span className="text-[var(--color-income)]">
                收 {formatMoney(cloudSurplus.income)}
              </span>
              {' · '}
              <span className="text-[var(--color-expense)]">
                支 {formatMoney(cloudSurplus.expense)}
              </span>
              {' · '}
              <span
                className={
                  cloudSurplus.net >= 0
                    ? 'font-medium text-[var(--color-income)]'
                    : 'font-medium text-[var(--color-expense)]'
                }
              >
                结余 {formatMoney(cloudSurplus.net, { sign: true })}
              </span>
            </p>
          ) : (
            <p className="text-sm text-muted">尚未更新</p>
          )}
          {cloudSurplusError && (
            <p className="text-sm text-[var(--color-danger)]">{cloudSurplusError}</p>
          )}
        </section>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="panel space-y-3 rounded-3xl p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="日期">
              <DatePicker
                value={form.date}
                max={todayIsoDate()}
                onChange={(date) => setForm({ ...form, date })}
                aria-label="记账日期"
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
              <SelectField
                value={form.type}
                onChange={(type) => {
                  setForm({
                    ...form,
                    type: type as TransactionType,
                    category:
                      type === 'income'
                        ? INCOME_CATEGORIES[0]
                        : type === 'transfer'
                          ? '转账'
                          : EXPENSE_CATEGORIES[0],
                  })
                }}
                aria-label="流水类型"
                options={[
                  { value: 'expense', label: '支出' },
                  { value: 'income', label: '收入' },
                  { value: 'transfer', label: '转账' },
                ]}
              />
            </Field>
            <Field label={form.type === 'transfer' ? '转出账户' : '账户'}>
              <SelectField
                value={form.accountId}
                onChange={(accountId) => setForm({ ...form, accountId })}
                aria-label={form.type === 'transfer' ? '转出账户' : '账户'}
                placeholder="请选择账户"
                options={accounts.map((a) => ({ value: a.id, label: a.name }))}
              />
            </Field>
            {form.type === 'transfer' && (
              <Field label="转入账户">
                <SelectField
                  value={form.toAccountId}
                  onChange={(toAccountId) => setForm({ ...form, toAccountId })}
                  aria-label="转入账户"
                  placeholder="请选择"
                  options={[
                    { value: '', label: '请选择' },
                    ...accounts
                      .filter((a) => a.id !== form.accountId)
                      .map((a) => ({ value: a.id, label: a.name })),
                  ]}
                />
              </Field>
            )}
            <Field label="类别">
              <SelectField
                value={form.category}
                onChange={(category) => setForm({ ...form, category })}
                aria-label="类别"
                options={categories.map((c) => ({ value: c, label: c }))}
              />
            </Field>
            <Field label="备注">
              <input
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                className="field-input"
                placeholder="可选备注"
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
        {transactions.length === 0 ? (
          <p className="p-6 text-sm text-muted">暂无流水</p>
        ) : (
          <ul className="divide-y divide-[var(--color-line)]">
            {transactions.map((t) => (
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

      {total > 0 && (
        <div className="space-y-1 px-1 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-muted">
              共 {total} 笔 · 第 {page} / {totalPages} 页（每页 {PAGE_SIZE}）
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-[var(--color-line)] px-3 disabled:opacity-40"
              >
                <ChevronLeft size={16} />
                上一页
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-[var(--color-line)] px-3 disabled:opacity-40"
              >
                下一页
                <ChevronRight size={16} />
              </button>
              <form
                className="flex items-center gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault()
                  handleJumpToPage()
                }}
              >
                <span className="text-muted">到</span>
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  inputMode="numeric"
                  value={jumpPageInput}
                  onChange={(e) => {
                    setJumpError('')
                    setJumpPageInput(e.target.value)
                  }}
                  className="min-h-10 w-16 rounded-xl border border-[var(--color-line)] bg-transparent px-2 text-center outline-none"
                  aria-label="跳转页码"
                />
                <span className="text-muted">页</span>
                <button
                  type="submit"
                  className="inline-flex min-h-10 items-center rounded-xl border border-[var(--color-line)] px-3"
                >
                  跳转
                </button>
              </form>
            </div>
          </div>
          {jumpError && (
            <p className="text-[var(--color-danger)]">{jumpError}</p>
          )}
        </div>
      )}

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
