import { useEffect, useState, type ChangeEvent } from 'react'
import {
  FileUp,
  LogOut,
  HardDrive,
  BookMarked,
  UserRound,
  Cloud,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useVault } from '@/context/VaultContext'
import { isSupabaseConfigured } from '@/lib/supabase'
import { listAccounts } from '@/services/accountService'
import { bulkImportTransactions } from '@/services/transactionService'
import { getImporter } from '@/utils/import'
import { readBillFile } from '@/utils/import/readBillFile'
import type { Account } from '@/types'

export function SettingsPage() {
  const { user, signOut } = useAuth()
  const { lock } = useVault()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [importSource, setImportSource] = useState<'wechat' | 'alipay'>('wechat')
  const [importAccountId, setImportAccountId] = useState('')

  function pickDefaultImportAccount(
    accs: Account[],
    source: 'wechat' | 'alipay',
    currentId: string,
  ): string {
    if (currentId && accs.some((a) => a.id === currentId)) {
      return currentId
    }
    const preferName = source === 'wechat' ? '微信' : '支付宝'
    const hit = accs.find((a) => a.name === preferName)
    return hit?.id ?? accs[0]?.id ?? ''
  }

  async function refresh() {
    const accs = await listAccounts()
    setAccounts(accs)
    setImportAccountId((prev) => pickDefaultImportAccount(accs, importSource, prev))
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleLogout() {
    setBusy(true)
    setMessage('')
    try {
      await signOut()
      lock()
      setMessage('已退出登录')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '退出失败')
    } finally {
      setBusy(false)
    }
  }

  async function handleImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    setMessage('')
    try {
      if (!importAccountId) {
        throw new Error('请先选择导入目标账户')
      }
      const importer = getImporter(importSource)
      const payload = await readBillFile(file)
      let result
      if (payload.kind === 'table') {
        if (!importer.parseTable) {
          throw new Error(`${importer.label}暂不支持 Excel，请导出 CSV 后再试`)
        }
        result = await importer.parseTable(payload.rows, importAccountId)
      } else {
        result = await importer.parse(payload.text, importAccountId)
      }
      if (!result.success && result.transactions.length === 0) {
        throw new Error(result.errors[0] ?? '解析失败')
      }
      if (result.transactions.length === 0) {
        throw new Error(
          `未解析到可导入流水（跳过 ${result.skipped} 笔）。请确认来源选对且文件为微信导出账单。`,
        )
      }
      const count = await bulkImportTransactions(result.transactions)
      setMessage(
        `导入完成：成功 ${count} 笔，跳过 ${result.skipped} 笔` +
          (result.errors.length ? `；警告 ${result.errors.length} 条` : ''),
      )
      await refresh()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '导入失败')
    } finally {
      setBusy(false)
      e.target.value = ''
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-semibold">设置</h1>
        <p className="mt-1 text-sm text-muted">
          账户、流水、资产快照均保存在云端，换设备登录即可继续使用
        </p>
      </div>

      <section className="panel space-y-3 rounded-3xl p-5">
        <h2 className="font-display flex items-center gap-2 text-lg font-semibold">
          <UserRound size={18} className="text-[var(--color-accent)]" />
          账号
        </h2>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--color-line)] px-3 py-3 text-sm">
          <div className="min-w-0">
            <p className="text-muted">当前登录</p>
            <p className="truncate font-medium">{user?.email ?? '未登录'}</p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleLogout()}
            className="inline-flex min-h-10 items-center gap-1 rounded-xl px-3 text-[var(--color-danger)] hover:bg-[color-mix(in_oklab,var(--color-danger)_10%,transparent)]"
          >
            <LogOut size={14} />
            退出登录
          </button>
        </div>
      </section>

      <section className="panel space-y-3 rounded-3xl p-5">
        <h2 className="font-display flex items-center gap-2 text-lg font-semibold">
          <Cloud size={18} className="text-[var(--color-accent)]" />
          云端数据
        </h2>
        {!isSupabaseConfigured ? (
          <p className="text-sm text-muted">
            未检测到环境变量。复制 <code>.env.example</code> 为 <code>.env</code> 并填入
            Supabase URL / anon key 后重启开发服务器。
          </p>
        ) : (
          <ul className="space-y-1 text-sm text-muted">
            <li>
              账户 → <code>public.accounts</code>
            </li>
            <li>
              流水 → <code>public.transactions</code>
            </li>
            <li>
              资产快照 → <code>public.asset_snapshots</code>
            </li>
          </ul>
        )}
      </section>

      <section className="panel space-y-3 rounded-3xl p-5">
        <h2 className="font-display text-lg font-semibold">账单导入</h2>
        <p className="text-sm text-muted">
          微信支持 xlsx/csv；支付宝支持导出 CSV（GBK 编码可直接导入）。请选对来源与目标账户。
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <select
            value={importSource}
            onChange={(e) => {
              const source = e.target.value as 'wechat' | 'alipay'
              setImportSource(source)
              setImportAccountId(pickDefaultImportAccount(accounts, source, ''))
            }}
            className="min-h-11 rounded-xl border border-[var(--color-line)] bg-transparent px-3 py-2 text-sm"
          >
            <option value="wechat">微信账单（xlsx / csv）</option>
            <option value="alipay">支付宝账单 CSV</option>
          </select>
          <select
            value={importAccountId}
            onChange={(e) => setImportAccountId(e.target.value)}
            className="min-h-11 rounded-xl border border-[var(--color-line)] bg-transparent px-3 py-2 text-sm"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-[var(--color-line)] px-4 py-2 text-sm">
          <FileUp size={16} />
          {busy ? '导入中…' : importSource === 'wechat' ? '选择微信账单文件' : '选择支付宝 CSV'}
          <input
            type="file"
            accept={
              importSource === 'wechat'
                ? '.xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv'
                : '.csv,text/csv'
            }
            className="hidden"
            disabled={busy}
            onChange={(e) => void handleImportFile(e)}
          />
        </label>
      </section>

      <section className="panel space-y-3 rounded-3xl p-5">
        <h2 className="font-display text-lg font-semibold">扩展备份（可选）</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-dashed border-[var(--color-line)] p-4 text-sm">
            <div className="mb-2 flex items-center gap-2 font-medium">
              <BookMarked size={16} />
              GitHub 私有仓库 JSON
            </div>
            <p className="text-muted">可将云端导出数据写入私有仓库，作为冷备份。</p>
          </div>
          <div className="rounded-2xl border border-dashed border-[var(--color-line)] p-4 text-sm">
            <div className="mb-2 flex items-center gap-2 font-medium">
              <HardDrive size={16} />
              WebDAV 网盘
            </div>
            <p className="text-muted">
              支持挂载坚果云 / Nextcloud 等 WebDAV，上传备份文件。
            </p>
          </div>
        </div>
      </section>

      {message && (
        <p className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface-elevated)] px-4 py-3 text-sm">
          {message}
        </p>
      )}
    </div>
  )
}
