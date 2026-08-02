/**
 * Supabase public.transactions 明文流水（记账即时写入）。
 */
import { requireSessionUserId } from '@/lib/authSession'
import { dedupeAsync } from '@/lib/dedupeAsync'
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

/** 流水排序（与流水页 sortKey 对齐） */
export type TransactionSortKey =
  | 'date_desc'
  | 'date_asc'
  | 'amount_desc'
  | 'amount_asc'

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
  /** 页码（从 1 起；与 pageSize 同时使用时走分页） */
  page?: number
  /** 每页条数 */
  pageSize?: number
  /** 排序；默认 date_desc */
  sortKey?: TransactionSortKey
}

/** 分页列表结果 */
export interface PagedCloudTransactions {
  items: Transaction[]
  total: number
  page: number
  pageSize: number
}

/** 筛选范围内的收支汇总（轻量字段聚合） */
export interface CloudTransactionSummary {
  total: number
  income: number
  expense: number
  incomeCount: number
  expenseCount: number
  transferCount: number
  net: number
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

/** 单次批量插入上限，避免请求体过大 */
const BULK_INSERT_CHUNK_SIZE = 500

/** 批量插入云端流水（按 chunk 写入） */
export async function insertCloudTransactions(txs: Transaction[]): Promise<void> {
  if (txs.length === 0) return
  const client = requireClient()
  const userId = requireSessionUserId()

  for (let i = 0; i < txs.length; i += BULK_INSERT_CHUNK_SIZE) {
    const chunk = txs.slice(i, i + BULK_INSERT_CHUNK_SIZE)
    const { error } = await client
      .from('transactions')
      .insert(chunk.map((tx) => toRow(tx, userId)))
    if (error) {
      throw new Error(`批量写入云端流水失败（需联网）: ${error.message}`)
    }
  }
}

/** 按 id 列表批量删除云端流水（用于导入失败回滚） */
export async function deleteCloudTransactions(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const client = requireClient()
  const userId = requireSessionUserId()

  for (let i = 0; i < ids.length; i += BULK_INSERT_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + BULK_INSERT_CHUNK_SIZE)
    const { error } = await client
      .from('transactions')
      .delete()
      .eq('user_id', userId)
      .in('id', chunk)
    if (error) {
      throw new Error(`批量删除云端流水失败（需联网）: ${error.message}`)
    }
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

type FilterOptions = Pick<
  ListCloudTransactionsOptions,
  'yearMonth' | 'startDate' | 'endDate' | 'accountId'
>

// Supabase 查询建造器链式类型较重，此处用宽松类型复用过滤/排序
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TxQuery = any

/** 应用日期/账户过滤（不含排序与分页） */
function applyTransactionFilters(
  query: TxQuery,
  options: FilterOptions | undefined,
): TxQuery {
  let next = query
  if (options?.yearMonth) {
    const { start, end } = monthDateRange(options.yearMonth)
    next = next.gte('date', start).lte('date', end)
  } else {
    if (options?.startDate) {
      next = next.gte('date', options.startDate)
    }
    if (options?.endDate) {
      next = next.lte('date', options.endDate)
    }
  }
  if (options?.accountId) {
    const accountId = options.accountId
    next = next.or(`account_id.eq.${accountId},to_account_id.eq.${accountId}`)
  }
  return next
}

function applyTransactionSort(
  query: TxQuery,
  sortKey: TransactionSortKey = 'date_desc',
): TxQuery {
  if (sortKey === 'date_asc') {
    return query
      .order('date', { ascending: true })
      .order('created_at', { ascending: true })
  }
  if (sortKey === 'amount_desc') {
    return query
      .order('amount', { ascending: false })
      .order('date', { ascending: false })
  }
  if (sortKey === 'amount_asc') {
    return query
      .order('amount', { ascending: true })
      .order('date', { ascending: false })
  }
  return query
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
}

/**
 * 按条件拉取云端流水（user_id + 可选月份/日期/账户/条数）。
 * 相同条件的进行中请求会合并，避免 Strict Mode 双挂载重复打网。
 */
export async function listCloudTransactions(
  options?: ListCloudTransactionsOptions,
): Promise<Transaction[]> {
  const userId = requireSessionUserId()
  const key = [
    'transactions:list',
    userId,
    options?.yearMonth ?? '',
    options?.startDate ?? '',
    options?.endDate ?? '',
    options?.accountId ?? '',
    options?.limit ?? '',
    options?.sortKey ?? '',
  ].join(':')

  return dedupeAsync(key, async () => {
    const client = requireClient()

    let query = client
      .from('transactions')
      .select('*')
      .eq('user_id', userId)

    query = applyTransactionFilters(query, options)
    query = applyTransactionSort(query, options?.sortKey)

    if (options?.limit !== undefined) {
      query = query.limit(options.limit)
    }

    const { data, error } = await query

    if (error) {
      throw new Error(`拉取云端流水失败: ${error.message}`)
    }

    return ((data as CloudTransactionRow[]) ?? []).map(fromRow)
  })
}

/**
 * 分页拉取云端流水（含 total）。
 * page 从 1 起；与 listCloudTransactions 共用过滤/排序逻辑。
 */
export async function listCloudTransactionsPaged(
  options: ListCloudTransactionsOptions & {
    page: number
    pageSize: number
  },
): Promise<PagedCloudTransactions> {
  const page = Math.max(1, Math.floor(options.page) || 1)
  const pageSize = Math.max(1, Math.floor(options.pageSize) || 20)
  const userId = requireSessionUserId()
  const key = [
    'transactions:paged',
    userId,
    options.yearMonth ?? '',
    options.startDate ?? '',
    options.endDate ?? '',
    options.accountId ?? '',
    options.sortKey ?? 'date_desc',
    page,
    pageSize,
  ].join(':')

  return dedupeAsync(key, async () => {
    const client = requireClient()
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = client
      .from('transactions')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)

    query = applyTransactionFilters(query, options)
    query = applyTransactionSort(query, options.sortKey)

    const { data, error, count } = await query.range(from, to)

    if (error) {
      throw new Error(`拉取云端流水失败: ${error.message}`)
    }

    return {
      items: ((data as CloudTransactionRow[]) ?? []).map(fromRow),
      total: count ?? 0,
      page,
      pageSize,
    }
  })
}

/**
 * 按筛选条件轻量汇总收支（只取 type/amount，不分页）。
 */
export async function summarizeCloudTransactions(
  options?: FilterOptions,
): Promise<CloudTransactionSummary> {
  const client = requireClient()
  const userId = requireSessionUserId()

  let query = client
    .from('transactions')
    .select('type, amount')
    .eq('user_id', userId)

  query = applyTransactionFilters(query, options)

  const { data, error } = await query

  if (error) {
    throw new Error(`汇总流水失败: ${error.message}`)
  }

  let income = 0
  let expense = 0
  let incomeCount = 0
  let expenseCount = 0
  let transferCount = 0

  for (const row of data ?? []) {
    const amount = Number((row as { amount: number | string }).amount) || 0
    const type = String((row as { type: string }).type)
    if (type === 'income') {
      income += amount
      incomeCount += 1
    } else if (type === 'expense') {
      expense += amount
      expenseCount += 1
    } else {
      transferCount += 1
    }
  }

  income = Math.round(income * 100) / 100
  expense = Math.round(expense * 100) / 100

  return {
    total: incomeCount + expenseCount + transferCount,
    income,
    expense,
    incomeCount,
    expenseCount,
    transferCount,
    net: Math.round((income - expense) * 100) / 100,
  }
}
