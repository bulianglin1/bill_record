/**
 * 支付宝账单 CSV 导入解析器（预留接口）。
 *
 * 支付宝导出账单常见字段：
 * 交易时间, 交易分类, 交易对方, 对方账号, 商品说明, 收/支, 金额, 收/付款方式, 交易状态, 交易订单号, 商家订单号, 备注
 */
import type { ImportResult } from '@/types'
import type { BillImporter, ParsedCsvRow } from '@/utils/import/types'

function splitCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (ch === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
      continue
    }
    current += ch
  }
  result.push(current.trim())
  return result
}

function normalizeAmount(raw: string): number {
  const cleaned = raw.replace(/[¥￥,\s]/g, '')
  const value = Number.parseFloat(cleaned)
  return Number.isFinite(value) ? Math.abs(value) : NaN
}

function findHeaderIndex(lines: string[]): number {
  return lines.findIndex(
    (line) =>
      (line.includes('交易时间') || line.includes('创建时间')) &&
      (line.includes('金额') || line.includes('收/支')),
  )
}

function mapRow(cols: string[], headers: string[]): ParsedCsvRow | null {
  const get = (keys: string[]): string => {
    for (const key of keys) {
      const idx = headers.findIndex((h) => h.includes(key))
      if (idx >= 0 && cols[idx]) {
        return cols[idx]!
      }
    }
    return ''
  }

  const dateRaw = get(['交易时间', '创建时间', '时间'])
  const direction = get(['收/支'])
  const amountRaw = get(['金额'])
  const category = get(['交易分类', '分类']) || '其他'
  const counterparty = get(['交易对方', '对方'])
  const product = get(['商品说明', '商品'])
  const noteRaw = get(['备注'])
  const status = get(['交易状态', '状态'])

  if (!dateRaw || !amountRaw) {
    return null
  }

  // 跳过关闭/失败交易
  if (status && (status.includes('关闭') || status.includes('失败'))) {
    return null
  }

  const amount = normalizeAmount(amountRaw)
  if (!Number.isFinite(amount) || amount === 0) {
    return null
  }

  const isIncome = direction.includes('收入')
  const isExpense = direction.includes('支出')
  if (!isIncome && !isExpense) {
    return null
  }

  const date = dateRaw.slice(0, 10).replace(/\//g, '-')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return null
  }

  const note = [counterparty, product, noteRaw]
    .map((s) => s.trim())
    .filter((s) => s && s !== '/')
    .join(' · ')

  return {
    date,
    amount,
    type: isIncome ? 'income' : 'expense',
    category: category || '其他',
    note,
  }
}

export const alipayImporter: BillImporter = {
  source: 'alipay',
  label: '支付宝账单',

  async parse(csvText: string, accountId: string): Promise<ImportResult> {
    const errors: string[] = []
    const lines = csvText
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)

    const headerIdx = findHeaderIndex(lines)
    if (headerIdx < 0) {
      return {
        success: false,
        transactions: [],
        errors: [
          '未识别到支付宝账单表头。请使用支付宝导出的 CSV 原文件（多为 GBK 编码，应用已自动识别）。',
        ],
        skipped: 0,
      }
    }

    // 支付宝导出表头常带尾逗号，产生空列名，保留索引对齐即可
    const headers = splitCsvLine(lines[headerIdx]!)
    const transactions: ImportResult['transactions'] = []
    let skipped = 0

    for (let i = headerIdx + 1; i < lines.length; i += 1) {
      const cols = splitCsvLine(lines[i]!)
      if (cols.filter(Boolean).length < 3) {
        skipped += 1
        continue
      }
      try {
        const parsed = mapRow(cols, headers)
        if (!parsed) {
          skipped += 1
          continue
        }
        transactions.push({
          ...parsed,
          accountId,
          source: 'alipay',
        })
      } catch (err) {
        errors.push(`第 ${i + 1} 行解析失败: ${err instanceof Error ? err.message : String(err)}`)
        skipped += 1
      }
    }

    return {
      success: errors.length === 0 || transactions.length > 0,
      transactions,
      errors,
      skipped,
    }
  },
}
