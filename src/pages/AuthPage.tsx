import { useState, type FormEvent, type ReactNode } from 'react'
import { Mail, Lock, ShieldCheck, UserPlus, LogIn } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import clsx from 'clsx'

type AuthMode = 'login' | 'register'

/**
 * 自建账号注册 / 登录（public.users），不走 Supabase Auth 邮箱。
 */
export function AuthPage() {
  const { signIn, signUp, configured } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)
    try {
      if (mode === 'register') {
        if (password !== confirm) {
          throw new Error('两次输入的密码不一致')
        }
        const result = await signUp(email, password)
        if (!result.success) throw new Error(result.message)
        setMessage(result.message)
        return
      }

      const result = await signIn(email, password)
      if (!result.success) throw new Error(result.message)
      setMessage(result.message)
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败')
    } finally {
      setLoading(false)
    }
  }

  if (!configured) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4 py-10">
        <div className="panel w-full max-w-md rounded-3xl p-8">
          <p className="font-display text-2xl font-semibold">未配置 Supabase</p>
          <p className="mt-3 text-sm text-muted">
            请复制 <code>.env.example</code> 为 <code>.env</code>，填入
            <code> VITE_SUPABASE_URL </code>与
            <code> VITE_SUPABASE_ANON_KEY </code>
            后重启 <code>npm run dev</code>。并在 SQL Editor 执行
            <code> supabase/schema.sql</code>。
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="panel w-full max-w-md rounded-3xl p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <p className="font-display text-3xl font-semibold tracking-tight">Bill Record</p>
            <p className="mt-2 text-sm text-muted">
              {mode === 'login'
                ? '登录后直接进入账本（登录密码同时用于数据加密）'
                : '注册账号（写入 public.users，无需二次解锁密码）'}
            </p>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            className="rounded-xl border border-[var(--color-line)] px-3 py-1.5 text-xs text-muted"
          >
            {theme === 'dark' ? '浅色' : '深色'}
          </button>
        </div>

        <div className="mb-5 flex items-start gap-3 rounded-2xl bg-[var(--color-accent-soft)] px-4 py-3 text-sm">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-[var(--color-accent)]" />
          <span>
            账号写入 <code>public.users</code>；登录密码同时用于加密
            <code> vaults </code>汇总数据。流水明文写入 <code>transactions</code>，需联网。
          </span>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-2 rounded-2xl border border-[var(--color-line)] p-1">
          <ModeTab
            active={mode === 'login'}
            onClick={() => {
              setMode('login')
              setError('')
              setMessage('')
            }}
            icon={<LogIn size={16} />}
            label="登录"
          />
          <ModeTab
            active={mode === 'register'}
            onClick={() => {
              setMode('register')
              setError('')
              setMessage('')
            }}
            icon={<UserPlus size={16} />}
            label="注册"
          />
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm text-muted">邮箱</span>
            <div className="relative">
              <Mail
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              />
              <input
                type="email"
                required
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="min-h-12 w-full rounded-2xl border border-[var(--color-line)] bg-transparent py-2.5 pl-10 pr-3 outline-none ring-[var(--color-accent)] focus:ring-2"
                placeholder="you@example.com"
              />
            </div>
          </label>

          <label className="block">
              <span className="mb-1.5 block text-sm text-muted">
                登录密码（同时用于加密同步）
              </span>
            <div className="relative">
              <Lock
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
              />
              <input
                type="password"
                required
                minLength={6}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="min-h-12 w-full rounded-2xl border border-[var(--color-line)] bg-transparent py-2.5 pl-10 pr-3 outline-none ring-[var(--color-accent)] focus:ring-2"
                placeholder="至少 6 位"
              />
            </div>
          </label>

          {mode === 'register' && (
            <label className="block">
              <span className="mb-1.5 block text-sm text-muted">确认密码</span>
              <input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="min-h-12 w-full rounded-2xl border border-[var(--color-line)] bg-transparent px-3 py-2.5 outline-none ring-[var(--color-accent)] focus:ring-2"
                placeholder="再次输入登录密码"
              />
            </label>
          )}

          {error && (
            <p className="rounded-xl bg-[color-mix(in_oklab,var(--color-danger)_12%,transparent)] px-3 py-2 text-sm text-[var(--color-danger)]">
              {error}
            </p>
          )}
          {message && (
            <p className="rounded-xl bg-[var(--color-accent-soft)] px-3 py-2 text-sm">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="min-h-12 w-full rounded-2xl bg-[var(--color-accent)] font-medium text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {loading ? '处理中…' : mode === 'login' ? '登录' : '注册'}
          </button>
        </form>
      </div>
    </div>
  )
}

function ModeTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl text-sm font-medium transition',
        active
          ? 'bg-[var(--color-accent)] text-white'
          : 'text-muted hover:text-[var(--color-ink)]',
      )}
    >
      {icon}
      {label}
    </button>
  )
}
