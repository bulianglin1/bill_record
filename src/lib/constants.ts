import type { AccountType } from '@/types'

/** 本地库 Schema 版本 */
export const LOCAL_SCHEMA_VERSION = 1

/** 保险库快照 Schema 版本（v2：流水改云端表，快照仅账户+汇总） */
export const VAULT_SCHEMA_VERSION = 2

/** PBKDF2 迭代次数（平衡安全性与浏览器性能） */
export const PBKDF2_ITERATIONS = 310_000

/** AES-GCM 密钥长度（bit） */
export const AES_KEY_LENGTH = 256

/** AES-GCM IV 长度（byte） */
export const AES_IV_LENGTH = 12

/** 会话存储 Key：标记已解锁（不存密码明文） */
export const SESSION_UNLOCKED_KEY = 'bill_record_unlocked'

/**
 * 会话存储 Key：登录密码（仅 sessionStorage，同标签页刷新可续登；关标签即清）
 * 用于 vaults AES；勿改 localStorage，避免长期落盘明文密码。
 */
export const SESSION_LOGIN_PASSWORD_KEY = 'bill_record_login_password'

/** 主题存储 Key */
export const THEME_STORAGE_KEY = 'bill_record_theme'

/** 默认账户模板 */
export const DEFAULT_ACCOUNTS: Array<{
  name: string
  type: AccountType
  color: string
}> = [
  { name: '光大银行', type: 'bank', color: '#7C3AED' },
  { name: '浦发银行', type: 'bank', color: '#0EA5E9' },
  { name: '工商银行', type: 'bank', color: '#DC2626' },
  { name: '招商银行', type: 'bank', color: '#EF4444' },
  { name: '支付宝', type: 'payment', color: '#1677FF' },
  { name: '微信', type: 'payment', color: '#07C160' },
]

/** 支出类别 */
export const EXPENSE_CATEGORIES = [
  '餐饮',
  '交通',
  '购物',
  '居住',
  '娱乐',
  '医疗',
  '教育',
  '通讯',
  '转账',
  '其他',
] as const

/** 收入类别 */
export const INCOME_CATEGORIES = [
  '工资',
  '奖金',
  '理财',
  '兼职',
  '红包',
  '退款',
  '其他',
] as const

/** Meta 表固定主键 */
export const META_ID = 'app'
