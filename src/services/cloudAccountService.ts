/**
 * Supabase public.accounts 明文账户（即时读写）。
 */
import { requireSessionUserId } from '@/lib/authSession'
import { dedupeAsync } from '@/lib/dedupeAsync'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import type { Account, AccountType } from '@/types'

interface CloudAccountRow {
  id: string
  user_id: string
  name: string
  type: string
  balance: number | string
  currency: string
  color: string
  icon: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('需要联网并配置 Supabase 后才能管理账户')
  }
  return supabase
}

function toRow(account: Account, userId: string) {
  return {
    id: account.id,
    user_id: userId,
    name: account.name,
    type: account.type,
    balance: account.balance,
    currency: account.currency,
    color: account.color,
    icon: account.icon ?? null,
    sort_order: account.sortOrder,
    created_at: account.createdAt,
    updated_at: account.updatedAt,
  }
}

function fromRow(row: CloudAccountRow): Account {
  return {
    id: row.id,
    name: row.name,
    type: row.type as AccountType,
    balance: Number(row.balance),
    currency: row.currency || 'CNY',
    color: row.color,
    icon: row.icon ?? undefined,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listCloudAccounts(): Promise<Account[]> {
  const userId = requireSessionUserId()
  return dedupeAsync(`accounts:list:${userId}`, async () => {
    const client = requireClient()
    const { data, error } = await client
      .from('accounts')
      .select('*')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true })

    if (error) {
      throw new Error(`拉取云端账户失败: ${error.message}`)
    }
    return ((data as CloudAccountRow[]) ?? []).map(fromRow)
  })
}

export async function getCloudAccount(id: string): Promise<Account | null> {
  const client = requireClient()
  const userId = requireSessionUserId()
  const { data, error } = await client
    .from('accounts')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw new Error(`查询账户失败: ${error.message}`)
  }
  if (!data) return null
  return fromRow(data as CloudAccountRow)
}

export async function countCloudAccounts(): Promise<number> {
  const client = requireClient()
  const userId = requireSessionUserId()
  const { count, error } = await client
    .from('accounts')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)

  if (error) {
    throw new Error(`统计账户失败: ${error.message}`)
  }
  return count ?? 0
}

export async function insertCloudAccount(account: Account): Promise<void> {
  const client = requireClient()
  const userId = requireSessionUserId()
  const { error } = await client.from('accounts').insert(toRow(account, userId))
  if (error) {
    throw new Error(`写入云端账户失败: ${error.message}`)
  }
}

export async function insertCloudAccounts(accounts: Account[]): Promise<void> {
  if (accounts.length === 0) return
  const client = requireClient()
  const userId = requireSessionUserId()
  const { error } = await client
    .from('accounts')
    .insert(accounts.map((a) => toRow(a, userId)))
  if (error) {
    throw new Error(`批量写入云端账户失败: ${error.message}`)
  }
}

export async function updateCloudAccount(
  id: string,
  patch: Partial<
    Pick<Account, 'name' | 'type' | 'balance' | 'color' | 'icon' | 'sortOrder' | 'updatedAt'>
  >,
): Promise<void> {
  const client = requireClient()
  const userId = requireSessionUserId()
  const row: Record<string, unknown> = {}
  if (patch.name !== undefined) row.name = patch.name
  if (patch.type !== undefined) row.type = patch.type
  if (patch.balance !== undefined) row.balance = patch.balance
  if (patch.color !== undefined) row.color = patch.color
  if (patch.icon !== undefined) row.icon = patch.icon ?? null
  if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder
  if (patch.updatedAt !== undefined) row.updated_at = patch.updatedAt

  const { error } = await client
    .from('accounts')
    .update(row)
    .eq('id', id)
    .eq('user_id', userId)

  if (error) {
    throw new Error(`更新云端账户失败: ${error.message}`)
  }
}

export async function deleteCloudAccount(id: string): Promise<void> {
  const client = requireClient()
  const userId = requireSessionUserId()
  const { error } = await client
    .from('accounts')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)

  if (error) {
    throw new Error(`删除云端账户失败: ${error.message}`)
  }
}

/** 按差额调整余额（先读后写；个人账本场景足够） */
export async function adjustCloudAccountBalance(
  id: string,
  delta: number,
): Promise<void> {
  const account = await getCloudAccount(id)
  if (!account) {
    throw new Error('账户不存在')
  }
  const next = Math.round((account.balance + delta) * 100) / 100
  await updateCloudAccount(id, {
    balance: next,
    updatedAt: new Date().toISOString(),
  })
}
