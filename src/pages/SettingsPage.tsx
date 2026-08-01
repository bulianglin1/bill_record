import { useEffect, useState, type ChangeEvent, type ReactNode } from 'react'
import {
  CloudUpload,
  CloudDownload,
  RefreshCw,
  FileUp,
  LogOut,
  HardDrive,
  BookMarked,
  UserRound,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useVault } from '@/context/VaultContext'
import { ensureMeta } from '@/lib/db'
import { isSupabaseConfigured } from '@/lib/supabase'
import { autoSync, pullFromCloud, pushToCloud } from '@/lib/sync'
import { listAccounts } from '@/services/accountService'
import { bulkImportTransactions } from '@/services/transactionService'
import { getImporter } from '@/utils/import'
import type { Account, AppMeta } from '@/types'
import { formatDateTime } from '@/utils/format'

export function SettingsPage() {
  const { user, signOut } = useAuth()
  const { getPassword, lock } = useVault()
  const [meta, setMeta] = useState<AppMeta | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [importSource, setImportSource] = useState<'wechat' | 'alipay'>('wechat')
  const [importAccountId, setImportAccountId] = useState('')

  async function refresh() {
    setMeta(await ensureMeta())
    const accs = await listAccounts()
    setAccounts(accs)
    if (!importAccountId && accs[0]) {
      setImportAccountId(accs[0].id)
    }
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function requireLoginPassword(): string {
    const pwd = getPassword()
    if (!pwd) {
      throw new Error('会话已失效，请重新登录')
    }
    return pwd
  }

  async function runSync(action: 'push' | 'pull' | 'auto') {
    setBusy(true)
    setMessage('')
    try {
      const loginPassword = requireLoginPassword()
      const result =
        action === 'push'
          ? await pushToCloud(loginPassword)
          : action === 'pull'
            ? await pullFromCloud(loginPassword)
            : await autoSync(loginPassword)
      setMessage(result.message)
      await refresh()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '同步失败')
    } finally {
      setBusy(false)
    }
  }

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
      const text = await file.text()
      const importer = getImporter(importSource)
      const result = await importer.parse(text, importAccountId)
      if (!result.success && result.transactions.length === 0) {
        throw new Error(result.errors[0] ?? '解析失败')
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
        <h1 className="font-display text-2xl font-semibold">设置与同步</h1>
        <p className="mt-1 text-sm text-muted">
          本地 IndexedDB 优先；云端仅存储 AES 密文
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
        <h2 className="font-display text-lg font-semibold">同步状态</h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">本地版本</dt>
            <dd className="font-medium">{meta?.localVersion ?? 0}</dd>
          </div>
          <div>
            <dt className="text-muted">云端版本</dt>
            <dd className="font-medium">{meta?.remoteVersion ?? 0}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted">上次同步</dt>
            <dd className="font-medium">
              {meta?.lastSyncedAt
                ? formatDateTime(meta.lastSyncedAt)
                : '尚未同步'}
            </dd>
          </div>
        </dl>
      </section>

      <section className="panel space-y-4 rounded-3xl p-5">
        <h2 className="font-display text-lg font-semibold">云同步（vaults）</h2>
        <p className="text-sm text-muted">
          账号在 <code>public.users</code>；加密快照按用户 id 写入 <code>public.vaults</code>。
        </p>
        {!isSupabaseConfigured ? (
          <p className="text-sm text-muted">
            未检测到环境变量。复制 <code>.env.example</code> 为 <code>.env</code> 并填入
            Supabase URL / anon key 后重启开发服务器。
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <SyncButton
              disabled={busy || !user}
              onClick={() => void runSync('auto')}
              icon={<RefreshCw size={14} />}
              label="自动同步"
            />
            <SyncButton
              disabled={busy || !user}
              onClick={() => void runSync('push')}
              icon={<CloudUpload size={14} />}
              label="推送到云端"
            />
            <SyncButton
              disabled={busy || !user}
              onClick={() => void runSync('pull')}
              icon={<CloudDownload size={14} />}
              label="从云端拉取"
            />
          </div>
        )}
      </section>

      <section className="panel space-y-3 rounded-3xl p-5">
        <h2 className="font-display text-lg font-semibold">账单导入</h2>
        <p className="text-sm text-muted">
          预留微信 / 支付宝 CSV 解析接口。导出账单后选择对应来源与目标账户即可导入。
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <select
            value={importSource}
            onChange={(e) => setImportSource(e.target.value as 'wechat' | 'alipay')}
            className="min-h-11 rounded-xl border border-[var(--color-line)] bg-transparent px-3 py-2 text-sm"
          >
            <option value="wechat">微信账单 CSV</option>
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
          选择 CSV 文件
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            disabled={busy}
            onChange={(e) => void handleImportFile(e)}
          />
        </label>
      </section>

      <section className="panel space-y-3 rounded-3xl p-5">
        <h2 className="font-display text-lg font-semibold">方案 B / C（扩展点）</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-dashed border-[var(--color-line)] p-4 text-sm">
            <div className="mb-2 flex items-center gap-2 font-medium">
              <BookMarked size={16} />
              GitHub 私有仓库 JSON
            </div>
            <p className="text-muted">
              可将加密后的 vault JSON 通过 GitHub Contents API 写入私有仓库，作为冷备份。
            </p>
          </div>
          <div className="rounded-2xl border border-dashed border-[var(--color-line)] p-4 text-sm">
            <div className="mb-2 flex items-center gap-2 font-medium">
              <HardDrive size={16} />
              WebDAV 网盘
            </div>
            <p className="text-muted">
              支持挂载坚果云 / Nextcloud 等 WebDAV，上传加密快照文件。
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

function SyncButton({
  disabled,
  onClick,
  icon,
  label,
}: {
  disabled: boolean
  onClick: () => void
  icon: ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--color-line)] px-3 py-2 text-sm disabled:opacity-50"
    >
      {icon}
      {label}
    </button>
  )
}
