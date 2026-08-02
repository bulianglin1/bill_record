import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Scale, Search } from 'lucide-react'
import { listAccounts, roundMoney } from '@/services/accountService'
import {
  currentYearMonth,
  shiftMonth,
} from '@/services/cloudAssetSnapshotService'
import {
  listMonthlySurplus,
  recalculateAllAccountsForMonths,
  recalculateMonthlySurplus,
} from '@/services/monthlySurplusService'
import type { Account, MonthlyAccountSurplus } from '@/types'
import { formatMoney } from '@/utils/format'

const MONTH_OPTIONS_COUNT = 18
const DEFAULT_ACCOUNT_NAME = '微信'

interface MonthlySurplusPageProps {
  refreshKey?: number
}

interface MonthSummary {
  yearMonth: string
  income: number
  expense: number
  net: number
  items: Array<MonthlyAccountSurplus & { accountName: string }>
}

function buildMonthOptions(endMonth: string, months = MONTH_OPTIONS_COUNT): string[] {
  const list: string[] = []
  for (let i = months - 1; i >= 0; i -= 1) {
    list.push(shiftMonth(endMonth, -i))
  }
  return list
}

function formatMonthLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split('-')
  return `${y}年${Number(m)}月`
}

function formatUpdatedAt(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`
}

/** 默认优先「微信」，否则第一个账户；已有合法选择则保留 */
function pickDefaultAccountId(accs: Account[], currentId: string): string {
  if (currentId && accs.some((a) => a.id === currentId)) {
    return currentId
  }
  const wechat = accs.find((a) => a.name === DEFAULT_ACCOUNT_NAME)
  return wechat?.id ?? accs[0]?.id ?? ''
}

function buildMonthSummaries(
  allRows: MonthlyAccountSurplus[],
  accountMap: Map<string, string>,
): MonthSummary[] {
  const byMonth = new Map<string, MonthlyAccountSurplus[]>()
  for (const row of allRows) {
    const list = byMonth.get(row.yearMonth) ?? []
    list.push(row)
    byMonth.set(row.yearMonth, list)
  }

  return [...byMonth.keys()]
    .sort((a, b) => b.localeCompare(a))
    .map((yearMonth) => {
      const items = (byMonth.get(yearMonth) ?? [])
        .map((row) => ({
          ...row,
          accountName: accountMap.get(row.accountId) ?? row.accountId,
        }))
        .sort((a, b) => a.accountName.localeCompare(b.accountName, 'zh-CN'))
      let income = 0
      let expense = 0
      let net = 0
      for (const item of items) {
        income += item.income
        expense += item.expense
        net += item.net
      }
      return {
        yearMonth,
        income: roundMoney(income),
        expense: roundMoney(expense),
        net: roundMoney(net),
        items,
      }
    })
}

export function MonthlySurplusPage({ refreshKey = 0 }: MonthlySurplusPageProps) {
  const thisMonth = currentYearMonth()
  const monthOptions = useMemo(
    () => buildMonthOptions(thisMonth, MONTH_OPTIONS_COUNT),
    [thisMonth],
  )

  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountId, setAccountId] = useState('')
  const [selectedMonths, setSelectedMonths] = useState<string[]>([thisMonth])
  const [allRows, setAllRows] = useState<MonthlyAccountSurplus[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const accountMap = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.name])),
    [accounts],
  )

  const rows = useMemo(
    () =>
      allRows
        .filter((r) => r.accountId === accountId)
        .sort((a, b) => b.yearMonth.localeCompare(a.yearMonth)),
    [allRows, accountId],
  )

  const monthSummaries = useMemo(
    () => buildMonthSummaries(allRows, accountMap),
    [allRows, accountMap],
  )

  async function loadSurplus() {
    const months = [...selectedMonths].sort()
    const opts =
      months.length > 0
        ? {
            startMonth: months[0],
            endMonth: months[months.length - 1],
          }
        : undefined

    const list = await listMonthlySurplus(opts)
    const filtered =
      months.length > 0
        ? list.filter((r) => months.includes(r.yearMonth))
        : list

    setAllRows(filtered)
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const accs = await listAccounts()
        if (cancelled) return
        setAccounts(accs)
        const nextId = pickDefaultAccountId(accs, '')
        setAccountId(nextId)
        await loadSurplus()
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '加载失败')
        }
      }
    })()
    return () => {
      cancelled = true
    }
    // 仅随 refreshKey 首载；查询走按钮
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  function toggleMonth(ym: string) {
    setSelectedMonths((prev) =>
      prev.includes(ym) ? prev.filter((m) => m !== ym) : [...prev, ym].sort(),
    )
  }

  function selectRecent(count: number) {
    setSelectedMonths(monthOptions.slice(-count))
  }

  async function handleQuery() {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await loadSurplus()
      setMessage(
        selectedMonths.length > 0
          ? `已查询 ${selectedMonths.length} 个月份的云端结余`
          : '已查询全部已存结余',
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : '查询失败')
    } finally {
      setBusy(false)
    }
  }

  async function handleUpdateCurrentAccount() {
    if (!accountId) {
      setError('请选择账户')
      return
    }
    if (selectedMonths.length === 0) {
      setError('请至少选择一个月')
      return
    }
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const list = await recalculateMonthlySurplus(accountId, selectedMonths)
      await loadSurplus()
      setMessage(`已更新当前账户 ${list.length} 个月份的结余`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新失败')
    } finally {
      setBusy(false)
    }
  }

  async function handleUpdateAllAccounts() {
    if (accounts.length === 0) {
      setError('没有可更新的账户')
      return
    }
    if (selectedMonths.length === 0) {
      setError('请至少选择一个月')
      return
    }
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const count = await recalculateAllAccountsForMonths(
        accounts.map((a) => a.id),
        selectedMonths,
      )
      await loadSurplus()
      setMessage(`已更新全部账户，共写入 ${count} 条结余`)
    } catch (err) {
      try {
        await loadSurplus()
      } catch {
        // 忽略刷新失败
      }
      setError(err instanceof Error ? err.message : '批量更新失败')
    } finally {
      setBusy(false)
    }
  }

  const accountName =
    accounts.find((a) => a.id === accountId)?.name ?? '账户'

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display flex items-center gap-2 text-2xl font-semibold">
          <Scale size={22} className="text-[var(--color-accent)]" />
          月结余
        </h1>
        <p className="mt-1 text-sm text-muted">
          按账户从流水重算收入 − 支出并写入云端；转账不计。可多选历史月手动更新。
        </p>
      </div>

      <section className="panel space-y-3 rounded-3xl p-4 sm:p-5">
        <label className="block text-sm">
          <span className="mb-1 block text-muted">账户</span>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-[var(--color-line)] bg-transparent px-3 py-2"
          >
            {accounts.length === 0 ? (
              <option value="">暂无账户</option>
            ) : (
              accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))
            )}
          </select>
        </label>

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted">选择月份（可多选）</p>
            <div className="flex flex-wrap gap-1.5">
              <QuickBtn label="近3月" onClick={() => selectRecent(3)} disabled={busy} />
              <QuickBtn label="近6月" onClick={() => selectRecent(6)} disabled={busy} />
              <QuickBtn label="近12月" onClick={() => selectRecent(12)} disabled={busy} />
              <QuickBtn
                label="全选"
                onClick={() => setSelectedMonths([...monthOptions])}
                disabled={busy}
              />
              <QuickBtn
                label="清空"
                onClick={() => setSelectedMonths([])}
                disabled={busy}
              />
            </div>
          </div>
          <div className="grid max-h-48 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4 md:grid-cols-6">
            {monthOptions.map((ym) => {
              const checked = selectedMonths.includes(ym)
              return (
                <label
                  key={ym}
                  className={
                    checked
                      ? 'flex cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--color-accent)] bg-[color-mix(in_oklab,var(--color-accent)_12%,transparent)] px-2 py-2 text-xs'
                      : 'flex cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--color-line)] px-2 py-2 text-xs'
                  }
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={busy}
                    onChange={() => toggleMonth(ym)}
                  />
                  <span>{formatMonthLabel(ym)}</span>
                </label>
              )
            })}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleQuery()}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--color-line)] px-4 text-sm disabled:opacity-50"
          >
            <Search size={16} />
            查询
          </button>
          <button
            type="button"
            disabled={busy || !accountId || selectedMonths.length === 0}
            onClick={() => void handleUpdateCurrentAccount()}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--color-accent)] px-4 text-sm font-medium text-white disabled:opacity-50"
          >
            <RefreshCw size={16} className={busy ? 'animate-spin' : ''} />
            更新所选月份
          </button>
          <button
            type="button"
            disabled={busy || accounts.length === 0 || selectedMonths.length === 0}
            onClick={() => void handleUpdateAllAccounts()}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--color-line)] px-4 text-sm disabled:opacity-50"
          >
            更新全部账户的所选月份
          </button>
        </div>
      </section>

      <section className="panel space-y-3 rounded-3xl p-4 sm:p-5">
        <h2 className="font-display text-lg font-semibold">全部账户结余汇总</h2>
        <p className="text-xs text-muted">
          按勾选月份汇总各账户云端结余（未勾选月份时显示全部已存）。点「查询」刷新。
        </p>
        {monthSummaries.length === 0 ? (
          <p className="text-sm text-muted">暂无汇总数据，请先更新或调整月份后查询。</p>
        ) : (
          <ul className="space-y-4">
            {monthSummaries.map((summary) => (
              <li
                key={summary.yearMonth}
                className="rounded-2xl border border-[var(--color-line)] px-3 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{formatMonthLabel(summary.yearMonth)}</p>
                  <div className="flex flex-wrap gap-3 text-sm">
                    <span className="text-[var(--color-income)]">
                      收 {formatMoney(summary.income)}
                    </span>
                    <span className="text-[var(--color-expense)]">
                      支 {formatMoney(summary.expense)}
                    </span>
                    <span
                      className={
                        summary.net >= 0
                          ? 'font-medium text-[var(--color-income)]'
                          : 'font-medium text-[var(--color-expense)]'
                      }
                    >
                      合计结余 {formatMoney(summary.net, { sign: true })}
                    </span>
                  </div>
                </div>
                <ul className="mt-2 space-y-1.5 border-t border-[var(--color-line)] pt-2">
                  {summary.items.map((item) => (
                    <li
                      key={`${item.accountId}-${item.yearMonth}`}
                      className="flex flex-wrap items-center justify-between gap-2 text-sm"
                    >
                      <span className="text-muted">{item.accountName}</span>
                      <span
                        className={
                          item.net >= 0
                            ? 'text-[var(--color-income)]'
                            : 'text-[var(--color-expense)]'
                        }
                      >
                        {formatMoney(item.net, { sign: true })}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel space-y-3 rounded-3xl p-4 sm:p-5">
        <h2 className="font-display text-lg font-semibold">
          {accountId ? `${accountName} · 已存结余` : '已存结余'}
        </h2>
        {rows.length === 0 ? (
          <p className="text-sm text-muted">
            该账户暂无云端结余，请勾选月份后更新，或点「查询」刷新。
          </p>
        ) : (
          <ul className="divide-y divide-[var(--color-line)]">
            {rows.map((row) => (
              <li
                key={row.id || `${row.accountId}-${row.yearMonth}`}
                className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
              >
                <div>
                  <p className="font-medium">{formatMonthLabel(row.yearMonth)}</p>
                  <p className="text-xs text-muted">
                    更新于 {formatUpdatedAt(row.updatedAt)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3 text-right">
                  <span className="text-[var(--color-income)]">
                    收 {formatMoney(row.income)}
                  </span>
                  <span className="text-[var(--color-expense)]">
                    支 {formatMoney(row.expense)}
                  </span>
                  <span
                    className={
                      row.net >= 0
                        ? 'font-medium text-[var(--color-income)]'
                        : 'font-medium text-[var(--color-expense)]'
                    }
                  >
                    结余 {formatMoney(row.net, { sign: true })}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {message && (
        <p className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface-elevated)] px-4 py-3 text-sm">
          {message}
        </p>
      )}
      {error && (
        <p className="rounded-2xl border border-[var(--color-danger)] px-4 py-3 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}
    </div>
  )
}

function QuickBtn({
  label,
  onClick,
  disabled,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg border border-[var(--color-line)] px-2 py-1 text-xs text-muted disabled:opacity-50"
    >
      {label}
    </button>
  )
}
