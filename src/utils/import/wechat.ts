/**
 * 微信账单 CSV 导入解析器（预留接口）。
 *
 * 微信导出账单通常为 GBK 编码 CSV，表头约在第 17 行附近，字段大致为：
 * 交易时间, 交易类型, 交易对方, 商品, 收/支, 金额(元), 支付方式, 当前状态, 交易单号, 商户单号, 备注
 *
 * 实际表头可能随微信版本变化，本解析器做了容错与字段映射。
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
    (line) => line.includes('交易时间') && (line.includes('金额') || line.includes('收/支')),
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

  const dateRaw = get(['交易时间', '时间'])
  const direction = get(['收/支', '类型'])
  const amountRaw = get(['金额'])
  const category = get(['交易类型', '类型']) || '其他'
  const counterparty = get(['交易对方', '对方'])
  const product = get(['商品', '商品说明'])
  const noteRaw = get(['备注'])

  if (!dateRaw || !amountRaw) {
    return null
  }

  const amount = normalizeAmount(amountRaw)
  if (!Number.isFinite(amount) || amount === 0) {
    return null
  }

  const isIncome = direction.includes('收入') || direction.includes('入')
  const isExpense = direction.includes('支出') || direction.includes('出')
  if (!isIncome && !isExpense) {
    // 中性流水（如理财通）跳过
    return null
  }

  const date = dateRaw.slice(0, 10).replace(/\//g, '-')
  const note = [counterparty, product, noteRaw].filter(Boolean).join(' · ')

  return {
    date,
    amount,
    type: isIncome ? 'income' : 'expense',
    category: category || (isIncome ? '其他' : '其他'),
    note,
  }
}

export const wechatImporter: BillImporter = {
  source: 'wechat',
  label: '微信账单 CSV',

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
        errors: ['未识别到微信账单表头，请确认导出的是 CSV 原文件'],
        skipped: 0,
      }
    }

    const headers = splitCsvLine(lines[headerIdx]!)
    const transactions: ImportResult['transactions'] = []
    let skipped = 0

    for (let i = headerIdx + 1; i < lines.length; i += 1) {
      const cols = splitCsvLine(lines[i]!)
      if (cols.length < 3) {
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
          source: 'wechat',
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
