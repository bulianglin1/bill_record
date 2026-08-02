import {
  applyAccountBalanceDelta,
  roundMoney,
} from '@/services/accountService'
import { recordTodayAssetSnapshotSafe } from '@/services/assetSnapshotService'
import {
  deleteCloudTransaction,
  deleteCloudTransactions,
  getCloudTransaction,
  insertCloudTransaction,
  insertCloudTransactions,
  listCloudTransactions,
  listCloudTransactionsPaged,
  summarizeCloudTransactions,
  type CloudTransactionSummary,
  type ListCloudTransactionsOptions,
  type PagedCloudTransactions,
  type TransactionSortKey,
} from '@/services/cloudTransactionService'
import { createId, nowIso } from '@/utils/id'
import type { Transaction, TransactionType } from '@/types'

export type ListTransactionsOptions = ListCloudTransactionsOptions
export type {
  CloudTransactionSummary,
  PagedCloudTransactions,
  TransactionSortKey,
}

export interface TransactionInput {
  date: string
  amount: number
  type: TransactionType
  accountId: string
  toAccountId?: string
  category: string
  note: string
  source?: Transaction['source']
}

/** 按条件列出流水（仅云端） */
export async function listTransactions(
  options?: ListTransactionsOptions,
): Promise<Transaction[]> {
  return listCloudTransactions(options)
}

/** 分页列出流水 */
export async function listTransactionsPaged(
  options: ListTransactionsOptions & { page: number; pageSize: number },
): Promise<PagedCloudTransactions> {
  return listCloudTransactionsPaged(options)
}

/** 筛选范围内收支汇总（轻量） */
export async function summarizeTransactions(
  options?: Pick<
    ListTransactionsOptions,
    'yearMonth' | 'startDate' | 'endDate' | 'accountId'
  >,
): Promise<CloudTransactionSummary> {
  return summarizeCloudTransactions(options)
}

/**
 * 新增流水：先写云端流水，再更新云端账户余额。
 * 必须联网；任一步失败会尽力回滚。
 */
export async function createTransaction(input: TransactionInput): Promise<Transaction> {
  const amount = roundMoney(Math.abs(input.amount))
  if (amount <= 0) {
    throw new Error('金额必须大于 0')
  }
  if (input.type === 'transfer' && !input.toAccountId) {
    throw new Error('转账必须指定目标账户')
  }
  if (input.type === 'transfer' && input.toAccountId === input.accountId) {
    throw new Error('转账的源账户与目标账户不能相同')
  }

  const now = nowIso()
  const tx: Transaction = {
    id: createId(),
    date: input.date,
    amount,
    type: input.type,
    accountId: input.accountId,
    toAccountId: input.type === 'transfer' ? input.toAccountId : undefined,
    category: input.category || '其他',
    note: input.note?.trim() ?? '',
    source: input.source ?? 'manual',
    createdAt: now,
    updatedAt: now,
  }

  await insertCloudTransaction(tx)

  try {
    await applyBalanceDelta(tx, 1)
  } catch (err) {
    try {
      await deleteCloudTransaction(tx.id)
    } catch {
      // 忽略回滚失败，向上抛出原始错误
    }
    throw err
  }

  await recordTodayAssetSnapshotSafe()
  return tx
}

export async function deleteTransaction(id: string): Promise<void> {
  const existing = await getCloudTransaction(id)
  if (!existing) {
    await deleteCloudTransaction(id)
    return
  }

  // 先回滚余额，再删流水；删失败则反向补回余额
  await applyBalanceDelta(existing, -1)
  try {
    await deleteCloudTransaction(id)
  } catch (err) {
    try {
      await applyBalanceDelta(existing, 1)
    } catch {
      // 忽略二次回滚失败
    }
    throw err
  }
  await recordTodayAssetSnapshotSafe()
}

/**
 * 批量导入：一次写入全部流水，再按账户合并调整余额。
 * 余额更新失败时会尽力回滚已插入流水。
 */
export async function bulkImportTransactions(
  items: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>[],
): Promise<number> {
  if (items.length === 0) {
    return 0
  }

  const now = nowIso()
  const txs: Transaction[] = []
  const balanceDeltas = new Map<string, number>()

  for (const item of items) {
    const amount = roundMoney(Math.abs(item.amount))
    if (amount <= 0) {
      throw new Error('金额必须大于 0')
    }
    if (item.type === 'transfer' && !item.toAccountId) {
      throw new Error('转账必须指定目标账户')
    }
    if (item.type === 'transfer' && item.toAccountId === item.accountId) {
      throw new Error('转账的源账户与目标账户不能相同')
    }

    const tx: Transaction = {
      id: createId(),
      date: item.date,
      amount,
      type: item.type,
      accountId: item.accountId,
      toAccountId: item.type === 'transfer' ? item.toAccountId : undefined,
      category: item.category || '其他',
      note: item.note?.trim() ?? '',
      source: item.source ?? 'manual',
      createdAt: now,
      updatedAt: now,
    }
    txs.push(tx)
    accumulateBalanceDelta(balanceDeltas, tx, 1)
  }

  await insertCloudTransactions(txs)

  try {
    for (const [accountId, delta] of balanceDeltas) {
      if (delta === 0) continue
      await applyAccountBalanceDelta(accountId, delta)
    }
  } catch (err) {
    try {
      await deleteCloudTransactions(txs.map((tx) => tx.id))
    } catch {
      // 忽略回滚失败，向上抛出原始错误
    }
    throw err
  }

  await recordTodayAssetSnapshotSafe()
  return txs.length
}

/** 将单笔流水对账户余额的影响累加到 Map */
function accumulateBalanceDelta(
  deltas: Map<string, number>,
  tx: Transaction,
  direction: 1 | -1,
): void {
  const amount = roundMoney(tx.amount * direction)

  if (tx.type === 'expense') {
    addDelta(deltas, tx.accountId, -amount)
    return
  }
  if (tx.type === 'income') {
    addDelta(deltas, tx.accountId, amount)
    return
  }
  addDelta(deltas, tx.accountId, -amount)
  if (tx.toAccountId) {
    addDelta(deltas, tx.toAccountId, amount)
  }
}

function addDelta(deltas: Map<string, number>, accountId: string, delta: number): void {
  deltas.set(accountId, roundMoney((deltas.get(accountId) ?? 0) + delta))
}

async function applyBalanceDelta(tx: Transaction, direction: 1 | -1): Promise<void> {
  const deltas = new Map<string, number>()
  accumulateBalanceDelta(deltas, tx, direction)
  for (const [accountId, delta] of deltas) {
    if (delta === 0) continue
    await applyAccountBalanceDelta(accountId, delta)
  }
}
