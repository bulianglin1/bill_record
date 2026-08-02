import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  Settings,
  Moon,
  Sun,
  Lock,
  Plus,
  Scale,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useTheme } from '@/context/ThemeContext'
import { useAuth } from '@/context/AuthContext'
import { useVault } from '@/context/VaultContext'
import { useSwipeTabs } from '@/hooks/useSwipeTabs'
import clsx from 'clsx'

export type AppTab =
  | 'dashboard'
  | 'transactions'
  | 'surplus'
  | 'accounts'
  | 'settings'

interface LayoutProps {
  tab: AppTab
  onTabChange: (tab: AppTab) => void
  onQuickAdd: () => void
  children: ReactNode
}

const NAV: Array<{ id: AppTab; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: '看板', icon: LayoutDashboard },
  { id: 'transactions', label: '流水', icon: ArrowLeftRight },
  { id: 'surplus', label: '结余', icon: Scale },
  { id: 'accounts', label: '账户', icon: Wallet },
  { id: 'settings', label: '设置', icon: Settings },
]

/**
 * Mobile-First 壳层：
 * - 默认（手机）：底部大触控导航 + 滑动切 Tab + 快速记账 FAB
 * - md+（iPad/PC）：左侧边栏，隐藏底栏与 FAB（宽屏用顶栏/页面内操作）
 */
export function Layout({ tab, onTabChange, onQuickAdd, children }: LayoutProps) {
  const { theme, toggleTheme } = useTheme()
  const { signOut } = useAuth()
  const { lock } = useVault()
  const swipe = useSwipeTabs(tab, onTabChange)

  async function handleSignOut() {
    lock()
    await signOut()
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col px-3 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-4 md:pb-8 md:pt-8">
      <header className="mb-4 flex items-center justify-between gap-3 md:mb-6">
        <div className="min-w-0">
          <p className="font-display text-xl font-semibold tracking-tight sm:text-2xl md:text-3xl">
            Bill Record
          </p>
          <p className="mt-0.5 truncate text-xs text-muted sm:text-sm">
            云端账本 · 多端同步
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            className="touch-target panel inline-flex items-center justify-center rounded-2xl transition hover:opacity-90"
            aria-label="切换主题"
          >
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="touch-target panel inline-flex items-center gap-2 rounded-2xl px-3 text-sm transition hover:opacity-90"
          >
            <Lock size={18} />
            <span className="hidden sm:inline">退出</span>
          </button>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-4 md:flex-row md:gap-6">
        {/* iPad / PC 侧边栏 */}
        <nav
          className="panel sticky top-4 hidden h-fit w-52 shrink-0 flex-col gap-1 rounded-2xl p-2 md:flex lg:w-56"
          aria-label="侧边导航"
        >
          {NAV.map((item) => {
            const Icon = item.icon
            const active = tab === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onTabChange(item.id)}
                className={clsx(
                  'flex min-h-11 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition',
                  active
                    ? 'bg-[var(--color-accent)] text-white'
                    : 'text-muted hover:bg-[color-mix(in_oklab,var(--color-line)_70%,transparent)] hover:text-[var(--color-ink)]',
                )}
              >
                <Icon size={18} />
                {item.label}
              </button>
            )
          })}
          <button
            type="button"
            onClick={onQuickAdd}
            className="mt-2 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--color-accent)] px-3 py-2.5 text-sm font-medium text-white"
          >
            <Plus size={18} />
            快速记账
          </button>
        </nav>

        <main
          className="min-w-0 flex-1 touch-pan-y"
          {...swipe}
        >
          {children}
        </main>
      </div>

      {/* 手机：快速记账 FAB */}
      <button
        type="button"
        onClick={onQuickAdd}
        className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-4 z-30 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-accent)] text-white shadow-lg shadow-teal-900/20 transition active:scale-95 md:hidden"
        aria-label="快速记账"
      >
        <Plus size={26} strokeWidth={2.5} />
      </button>

      {/* 手机：底部导航（大拇指热区） */}
      <nav
        className="panel fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 grid grid-cols-5 gap-1 rounded-2xl p-1.5 md:hidden"
        aria-label="底部导航"
      >
        {NAV.map((item) => {
          const Icon = item.icon
          const active = tab === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onTabChange(item.id)}
              className={clsx(
                'flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-medium transition active:scale-95',
                active ? 'bg-[var(--color-accent)] text-white' : 'text-muted',
              )}
            >
              <Icon size={22} />
              {item.label}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
