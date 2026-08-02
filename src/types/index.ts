/** 账户类型 */
export type AccountType = 'bank' | 'payment' | 'cash' | 'other'

/** 流水方向 */
export type TransactionType = 'expense' | 'income' | 'transfer'

/** 账户 */
export interface Account {
  id: string
  name: string
  type: AccountType
  /** 当前余额（单位：元，保留两位小数） */
  balance: number
  /** 币种，默认 CNY */
  currency: string
  color: string
  icon?: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

/** 流水记录 */
export interface Transaction {
  id: string
  /** ISO 日期 YYYY-MM-DD */
  date: string
  amount: number
  type: TransactionType
  accountId: string
  /** 转账目标账户（仅 transfer） */
  toAccountId?: string
  category: string
  note: string
  /** 导入来源标记 */
  source?: 'manual' | 'wechat' | 'alipay'
  createdAt: string
  updatedAt: string
}

/** 自建登录会话用户（对应 public.users） */
export interface AuthUser {
  id: string
  email: string
}

/** 旧 vaults 密文快照（仅迁移用） */
export interface VaultSnapshot {
  accounts: Account[]
  exportedAt?: string
  schemaVersion?: number
  transactions?: Transaction[]
}

/** 旧 Supabase vaults 表行（仅迁移用） */
export interface VaultRow {
  id: string
  user_id: string
  ciphertext: string
  iv: string
  salt: string
  version: number
  updated_at: string
  created_at: string
}

/** 加密后的载荷（登录哈希 / 旧 vault 迁移） */
export interface EncryptedPayload {
  ciphertext: string
  iv: string
  salt: string
}

/** CSV 导入解析结果 */
export interface ImportResult {
  success: boolean
  transactions: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>[]
  errors: string[]
  skipped: number
}
