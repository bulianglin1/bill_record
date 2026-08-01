/**
 * 保险库：使用登录密码做 AES（由 Auth 登录后自动激活）。
 * 密码仅存内存，不落盘。
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
import { encryptPayload, verifyPassword } from '@/lib/crypto'
import { SESSION_UNLOCKED_KEY } from '@/lib/constants'
import { db, ensureMeta, exportSnapshot } from '@/lib/db'
import { META_ID } from '@/lib/constants'
import { seedDefaultAccountsIfEmpty } from '@/services/accountService'
import { recordTodayAssetSnapshotSafe } from '@/services/assetSnapshotService'
import { refreshTransactionsFromCloud } from '@/services/transactionService'
import type { EncryptedPayload } from '@/types'

interface VaultContextValue {
  unlocked: boolean
  hasVault: boolean
  /** 用登录密码自动初始化/解锁保险库 */
  activateWithLoginPassword: (password: string) => Promise<void>
  lock: () => void
  getPassword: () => string | null
}

const VaultContext = createContext<VaultContextValue | null>(null)

const VERIFY_BLOB_KEY = 'bill_record_verify_blob'

function loadVerifyBlob(): EncryptedPayload | null {
  const raw = localStorage.getItem(VERIFY_BLOB_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as EncryptedPayload
  } catch {
    return null
  }
}

function saveVerifyBlob(payload: EncryptedPayload): void {
  localStorage.setItem(VERIFY_BLOB_KEY, JSON.stringify(payload))
}

export function VaultProvider({ children }: { children: ReactNode }) {
  const passwordRef = useRef<string | null>(null)
  const [unlocked, setUnlocked] = useState(false)
  const [hasVault, setHasVault] = useState(() => Boolean(loadVerifyBlob()))

  const finishUnlock = useCallback(async (password: string) => {
    await ensureMeta()
    await seedDefaultAccountsIfEmpty()
    try {
      await refreshTransactionsFromCloud()
    } catch {
      // 流水表未建或暂无数据时不阻断进入
    }
    // 登录成功：写入/更新今天的总资产快照
    await recordTodayAssetSnapshotSafe()
    passwordRef.current = password
    sessionStorage.setItem(SESSION_UNLOCKED_KEY, '1')
    setHasVault(true)
    setUnlocked(true)
  }, [])

  const setupWithPassword = useCallback(
    async (password: string) => {
      if (password.length < 6) {
        throw new Error('登录密码至少 6 位')
      }
      const probe = { probe: 'bill_record_ok', at: Date.now() }
      const encrypted = await encryptPayload(probe, password)
      saveVerifyBlob(encrypted)
      await ensureMeta()
      await db.meta.update(META_ID, { salt: encrypted.salt })
      await finishUnlock(password)
    },
    [finishUnlock],
  )

  /**
   * 登录成功后调用：无本地校验包则创建；有则用登录密码解锁。
   * 若曾使用独立 Master Password 导致校验失败，则用登录密码重建校验包。
   */
  const activateWithLoginPassword = useCallback(
    async (password: string) => {
      const blob = loadVerifyBlob()
      if (!blob) {
        await setupWithPassword(password)
        return
      }

      const ok = await verifyPassword(blob, password)
      if (ok) {
        await exportSnapshot()
        await finishUnlock(password)
        return
      }

      // 从「双密码」迁移到「仅登录密码」
      await setupWithPassword(password)
    },
    [finishUnlock, setupWithPassword],
  )

  const lock = useCallback(() => {
    passwordRef.current = null
    sessionStorage.removeItem(SESSION_UNLOCKED_KEY)
    setUnlocked(false)
  }, [])

  const getPassword = useCallback(() => passwordRef.current, [])

  const value = useMemo(
    () => ({
      unlocked,
      hasVault,
      activateWithLoginPassword,
      lock,
      getPassword,
    }),
    [unlocked, hasVault, activateWithLoginPassword, lock, getPassword],
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
