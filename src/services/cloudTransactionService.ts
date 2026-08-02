/**
 * Supabase public.transactions 明文流水（记账即时写入）。
 */
import { requireSessionUserId } from '@/lib/authSession'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { monthDateRange } from '@/services/cloudAssetSnapshotService'
import type { Transaction } from '@/types'

interface CloudTransactionRow {
  id: string
  user_id: string
  date: string
  amount: number | string
  type: string
  account_id: string
  to_account_id: string | null
  category: string
  note: string
  source: string | null
  created_at: string
  updated_at: string
}

/** 云端流水列表查询条件（均在数据库侧过滤） */
export interface ListCloudTransactionsOptions {
  /** YYYY-MM，按自然月过滤 date */
  yearMonth?: string
  /** 起始日期 YYYY-MM-DD（与 yearMonth 互斥，yearMonth 优先） */
  startDate?: string
  /** 结束日期 YYYY-MM-DD */
  endDate?: string
  /** 账户：匹配转出或转入 */
  accountId?: string
  /** 最多返回条数 */
  limit?: number
}

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('需要联网并配置 Supabase 后才能记账')
  }
  return supabase
}

function toRow(tx: Transaction, userId: string) {
  return {
    id: tx.id,
    user_id: userId,
    date: tx.date.slice(0, 10),
    amount: tx.amount,
    type: tx.type,
    account_id: tx.accountId,
    to_account_id: tx.toAccountId ?? null,
    category: tx.category,
    note: tx.note ?? '',
    source: tx.source ?? 'manual',
    created_at: tx.createdAt,
    updated_at: tx.updatedAt,
  }
}

function fromRow(row: CloudTransactionRow): Transaction {
  return {
    id: row.id,
    date: String(row.date).slice(0, 10),
    amount: Number(row.amount),
    type: row.type as Transaction['type'],
    accountId: row.account_id,
    toAccountId: row.to_account_id ?? undefined,
    category: row.category,
    note: row.note ?? '',
    source: (row.source as Transaction['source']) ?? 'manual',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** 立即插入一条云端流水 */
export async function insertCloudTransaction(tx: Transaction): Promise<void> {
  const client = requireClient()
  const userId = requireSessionUserId()
  const { error } = await client.from('transactions').insert(toRow(tx, userId))
  if (error) {
    throw new Error(`写入云端流水失败（需联网）: ${error.message}`)
  }
}

/** 删除一条云端流水 */
export async function deleteCloudTransaction(id: string): Promise<void> {
  const client = requireClient()
  const userId = requireSessionUserId()
  const { error } = await client
    .from('transactions')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
  if (error) {
    throw new Error(`删除云端流水失败（需联网）: ${error.message}`)
  }
}

/** 统计某账户相关流水条数（转出或转入） */
export async function countCloudTransactionsByAccount(
  accountId: string,
): Promise<number> {
  const client = requireClient()
  const userId = requireSessionUserId()
  const { count, error } = await client
    .from('transactions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .or(`account_id.eq.${accountId},to_account_id.eq.${accountId}`)

  if (error) {
    throw new Error(`统计账户流水失败: ${error.message}`)
  }
  return count ?? 0
}

/** 按 id 取单条云端流水 */
export async function getCloudTransaction(id: string): Promise<Transaction | null> {
  const client = requireClient()
  const userId = requireSessionUserId()
  const { data, error } = await client
    .from('transactions')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw new Error(`查询流水失败: ${error.message}`)
  }
  if (!data) return null
  return fromRow(data as CloudTransactionRow)
}

/**
 * 按条件拉取云端流水（user_id + 可选月份/日期/账户/条数）。
 */
export async function listCloudTransactions(
  options?: ListCloudTransactionsOptions,
): Promise<Transaction[]> {
  const client = requireClient()
  const userId = requireSessionUserId()

  let query = client
    .from('transactions')
    .select('*')
    .eq('user_id', userId)

  if (options?.yearMonth) {
    const { start, end } = monthDateRange(options.yearMonth)
    query = query.gte('date', start).lte('date', end)
  } else {
    if (options?.startDate) {
      query = query.gte('date', options.startDate)
    }
    if (options?.endDate) {
      query = query.lte('date', options.endDate)
    }
  }

  if (options?.accountId) {
    const accountId = options.accountId
    query = query.or(`account_id.eq.${accountId},to_account_id.eq.${accountId}`)
  }

  query = query
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })

  if (options?.limit !== undefined) {
    query = query.limit(options.limit)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`拉取云端流水失败: ${error.message}`)
  }

  return ((data as CloudTransactionRow[]) ?? []).map(fromRow)
}
