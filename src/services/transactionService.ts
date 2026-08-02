import {
  applyAccountBalanceDelta,
  roundMoney,
} from '@/services/accountService'
import { recordTodayAssetSnapshotSafe } from '@/services/assetSnapshotService'
import {
  deleteCloudTransaction,
  getCloudTransaction,
  insertCloudTransaction,
  listCloudTransactions,
  type ListCloudTransactionsOptions,
} from '@/services/cloudTransactionService'
import { createId, nowIso } from '@/utils/id'
import type { Transaction, TransactionType } from '@/types'

export type ListTransactionsOptions = ListCloudTransactionsOptions

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
 * 批量导入：逐条先云端后改余额；中断则已成功的保留。
 */
export async function bulkImportTransactions(
  items: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>[],
): Promise<number> {
  if (items.length === 0) {
    return 0
  }

  let imported = 0
  for (const item of items) {
    await createTransaction({
      date: item.date,
      amount: item.amount,
      type: item.type,
      accountId: item.accountId,
      toAccountId: item.toAccountId,
      category: item.category,
      note: item.note,
      source: item.source,
    })
    imported += 1
  }
  return imported
}

async function applyBalanceDelta(tx: Transaction, direction: 1 | -1): Promise<void> {
  const delta = roundMoney(tx.amount * direction)

  if (tx.type === 'expense') {
    await applyAccountBalanceDelta(tx.accountId, -delta)
    return
  }
  if (tx.type === 'income') {
    await applyAccountBalanceDelta(tx.accountId, delta)
    return
  }
  await applyAccountBalanceDelta(tx.accountId, -delta)
  if (tx.toAccountId) {
    await applyAccountBalanceDelta(tx.toAccountId, delta)
  }
}
