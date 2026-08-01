/**
 * 本地 IndexedDB ↔ Supabase 加密同步。
 * 上传前用 Master Password AES 加密整库快照；下载后解密再覆盖本地。
 */
import { encryptPayload, decryptPayload } from '@/lib/crypto'
import {
  bumpLocalVersion,
  db,
  ensureMeta,
  exportSnapshot,
  importSnapshot,
  nowIso,
} from '@/lib/db'
import { requireSessionUserId } from '@/lib/authSession'
import { META_ID } from '@/lib/constants'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { refreshTransactionsFromCloud } from '@/services/transactionService'
import type { EncryptedPayload, VaultRow, VaultSnapshot } from '@/types'

export type SyncDirection = 'push' | 'pull' | 'auto'

export interface SyncResult {
  success: boolean
  direction?: SyncDirection
  message: string
  version?: number
}

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('未配置 Supabase，请在 .env 中填写 VITE_SUPABASE_URL 与 VITE_SUPABASE_ANON_KEY')
  }
  return supabase
}

/** 获取当前自建会话用户 ID */
function requireUserId(): string {
  requireClient()
  return requireSessionUserId()
}

/** 拉取远端加密行（可能为空） */
export async function fetchRemoteVault(): Promise<VaultRow | null> {
  const client = requireClient()
  const userId = requireUserId()
  const { data, error } = await client
    .from('vaults')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw new Error(`拉取云端数据失败: ${error.message}`)
  }
  return data as VaultRow | null
}

/** 加密本地快照并推送到 Supabase */
export async function pushToCloud(password: string): Promise<SyncResult> {
  try {
    const client = requireClient()
    const userId = requireUserId()
    const meta = await ensureMeta()
    const snapshot = await exportSnapshot()

    const encrypted = await encryptPayload(snapshot, password, meta.salt)
    if (!meta.salt) {
      await db.meta.update(META_ID, { salt: encrypted.salt })
    }

    const nextVersion = Math.max(meta.localVersion, meta.remoteVersion) + 1
    const remote = await fetchRemoteVault()

    if (remote) {
      // 乐观锁：本地落后于远端则拒绝覆盖
      if (remote.version > meta.remoteVersion && remote.version > meta.localVersion) {
        return {
          success: false,
          direction: 'push',
          message: `云端版本更新（v${remote.version}），请先拉取后再推送`,
          version: remote.version,
        }
      }

      const { error } = await client
        .from('vaults')
        .update({
          ciphertext: encrypted.ciphertext,
          iv: encrypted.iv,
          salt: encrypted.salt,
          version: nextVersion,
        })
        .eq('user_id', userId)
        .eq('version', remote.version)

      if (error) {
        throw new Error(`推送失败: ${error.message}`)
      }
    } else {
      const { error } = await client.from('vaults').insert({
        user_id: userId,
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        salt: encrypted.salt,
        version: nextVersion,
      })
      if (error) {
        throw new Error(`首次上传失败: ${error.message}`)
      }
    }

    await db.meta.update(META_ID, {
      localVersion: nextVersion,
      remoteVersion: nextVersion,
      lastSyncedAt: nowIso(),
      salt: encrypted.salt,
    })

    return {
      success: true,
      direction: 'push',
      message: `已加密推送到云端（v${nextVersion}）`,
      version: nextVersion,
    }
  } catch (err) {
    return {
      success: false,
      direction: 'push',
      message: err instanceof Error ? err.message : '推送失败',
    }
  }
}

/** 从 Supabase 拉取并解密覆盖本地 */
export async function pullFromCloud(password: string): Promise<SyncResult> {
  try {
    const remote = await fetchRemoteVault()
    if (!remote) {
      return {
        success: false,
        direction: 'pull',
        message: '云端尚无数据，请先推送本地保险库',
      }
    }

    const payload: EncryptedPayload = {
      ciphertext: remote.ciphertext,
      iv: remote.iv,
      salt: remote.salt,
    }

    let snapshot: VaultSnapshot
    try {
      snapshot = await decryptPayload<VaultSnapshot>(payload, password)
    } catch {
      return {
        success: false,
        direction: 'pull',
        message: '解密失败，请检查 Master Password 是否正确',
      }
    }

    await importSnapshot(snapshot, remote.version, remote.salt)
    // 流水从明文表拉取，不进 vaults 密文
    await refreshTransactionsFromCloud()

    return {
      success: true,
      direction: 'pull',
      message: `已从云端拉取账户汇总并刷新流水（v${remote.version}）`,
      version: remote.version,
    }
  } catch (err) {
    return {
      success: false,
      direction: 'pull',
      message: err instanceof Error ? err.message : '拉取失败',
    }
  }
}

/**
 * 自动同步策略：
 * - 仅远端有数据 → pull
 * - 本地更新 → push
 * - 远端更新 → pull
 * - 两边都有变更且版本冲突 → 提示手动处理
 */
export async function autoSync(password: string): Promise<SyncResult> {
  try {
    requireClient()
    requireUserId()
    const meta = await ensureMeta()
    const remote = await fetchRemoteVault()

    if (!remote) {
      if (meta.localVersion === 0) {
        const accountCount = await db.accounts.count()
        if (accountCount === 0) {
          return { success: true, direction: 'auto', message: '本地与云端均为空，无需同步' }
        }
      }
      return pushToCloud(password)
    }

    if (remote.version > meta.remoteVersion && meta.localVersion <= meta.remoteVersion) {
      return pullFromCloud(password)
    }

    if (meta.localVersion > meta.remoteVersion) {
      return pushToCloud(password)
    }

    if (remote.version > meta.localVersion && meta.localVersion > meta.remoteVersion) {
      return {
        success: false,
        direction: 'auto',
        message: '检测到冲突：本地与云端均有变更，请手动选择拉取或推送',
        version: remote.version,
      }
    }

    return {
      success: true,
      direction: 'auto',
      message: '本地与云端已同步',
      version: remote.version,
    }
  } catch (err) {
    return {
      success: false,
      direction: 'auto',
      message: err instanceof Error ? err.message : '同步失败',
    }
  }
}

/** 记录本地变更（供业务层调用） */
export async function markDirty(): Promise<void> {
  await bumpLocalVersion()
}
