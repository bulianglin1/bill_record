/**
 * 登录后账本引导：迁移旧数据 → 云端 seed 账户 → 写当日快照。
 * 业务数据全部在云端，不再使用本地 IndexedDB / vaults 同步。
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { SESSION_UNLOCKED_KEY } from '@/lib/constants'
import { migrateAccountsToCloud } from '@/lib/migrateAccountsToCloud'
import { seedDefaultAccountsIfEmpty } from '@/services/accountService'
import { recordTodayAssetSnapshotSafe } from '@/services/assetSnapshotService'

interface VaultContextValue {
  unlocked: boolean
  /** 用登录密码完成账本初始化（迁移 + seed） */
  activateWithLoginPassword: (password: string) => Promise<void>
  lock: () => void
}

const VaultContext = createContext<VaultContextValue | null>(null)

export function VaultProvider({ children }: { children: ReactNode }) {
  const passwordRef = useRef<string | null>(null)
  const [unlocked, setUnlocked] = useState(false)

  const activateWithLoginPassword = useCallback(async (password: string) => {
    await migrateAccountsToCloud(password)
    // seed 已返回账户列表，直接写入快照，避免再打一次 accounts
    const accounts = await seedDefaultAccountsIfEmpty()
    await recordTodayAssetSnapshotSafe(accounts)
    passwordRef.current = password
    sessionStorage.setItem(SESSION_UNLOCKED_KEY, '1')
    setUnlocked(true)
  }, [])

  const lock = useCallback(() => {
    passwordRef.current = null
    sessionStorage.removeItem(SESSION_UNLOCKED_KEY)
    setUnlocked(false)
  }, [])

  const value = useMemo(
    () => ({
      unlocked,
      activateWithLoginPassword,
      lock,
    }),
    [unlocked, activateWithLoginPassword, lock],
  )

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>
}

export function useVault(): VaultContextValue {
  const ctx = useContext(VaultContext)
  if (!ctx) {
    throw new Error('useVault must be used within VaultProvider')
  }
  return ctx
}
