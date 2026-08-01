/**
 * Supabase public.transactions 明文流水（记账即时写入）。
 */
import { requireSessionUserId } from '@/lib/authSession'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
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

/** 拉取当前用户全部云端流水 */
export async function listCloudTransactions(): Promise<Transaction[]> {
  const client = requireClient()
  const userId = requireSessionUserId()
  const { data, error } = await client
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })

  if (error) {
    throw new Error(`拉取云端流水失败: ${error.message}`)
  }

  return ((data as CloudTransactionRow[]) ?? []).map(fromRow)
}
