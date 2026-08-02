import { DEFAULT_ACCOUNTS } from '@/lib/constants'
import {
  adjustCloudAccountBalance,
  countCloudAccounts,
  deleteCloudAccount,
  getCloudAccount,
  insertCloudAccount,
  insertCloudAccounts,
  listCloudAccounts,
  updateCloudAccount,
} from '@/services/cloudAccountService'
import { countCloudTransactionsByAccount } from '@/services/cloudTransactionService'
import { recordTodayAssetSnapshotSafe } from '@/services/assetSnapshotService'
import { createId, nowIso } from '@/utils/id'
import type { Account, AccountType } from '@/types'

export async function listAccounts(): Promise<Account[]> {
  return listCloudAccounts()
}

export async function getAccount(id: string): Promise<Account | undefined> {
  const account = await getCloudAccount(id)
  return account ?? undefined
}

/** 云端无账户时写入默认银行/支付账户 */
export async function seedDefaultAccountsIfEmpty(): Promise<Account[]> {
  const count = await countCloudAccounts()
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

  await insertCloudAccounts(accounts)
  return accounts
}

export async function createAccount(input: {
  name: string
  type: AccountType
  balance: number
  color: string
}): Promise<Account> {
  const now = nowIso()
  const existing = await listCloudAccounts()
  const maxOrder =
    existing.length === 0
      ? 0
      : Math.max(...existing.map((a) => a.sortOrder)) + 1

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
  await insertCloudAccount(account)
  await recordTodayAssetSnapshotSafe()
  return account
}

export async function updateAccount(
  id: string,
  patch: Partial<Pick<Account, 'name' | 'type' | 'balance' | 'color'>>,
): Promise<void> {
  const updates: Partial<
    Pick<Account, 'name' | 'type' | 'balance' | 'color' | 'updatedAt'>
  > = { updatedAt: nowIso() }
  if (patch.name !== undefined) updates.name = patch.name.trim()
  if (patch.type !== undefined) updates.type = patch.type
  if (patch.balance !== undefined) updates.balance = roundMoney(patch.balance)
  if (patch.color !== undefined) updates.color = patch.color
  await updateCloudAccount(id, updates)
  await recordTodayAssetSnapshotSafe()
}

export async function deleteAccount(id: string): Promise<void> {
  const linked = await countCloudTransactionsByAccount(id)
  if (linked > 0) {
    throw new Error('该账户下仍有流水，请先删除或迁移流水后再删除账户')
  }
  await deleteCloudAccount(id)
  await recordTodayAssetSnapshotSafe()
}

/** 供流水服务调整余额 */
export async function applyAccountBalanceDelta(
  accountId: string,
  delta: number,
): Promise<void> {
  await adjustCloudAccountBalance(accountId, roundMoney(delta))
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

export function sumBalances(accounts: Account[]): number {
  return roundMoney(accounts.reduce((sum, a) => sum + a.balance, 0))
}
