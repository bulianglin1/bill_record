/**
 * Dexie / IndexedDB 本地存储层。
 * 流水以云端 public.transactions 为准；本地作缓存。
 * vaults 快照仅含账户 + 汇总（总收入等）。
 */
import Dexie, { type Table } from 'dexie'
import { META_ID, VAULT_SCHEMA_VERSION } from '@/lib/constants'
import type {
  Account,
  AppMeta,
  Transaction,
  VaultSnapshot,
  VaultSummary,
} from '@/types'

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

export class BillDatabase extends Dexie {
  accounts!: Table<Account, string>
  transactions!: Table<Transaction, string>
  meta!: Table<AppMeta, string>

  constructor() {
    super('bill_record_db')
    this.version(1).stores({
      accounts: 'id, name, type, sortOrder',
      transactions: 'id, date, accountId, type, category, source',
      meta: 'id',
    })
  }
}

export const db = new BillDatabase()

/** 生成 UUID（优先原生） */
export function createId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function nowIso(): string {
  return new Date().toISOString()
}

/** 确保 meta 行存在并返回 */
export async function ensureMeta(): Promise<AppMeta> {
  const existing = await db.meta.get(META_ID)
  if (existing) {
    return existing
  }
  const meta: AppMeta = {
    id: META_ID,
    localVersion: 0,
    remoteVersion: 0,
  }
  await db.meta.put(meta)
  return meta
}

/** 本地数据变更后递增版本，用于 vaults 同步冲突检测 */
export async function bumpLocalVersion(): Promise<number> {
  const meta = await ensureMeta()
  const next = meta.localVersion + 1
  await db.meta.update(META_ID, { localVersion: next })
  return next
}

/** 根据本地流水计算汇总（写入 vaults） */
export async function buildVaultSummary(
  accounts?: Account[],
  transactions?: Transaction[],
): Promise<VaultSummary> {
  const accs = accounts ?? (await db.accounts.toArray())
  const txs = transactions ?? (await db.transactions.toArray())
  let totalIncome = 0
  let totalExpense = 0
  for (const t of txs) {
    if (t.type === 'income') totalIncome += t.amount
    if (t.type === 'expense') totalExpense += t.amount
  }
  return {
    totalIncome: roundMoney(totalIncome),
    totalExpense: roundMoney(totalExpense),
    totalAssets: roundMoney(accs.reduce((sum, a) => sum + a.balance, 0)),
  }
}

/** 导出 vaults 快照（不含流水明细） */
export async function exportSnapshot(): Promise<VaultSnapshot> {
  const accounts = await db.accounts.toArray()
  const summary = await buildVaultSummary(accounts)
  return {
    accounts,
    summary,
    exportedAt: nowIso(),
    schemaVersion: VAULT_SCHEMA_VERSION,
  }
}

/**
 * 用云端 vaults 快照覆盖本地账户（不清空流水；流水另从流水表拉取）。
 */
export async function importSnapshot(
  snapshot: VaultSnapshot,
  remoteVersion: number,
  salt?: string,
): Promise<void> {
  const prev = await db.meta.get(META_ID)
  await db.transaction('rw', db.accounts, db.meta, async () => {
    await db.accounts.clear()
    if (snapshot.accounts.length > 0) {
      await db.accounts.bulkPut(snapshot.accounts)
    }
    await db.meta.put({
      id: META_ID,
      localVersion: remoteVersion,
      remoteVersion,
      lastSyncedAt: nowIso(),
      salt: salt ?? prev?.salt,
    })
  })
}

/** 用云端流水列表覆盖本地流水缓存 */
export async function replaceLocalTransactions(
  transactions: Transaction[],
): Promise<void> {
  await db.transaction('rw', db.transactions, async () => {
    await db.transactions.clear()
    if (transactions.length > 0) {
      await db.transactions.bulkPut(transactions)
    }
  })
}

/** 清空全部本地业务数据 */
export async function clearAllData(): Promise<void> {
  await db.transaction('rw', db.accounts, db.transactions, db.meta, async () => {
    await db.accounts.clear()
    await db.transactions.clear()
    await db.meta.clear()
  })
}
