/**
 * 资产快照业务入口：登录与资产变动后调用。
 */
import { upsertTodayAssetSnapshot } from '@/services/cloudAssetSnapshotService'

/** 记录/更新今天的总资产快照；失败不抛给上层业务（避免阻断记账） */
export async function recordTodayAssetSnapshotSafe(): Promise<void> {
  try {
    await upsertTodayAssetSnapshot()
  } catch {
    // 表未创建或离线时忽略
  }
}
