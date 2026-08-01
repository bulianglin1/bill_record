import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Plus } from 'lucide-react'
import {
  createAccount,
  deleteAccount,
  listAccounts,
  sumBalances,
  updateAccount,
} from '@/services/accountService'
import type { Account, AccountType } from '@/types'
import { formatMoney } from '@/utils/format'
import { AccountCard } from '@/components/AccountCard'

const COLORS = ['#0d9488', '#7C3AED', '#0EA5E9', '#DC2626', '#EF4444', '#1677FF', '#07C160', '#F59E0B']

interface AccountsPageProps {
  refreshKey?: number
}

export function AccountsPage({ refreshKey = 0 }: AccountsPageProps) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [editing, setEditing] = useState<Account | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    name: '',
    type: 'bank' as AccountType,
    balance: '0',
    color: COLORS[0],
  })

  async function refresh() {
    setAccounts(await listAccounts())
  }

  useEffect(() => {
    void refresh()
  }, [refreshKey])

  function openCreate() {
    setEditing(null)
    setForm({ name: '', type: 'bank', balance: '0', color: COLORS[0] })
    setShowForm(true)
    setError('')
  }

  function openEdit(account: Account) {
    setEditing(account)
    setForm({
      name: account.name,
      type: account.type,
      balance: String(account.balance),
      color: account.color,
    })
    setShowForm(true)
    setError('')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      if (editing) {
        await updateAccount(editing.id, {
          name: form.name,
          type: form.type,
          balance: Number(form.balance),
          color: form.color,
        })
      } else {
        await createAccount({
          name: form.name,
          type: form.type,
          balance: Number(form.balance),
          color: form.color,
        })
      }
      setShowForm(false)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    }
  }

  async function handleDelete() {
    if (!editing) return
    if (!confirm(`确认删除账户「${editing.name}」？`)) return
    try {
      await deleteAccount(editing.id)
      setShowForm(false)
      setEditing(null)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败')
    }
  }

  const totalAssets = sumBalances(accounts)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">多账户管理</h1>
          <p className="mt-1 text-sm text-muted">银行、支付宝、微信等资产入口</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white"
        >
          <Plus size={16} />
          添加账户
        </button>
      </div>

      <section className="panel rounded-3xl px-5 py-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-muted">账户汇总</p>
            <p className="font-display mt-1 text-3xl font-semibold tracking-tight">
              {formatMoney(totalAssets)}
            </p>
          </div>
          <p className="text-sm text-muted">共 {accounts.length} 个账户</p>
        </div>
      </section>

      {showForm && (
        <form onSubmit={handleSubmit} className="panel space-y-3 rounded-3xl p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="账户名称">
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-xl border border-[var(--color-line)] bg-transparent px-3 py-2.5 outline-none ring-[var(--color-accent)] focus:ring-2"
              />
            </Field>
            <Field label="类型">
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as AccountType })}
                className="w-full rounded-xl border border-[var(--color-line)] bg-transparent px-3 py-2.5 outline-none ring-[var(--color-accent)] focus:ring-2"
              >
                <option value="bank">银行</option>
                <option value="payment">支付工具</option>
                <option value="cash">现金</option>
                <option value="other">其他</option>
              </select>
            </Field>
            <Field label={editing ? '当前余额（手动校正）' : '初始余额'}>
              <input
                type="number"
                step="0.01"
                value={form.balance}
                onChange={(e) => setForm({ ...form, balance: e.target.value })}
                className="w-full rounded-xl border border-[var(--color-line)] bg-transparent px-3 py-2.5 outline-none ring-[var(--color-accent)] focus:ring-2"
              />
            </Field>
            <Field label="标识色">
              <div className="flex flex-wrap gap-2 pt-1">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm({ ...form, color: c })}
                    className="h-8 w-8 rounded-full border-2"
                    style={{
                      backgroundColor: c,
                      borderColor: form.color === c ? 'var(--color-ink)' : 'transparent',
                    }}
                    aria-label={c}
                  />
                ))}
              </div>
            </Field>
          </div>
          {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {editing ? (
              <button
                type="button"
                onClick={() => void handleDelete()}
                className="rounded-xl px-3 py-2 text-sm text-[var(--color-danger)] hover:bg-[color-mix(in_oklab,var(--color-danger)_10%,transparent)]"
              >
                删除账户
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
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
          </div>
        </form>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {accounts.map((account) => (
          <AccountCard
            key={account.id}
            account={account}
            onClick={() => openEdit(account)}
          />
        ))}
      </div>
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
