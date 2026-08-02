import { useState, type FormEvent, type ReactNode } from 'react'
import { User, Lock, UserPlus, LogIn, Moon, Sun } from 'lucide-react'
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
      <AuthShell theme={theme} onToggleTheme={toggleTheme}>
        <div className="auth-enter-brand">
          <p className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Bill Record
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            未检测到 Supabase 配置。请复制 <code>.env.example</code> 为{' '}
            <code>.env</code>，填入 <code>VITE_SUPABASE_URL</code> 与{' '}
            <code>VITE_SUPABASE_ANON_KEY</code> 后重启开发服务器，并在 SQL Editor
            执行 <code>supabase/schema.sql</code>。
          </p>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell theme={theme} onToggleTheme={toggleTheme}>
      <div className="auth-enter-brand mb-8">
        <p className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">
          Bill Record
        </p>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">
          {mode === 'login'
            ? '登录后进入云端账本。登录密码同时用于本地数据加密。'
            : '创建账号后即可记账同步。登录密码同时用于本地数据加密。'}
        </p>
      </div>

      <div className="auth-enter-form space-y-5">
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-[color-mix(in_oklab,var(--color-line)_55%,transparent)] p-1">
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
            <span className="mb-1.5 block text-sm text-muted">账号</span>
            <div className="relative">
              <User
                size={16}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
              />
              <input
                type="text"
                required
                autoComplete="username"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="auth-field"
                placeholder="账号名或邮箱"
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm text-muted">登录密码</span>
            <div className="relative">
              <Lock
                size={16}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
              />
              <input
                type="password"
                required
                minLength={6}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="auth-field"
                placeholder="至少 6 位"
              />
            </div>
            <span className="mt-1.5 block text-xs text-muted">
              同时用于加密同步，请妥善保管
            </span>
          </label>

          {mode === 'register' && (
            <label className="block">
              <span className="mb-1.5 block text-sm text-muted">确认密码</span>
              <div className="relative">
                <Lock
                  size={16}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
                />
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="auth-field"
                  placeholder="再次输入登录密码"
                />
              </div>
            </label>
          )}

          {error && (
            <p className="rounded-2xl bg-[color-mix(in_oklab,var(--color-danger)_12%,transparent)] px-3.5 py-2.5 text-sm text-[var(--color-danger)]">
              {error}
            </p>
          )}
          {message && (
            <p className="rounded-2xl bg-[var(--color-accent-soft)] px-3.5 py-2.5 text-sm">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="min-h-12 w-full rounded-2xl bg-[var(--color-accent)] text-base font-medium text-white shadow-[0_10px_28px_-12px_color-mix(in_oklab,var(--color-accent)_70%,transparent)] transition hover:opacity-95 active:scale-[0.99] disabled:opacity-60"
          >
            {loading ? '处理中…' : mode === 'login' ? '进入账本' : '创建账号'}
          </button>
        </form>
      </div>
    </AuthShell>
  )
}

function AuthShell({
  theme,
  onToggleTheme,
  children,
}: {
  theme: string
  onToggleTheme: () => void
  children: ReactNode
}) {
  return (
    <div className="relative flex min-h-dvh flex-col justify-center px-4 py-10 sm:px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute -left-24 top-[-10%] h-[420px] w-[420px] rounded-full bg-[color-mix(in_oklab,var(--color-accent)_22%,transparent)] blur-3xl" />
        <div className="absolute -right-16 bottom-[8%] h-[360px] w-[360px] rounded-full bg-[color-mix(in_oklab,#38bdf8_16%,transparent)] blur-3xl" />
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[color-mix(in_oklab,var(--color-accent)_10%,transparent)] to-transparent" />
      </div>

      <div className="relative mx-auto w-full max-w-md">
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={onToggleTheme}
            className="touch-target inline-flex items-center justify-center rounded-2xl border border-[var(--color-line)] bg-[color-mix(in_oklab,var(--color-surface-elevated)_80%,transparent)] backdrop-blur-sm transition hover:opacity-90"
            aria-label="切换主题"
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>

        <div className="rounded-[1.75rem] border border-[var(--color-line)] bg-[color-mix(in_oklab,var(--color-surface-elevated)_92%,transparent)] p-6 shadow-[0_24px_60px_-28px_rgba(15,23,42,0.35)] backdrop-blur-md sm:p-8">
          {children}
        </div>
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
          ? 'bg-[var(--color-surface-elevated)] text-[var(--color-ink)] shadow-sm'
          : 'text-muted hover:text-[var(--color-ink)]',
      )}
    >
      {icon}
      {label}
    </button>
  )
}
