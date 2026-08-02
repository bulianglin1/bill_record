/**
 * 一次性把账户迁到 public.accounts：
 * 1) 云端已有 → 跳过
 * 2) 尝试解密 vaults 密文快照
 * 3) 尝试读取旧 IndexedDB（Dexie）
 * 成功后清空本地 IndexedDB，业务数据不再落本地。
 */
import Dexie, { type Table } from 'dexie'
import { decryptPayload } from '@/lib/crypto'
import { requireSessionUserId } from '@/lib/authSession'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import {
  countCloudAccounts,
  insertCloudAccounts,
} from '@/services/cloudAccountService'
import type { Account, EncryptedPayload, VaultRow, VaultSnapshot } from '@/types'

const LOCAL_DB_NAME = 'bill_record_db'

class LegacyBillDatabase extends Dexie {
  accounts!: Table<Account, string>

  constructor() {
    super(LOCAL_DB_NAME)
    this.version(1).stores({
      accounts: 'id, name, type, sortOrder',
      transactions: 'id, date, accountId, type, category, source',
      meta: 'id',
    })
  }
}

async function fetchRemoteVault(): Promise<VaultRow | null> {
  if (!isSupabaseConfigured || !supabase) return null
  const userId = requireSessionUserId()
  const { data, error } = await supabase
    .from('vaults')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    console.warn('[migrate] 拉取 vaults 失败', error.message)
    return null
  }
  return data as VaultRow | null
}

async function loadAccountsFromVault(password: string): Promise<Account[]> {
  const remote = await fetchRemoteVault()
  if (!remote) return []

  const payload: EncryptedPayload = {
    ciphertext: remote.ciphertext,
    iv: remote.iv,
    salt: remote.salt,
  }
  try {
    const snapshot = await decryptPayload<VaultSnapshot>(payload, password)
    return snapshot.accounts ?? []
  } catch (err) {
    console.warn('[migrate] 解密 vaults 失败，跳过', err)
    return []
  }
}

async function loadAccountsFromIndexedDb(): Promise<Account[]> {
  const legacy = new LegacyBillDatabase()
  try {
    const rows = await legacy.accounts.toArray()
    return rows
  } catch (err) {
    console.warn('[migrate] 读取本地 IndexedDB 失败，跳过', err)
    return []
  } finally {
    legacy.close()
  }
}

function deleteLocalDatabase(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(LOCAL_DB_NAME)
      req.onsuccess = () => resolve()
      req.onerror = () => resolve()
      req.onblocked = () => resolve()
    } catch {
      resolve()
    }
  })
}

/**
 * 登录后调用：若云端无账户则从 vaults / 旧本地库迁移。
 */
export async function migrateAccountsToCloud(password: string): Promise<void> {
  try {
    const cloudCount = await countCloudAccounts()
    if (cloudCount > 0) {
      // 云端已有业务数据，清理残留本地库即可
      await deleteLocalDatabase()
      return
    }

    let accounts = await loadAccountsFromVault(password)
    if (accounts.length === 0) {
      accounts = await loadAccountsFromIndexedDb()
    }

    if (accounts.length > 0) {
      await insertCloudAccounts(accounts)
    }
  } catch (err) {
    // 迁移失败不阻断登录；后续 seedDefaultAccountsIfEmpty 会兜底空库
    console.warn('[migrate] 账户迁移未完成', err)
  } finally {
    await deleteLocalDatabase()
  }
}
