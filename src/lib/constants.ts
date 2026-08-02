import type { AccountType } from '@/types'

/** PBKDF2 迭代次数（登录密码哈希 / 旧 vault 迁移解密） */
export const PBKDF2_ITERATIONS = 310_000

/** AES-GCM 密钥长度（bit），用于旧 vault 迁移解密 */
export const AES_KEY_LENGTH = 256

/** AES-GCM IV 长度（byte） */
export const AES_IV_LENGTH = 12

/** 会话存储 Key：标记账本已就绪（不存密码明文） */
export const SESSION_UNLOCKED_KEY = 'bill_record_unlocked'

/**
 * 会话存储 Key：登录密码（仅 sessionStorage，同标签页刷新可续登；关标签即清）
 * 勿改 localStorage，避免长期落盘明文密码。
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
