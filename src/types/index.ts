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

/** 应用元数据（同步状态等） */
export interface AppMeta {
  id: string
  /** 本地数据版本，每次变更 +1 */
  localVersion: number
  /** 云端版本号（与 Supabase vaults.version 对齐） */
  remoteVersion: number
  lastSyncedAt?: string
  /** PBKDF2 盐值（Base64），首次设置 Master Password 时生成 */
  salt?: string
}

/** vaults 内汇总（总收入等）；流水不在密文包中 */
export interface VaultSummary {
  /** 累计收入 */
  totalIncome: number
  /** 累计支出 */
  totalExpense: number
  /** 总资产（账户余额合计） */
  totalAssets: number
}

/** 导出/同步用保险库快照（加密前；不含流水明细） */
export interface VaultSnapshot {
  accounts: Account[]
  summary: VaultSummary
  exportedAt: string
  schemaVersion: number
  /** @deprecated v1 兼容，拉取时若存在则忽略并改从流水表加载 */
  transactions?: Transaction[]
}

/** Supabase vaults 表行 */
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

/** 加密后的载荷 */
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
