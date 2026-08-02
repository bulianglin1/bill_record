/**
 * 资产快照业务入口：登录与资产变动后调用。
 */
import {
  buildDistribution,
  upsertTodayAssetSnapshot,
} from '@/services/cloudAssetSnapshotService'
import type { Account } from '@/types'

/** 与 accountService.sumBalances 对齐，避免与 accountService 循环依赖 */
function totalFromAccounts(accounts: Account[]): number {
  return Math.round(accounts.reduce((sum, a) => sum + a.balance, 0) * 100) / 100
}

/**
 * 记录/更新今天的总资产快照；失败不抛给上层业务（避免阻断记账）。
 * 若调用方已有账户列表，传入可避免内部再次 listAccounts。
 */
export async function recordTodayAssetSnapshotSafe(
  accounts?: Account[],
): Promise<void> {
  try {
    if (accounts) {
      await upsertTodayAssetSnapshot(
        totalFromAccounts(accounts),
        buildDistribution(accounts),
      )
      return
    }
    await upsertTodayAssetSnapshot()
  } catch {
    // 表未创建或离线时忽略
  }
}
