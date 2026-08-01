import { useCallback, useEffect, useState } from 'react'
import { ThemeProvider } from '@/context/ThemeContext'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { VaultProvider, useVault } from '@/context/VaultContext'
import { Layout, type AppTab } from '@/components/Layout'
import { QuickAddDialog } from '@/components/QuickAddDialog'
import { AuthPage } from '@/pages/AuthPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { TransactionsPage } from '@/pages/TransactionsPage'
import { AccountsPage } from '@/pages/AccountsPage'
import { SettingsPage } from '@/pages/SettingsPage'

function BootLoading({ text }: { text: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center text-sm text-muted">
      {text}
    </div>
  )
}

function AppShell() {
  const {
    loading: authLoading,
    isAuthenticated,
    configured,
    getLoginPassword,
  } = useAuth()
  const { unlocked, activateWithLoginPassword } = useVault()
  const [tab, setTab] = useState<AppTab>('dashboard')
  const [quickOpen, setQuickOpen] = useState(false)
  const [dataTick, setDataTick] = useState(0)
  const [vaultBooting, setVaultBooting] = useState(false)
  const [vaultError, setVaultError] = useState('')

  const handleQuickSaved = useCallback(() => {
    setDataTick((n) => n + 1)
  }, [])

  useEffect(() => {
    if (!isAuthenticated || unlocked) return
    const pwd = getLoginPassword()
    if (!pwd) return

    setVaultBooting(true)
    setVaultError('')
    void activateWithLoginPassword(pwd)
      .catch((err) => {
        setVaultError(err instanceof Error ? err.message : '保险库初始化失败')
      })
      .finally(() => {
        setVaultBooting(false)
      })
  }, [isAuthenticated, unlocked, getLoginPassword, activateWithLoginPassword])

  if (!configured) {
    return <AuthPage />
  }

  if (authLoading) {
    return <BootLoading text="正在检查登录状态…" />
  }

  // 无用户或无会话密码时进入登录页（关标签后 sessionStorage 会清空）
  if (!isAuthenticated) {
    return <AuthPage />
  }

  if (vaultError) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-sm">
        <p className="text-[var(--color-danger)]">{vaultError}</p>
        <p className="text-muted">请刷新后重新登录，或检查网络与数据库表是否已创建。</p>
      </div>
    )
  }

  if (!unlocked || vaultBooting) {
    return <BootLoading text="正在准备账本…" />
  }

  return (
    <>
      <Layout
        tab={tab}
        onTabChange={setTab}
        onQuickAdd={() => setQuickOpen(true)}
      >
        {tab === 'dashboard' && <DashboardPage refreshKey={dataTick} />}
        {tab === 'transactions' && <TransactionsPage refreshKey={dataTick} />}
        {tab === 'accounts' && <AccountsPage refreshKey={dataTick} />}
        {tab === 'settings' && <SettingsPage />}
      </Layout>

      <QuickAddDialog
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        onSaved={handleQuickSaved}
      />
    </>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <VaultProvider>
          <AppShell />
        </VaultProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
