import {
  bumpLocalVersion,
  createId,
  db,
  nowIso,
  replaceLocalTransactions,
} from '@/lib/db'
import { roundMoney } from '@/services/accountService'
import {
  deleteCloudTransaction,
  insertCloudTransaction,
  listCloudTransactions,
} from '@/services/cloudTransactionService'
import type { Transaction, TransactionType } from '@/types'

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

/** 从云端刷新本地流水缓存（需联网） */
export async function refreshTransactionsFromCloud(): Promise<Transaction[]> {
  const remote = await listCloudTransactions()
  await replaceLocalTransactions(remote)
  return remote
}

/** 按日期倒序列出流水（读本地缓存；调用方应先 refresh） */
export async function listTransactions(options?: {
  accountId?: string
  limit?: number
}): Promise<Transaction[]> {
  let rows = await db.transactions.orderBy('date').reverse().toArray()

  if (options?.accountId) {
    rows = rows.filter(
      (t) => t.accountId === options.accountId || t.toAccountId === options.accountId,
    )
  }

  rows.sort((a, b) => {
    if (a.date === b.date) {
      return b.createdAt.localeCompare(a.createdAt)
    }
    return b.date.localeCompare(a.date)
  })

  if (options?.limit) {
    return rows.slice(0, options.limit)
  }
  return rows
}

/**
 * 新增流水：先写云端明文表，成功后再改本地余额与缓存。
 * 必须联网；云端失败则整笔失败。
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

  // 先云端，失败则不碰本地
  await insertCloudTransaction(tx)

  try {
    await db.transaction('rw', db.transactions, db.accounts, db.meta, async () => {
      await applyBalanceDelta(tx, 1)
      await db.transactions.add(tx)
      await bumpLocalVersion()
    })
  } catch (err) {
    // 尽力回滚云端，避免只剩远端脏数据
    try {
      await deleteCloudTransaction(tx.id)
    } catch {
      // 忽略回滚失败，向上抛出原始错误
    }
    throw err
  }

  return tx
}

export async function deleteTransaction(id: string): Promise<void> {
  const existing = await db.transactions.get(id)
  if (!existing) {
    // 仍尝试删云端（本地缓存可能未刷新）
    await deleteCloudTransaction(id)
    return
  }

  await deleteCloudTransaction(id)

  await db.transaction('rw', db.transactions, db.accounts, db.meta, async () => {
    await applyBalanceDelta(existing, -1)
    await db.transactions.delete(id)
    await bumpLocalVersion()
  })
}

/**
 * 批量导入：逐条先云端后本地；中断则已成功的保留。
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
    await adjustBalance(tx.accountId, -delta)
    return
  }
  if (tx.type === 'income') {
    await adjustBalance(tx.accountId, delta)
    return
  }
  await adjustBalance(tx.accountId, -delta)
  if (tx.toAccountId) {
    await adjustBalance(tx.toAccountId, delta)
  }
}

async function adjustBalance(accountId: string, delta: number): Promise<void> {
  const account = await db.accounts.get(accountId)
  if (!account) {
    throw new Error('账户不存在')
  }
  await db.accounts.update(accountId, {
    balance: roundMoney(account.balance + delta),
    updatedAt: nowIso(),
  })
}
