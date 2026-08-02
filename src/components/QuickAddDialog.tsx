import { useEffect, useState, type FormEvent } from 'react'
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from '@headlessui/react'
import { X } from 'lucide-react'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/lib/constants'
import { listAccounts } from '@/services/accountService'
import { createTransaction } from '@/services/transactionService'
import type { Account, TransactionType } from '@/types'
import { todayIsoDate } from '@/utils/format'

interface QuickAddDialogProps {
  open: boolean
  onClose: () => void
  onSaved?: () => void
}

/**
 * 快速记账弹层（Headless UI）。
 * 自动填入当前日期，减少手机端输入步骤。
 */
export function QuickAddDialog({ open, onClose, onSaved }: QuickAddDialogProps) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    amount: '',
    type: 'expense' as TransactionType,
    accountId: '',
    category: EXPENSE_CATEGORIES[0] as string,
    note: '',
  })

  useEffect(() => {
    if (!open) return
    void (async () => {
      const accs = await listAccounts()
      setAccounts(accs)
      setForm((prev) => ({
        ...prev,
        amount: '',
        note: '',
        type: 'expense',
        category: EXPENSE_CATEGORIES[0],
        accountId: prev.accountId || accs[0]?.id || '',
      }))
      setError('')
    })()
  }, [open])

  const categories = form.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await createTransaction({
        date: todayIsoDate(),
        amount: Number(form.amount),
        type: form.type === 'transfer' ? 'expense' : form.type,
        accountId: form.accountId,
        category: form.category,
        note: form.note,
      })
      onSaved?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <DialogBackdrop className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" />

      <div className="fixed inset-0 flex items-end justify-center p-0 sm:items-center sm:p-4">
        <DialogPanel className="panel w-full max-w-md rounded-t-3xl p-5 sm:rounded-3xl">
          <div className="mb-4 flex items-center justify-between">
            <DialogTitle className="font-display text-lg font-semibold">
              快速记账
            </DialogTitle>
            <button
              type="button"
              onClick={onClose}
              className="touch-target inline-flex items-center justify-center rounded-xl text-muted"
              aria-label="关闭"
            >
              <X size={20} />
            </button>
          </div>

          <p className="mb-4 text-sm text-muted">
            日期已自动填入今天（{todayIsoDate()}）
          </p>

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {(['expense', 'income'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() =>
                    setForm({
                      ...form,
                      type,
                      category:
                        type === 'income'
                          ? INCOME_CATEGORIES[0]
                          : EXPENSE_CATEGORIES[0],
                    })
                  }
                  className={
                    form.type === type
                      ? 'min-h-12 rounded-2xl bg-[var(--color-accent)] text-sm font-medium text-white'
                      : 'min-h-12 rounded-2xl border border-[var(--color-line)] text-sm text-muted'
                  }
                >
                  {type === 'expense' ? '支出' : '收入'}
                </button>
              ))}
            </div>

            <label className="block">
              <span className="mb-1.5 block text-sm text-muted">金额</span>
              <input
                type="number"
                inputMode="decimal"
                required
                min="0.01"
                step="0.01"
                autoFocus
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="field-input text-lg"
                placeholder="0.00"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm text-muted">账户</span>
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
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm text-muted">类别</span>
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
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm text-muted">备注</span>
              <input
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                className="field-input"
                placeholder="可选备注"
              />
            </label>

            {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}

            <button
              type="submit"
              disabled={saving}
              className="min-h-12 w-full rounded-2xl bg-[var(--color-accent)] text-base font-medium text-white disabled:opacity-60"
            >
              {saving ? '保存中…' : '保存'}
            </button>
          </form>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
