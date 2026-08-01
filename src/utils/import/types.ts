import type { ImportResult, TransactionType } from '@/types'

/** 账单导入解析器接口（微信 / 支付宝等） */
export interface BillImporter {
  /** 导入源标识 */
  source: 'wechat' | 'alipay'
  /** 显示名称 */
  label: string
  /**
   * 解析 CSV 文本。
   * @param csvText 原始 CSV 内容
   * @param accountId 导入到的目标账户 ID
   */
  parse(csvText: string, accountId: string): Promise<ImportResult>
}

export interface ParsedCsvRow {
  date: string
  amount: number
  type: TransactionType
  category: string
  note: string
}
