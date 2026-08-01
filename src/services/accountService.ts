import { DEFAULT_ACCOUNTS } from '@/lib/constants'
import { bumpLocalVersion, createId, db, nowIso } from '@/lib/db'
import { recordTodayAssetSnapshotSafe } from '@/services/assetSnapshotService'
import type { Account, AccountType } from '@/types'

export async function listAccounts(): Promise<Account[]> {
  return db.accounts.orderBy('sortOrder').toArray()
}

export async function getAccount(id: string): Promise<Account | undefined> {
  return db.accounts.get(id)
}

/** 初始化默认银行/支付账户（仅在空库时） */
export async function seedDefaultAccountsIfEmpty(): Promise<Account[]> {
  const count = await db.accounts.count()
  if (count > 0) {
    return listAccounts()
  }

  const now = nowIso()
  const accounts: Account[] = DEFAULT_ACCOUNTS.map((item, index) => ({
    id: createId(),
    name: item.name,
    type: item.type,
    balance: 0,
    currency: 'CNY',
    color: item.color,
    sortOrder: index,
    createdAt: now,
    updatedAt: now,
  }))

  await db.accounts.bulkAdd(accounts)
  await bumpLocalVersion()
  return accounts
}

export async function createAccount(input: {
  name: string
  type: AccountType
  balance: number
  color: string
}): Promise<Account> {
  const now = nowIso()
  const maxOrder = await db.accounts.count()
  const account: Account = {
    id: createId(),
    name: input.name.trim(),
    type: input.type,
    balance: roundMoney(input.balance),
    currency: 'CNY',
    color: input.color,
    sortOrder: maxOrder,
    createdAt: now,
    updatedAt: now,
  }
  await db.accounts.add(account)
  await bumpLocalVersion()
  await recordTodayAssetSnapshotSafe()
  return account
}

export async function updateAccount(
  id: string,
  patch: Partial<Pick<Account, 'name' | 'type' | 'balance' | 'color'>>,
): Promise<void> {
  const updates: Partial<Account> = { updatedAt: nowIso() }
  if (patch.name !== undefined) updates.name = patch.name.trim()
  if (patch.type !== undefined) updates.type = patch.type
  if (patch.balance !== undefined) updates.balance = roundMoney(patch.balance)
  if (patch.color !== undefined) updates.color = patch.color
  await db.accounts.update(id, updates)
  await bumpLocalVersion()
  await recordTodayAssetSnapshotSafe()
}

export async function deleteAccount(id: string): Promise<void> {
  const linked = await db.transactions.where('accountId').equals(id).count()
  if (linked > 0) {
    throw new Error('该账户下仍有流水，请先删除或迁移流水后再删除账户')
  }
  await db.accounts.delete(id)
  await bumpLocalVersion()
  await recordTodayAssetSnapshotSafe()
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

export function sumBalances(accounts: Account[]): number {
  return roundMoney(accounts.reduce((sum, a) => sum + a.balance, 0))
}
