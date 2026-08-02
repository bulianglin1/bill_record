/**
 * 总资产日快照：每天一行；登录/资产变动时 upsert 当天。
 * 查看某月：取该月 snapshot_date 最晚的一条。
 * 每条同时保存当时各账户余额分布（distribution）。
 */
import { requireSessionUserId } from '@/lib/authSession'
import { dedupeAsync } from '@/lib/dedupeAsync'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { listAccounts, sumBalances } from '@/services/accountService'
import type { Account, AccountType } from '@/types'
import { todayIsoDate } from '@/utils/format'

/** 快照中的单账户分布项（与当时账户字段对齐，便于回看） */
export interface AssetDistributionItem {
  accountId: string
  name: string
  type: AccountType
  balance: number
  currency: string
  color: string
}

export interface AssetSnapshot {
  id: string
  userId: string
  snapshotDate: string
  totalAssets: number
  distribution: AssetDistributionItem[]
  updatedAt: string
}

export interface MonthAssetPoint {
  /** YYYY-MM */
  month: string
  /** 该月最晚一天的快照日期 */
  snapshotDate: string
  totalAssets: number
  distribution: AssetDistributionItem[]
}

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('需要联网才能记录资产快照')
  }
  return supabase
}

/** 从当前账户列表生成分布快照 */
export function buildDistribution(accounts: Account[]): AssetDistributionItem[] {
  return accounts.map((a) => ({
    accountId: a.id,
    name: a.name,
    type: a.type,
    balance: a.balance,
    currency: a.currency,
    color: a.color,
  }))
}

function parseDistribution(raw: unknown): AssetDistributionItem[] {
  if (!Array.isArray(raw)) return []
  const items: AssetDistributionItem[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const accountId = String(r.accountId ?? '')
    const name = String(r.name ?? '')
    if (!accountId && !name) continue
    items.push({
      accountId,
      name,
      type: (r.type as AccountType) || 'other',
      balance: Number(r.balance) || 0,
      currency: String(r.currency ?? 'CNY'),
      color: String(r.color ?? '#64748b'),
    })
  }
  return items
}

/** 当月第一天 / 最后一天（本地时区） */
export function monthDateRange(yearMonth: string): { start: string; end: string } {
  const [y, m] = yearMonth.split('-').map(Number)
  const start = `${yearMonth}-01`
  const lastDay = new Date(y!, m!, 0).getDate()
  const end = `${yearMonth}-${String(lastDay).padStart(2, '0')}`
  return { start, end }
}

export function shiftMonth(yearMonth: string, delta: number): string {
  const [y, m] = yearMonth.split('-').map(Number)
  const d = new Date(y!, (m! - 1) + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function currentYearMonth(): string {
  return todayIsoDate().slice(0, 7)
}

/**
 * 用当前账户合计 + 分布写入/更新「今天」的快照。
 */
export async function upsertTodayAssetSnapshot(
  totalAssets?: number,
  distribution?: AssetDistributionItem[],
): Promise<void> {
  const client = requireClient()
  const userId = requireSessionUserId()
  const snapshotDate = todayIsoDate()
  const accounts = distribution ? null : await listAccounts()
  const total =
    totalAssets ?? sumBalances(accounts ?? [])
  const dist = distribution ?? buildDistribution(accounts ?? [])
  const now = new Date().toISOString()

  const { error } = await client.from('asset_snapshots').upsert(
    {
      user_id: userId,
      snapshot_date: snapshotDate,
      total_assets: total,
      distribution: dist,
      updated_at: now,
    },
    { onConflict: 'user_id,snapshot_date' },
  )

  if (error) {
    throw new Error(`更新资产快照失败: ${error.message}`)
  }
}

/** 取某自然月内 snapshot_date 最晚的一条 */
export async function getLatestSnapshotInMonth(
  yearMonth: string,
): Promise<AssetSnapshot | null> {
  const client = requireClient()
  const userId = requireSessionUserId()
  const { start, end } = monthDateRange(yearMonth)

  const { data, error } = await client
    .from('asset_snapshots')
    .select('id, user_id, snapshot_date, total_assets, distribution, updated_at')
    .eq('user_id', userId)
    .gte('snapshot_date', start)
    .lte('snapshot_date', end)
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(`查询月度快照失败: ${error.message}`)
  }
  if (!data) return null

  return {
    id: data.id as string,
    userId: data.user_id as string,
    snapshotDate: String(data.snapshot_date).slice(0, 10),
    totalAssets: Number(data.total_assets),
    distribution: parseDistribution(data.distribution),
    updatedAt: data.updated_at as string,
  }
}

/** 从月度点构造展示用快照（无 id 时用 snapshotDate 占位） */
export function snapshotFromMonthPoint(
  point: MonthAssetPoint | undefined,
): AssetSnapshot | null {
  if (!point) return null
  return {
    id: point.snapshotDate,
    userId: '',
    snapshotDate: point.snapshotDate,
    totalAssets: point.totalAssets,
    distribution: point.distribution,
    updatedAt: '',
  }
}

/** 在月度列表中查找某月快照 */
export function findMonthPoint(
  points: MonthAssetPoint[],
  yearMonth: string,
): MonthAssetPoint | undefined {
  return points.find((p) => p.month === yearMonth)
}

/** 近 N 个月：每月取该月最晚一天的快照（用于折线） */
export async function listMonthlyLastSnapshots(
  months = 12,
): Promise<MonthAssetPoint[]> {
  const userId = requireSessionUserId()
  return dedupeAsync(`asset_snapshots:monthly:${userId}:${months}`, async () => {
    const client = requireClient()
    const endMonth = currentYearMonth()
    const startMonth = shiftMonth(endMonth, -(months - 1))
    const { start } = monthDateRange(startMonth)
    const { end } = monthDateRange(endMonth)

    const { data, error } = await client
      .from('asset_snapshots')
      .select('snapshot_date, total_assets, distribution')
      .eq('user_id', userId)
      .gte('snapshot_date', start)
      .lte('snapshot_date', end)
      .order('snapshot_date', { ascending: true })

    if (error) {
      throw new Error(`拉取资产快照失败: ${error.message}`)
    }

    const byMonth = new Map<
      string,
      {
        snapshotDate: string
        totalAssets: number
        distribution: AssetDistributionItem[]
      }
    >()
    for (const row of data ?? []) {
      const date = String(row.snapshot_date).slice(0, 10)
      const month = date.slice(0, 7)
      // 按日期升序遍历，后者覆盖前者 → 留下该月最晚一天
      byMonth.set(month, {
        snapshotDate: date,
        totalAssets: Number(row.total_assets),
        distribution: parseDistribution(row.distribution),
      })
    }

    const points: MonthAssetPoint[] = []
    for (let i = 0; i < months; i += 1) {
      const month = shiftMonth(startMonth, i)
      const hit = byMonth.get(month)
      if (hit) {
        points.push({
          month,
          snapshotDate: hit.snapshotDate,
          totalAssets: hit.totalAssets,
          distribution: hit.distribution,
        })
      }
    }
    return points
  })
}
