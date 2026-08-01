/**
 * 微信账单导入：支持 CSV 与 Excel（.xlsx）。
 *
 * 表头字段大致为：
 * 交易时间, 交易类型, 交易对方, 商品, 收/支, 金额(元), 支付方式, 当前状态, 交易单号, 商户单号, 备注
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

/** 统一成 YYYY-MM-DD（优先按东八区解释带时区的时间） */
function normalizeDate(raw: string): string {
  const text = raw.trim()
  if (!text) return ''

  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(text)) {
    const [y, m, d] = text.replace(/\//g, '-').split('-')
    return `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`
  }

  const parsed = new Date(text)
  if (!Number.isNaN(parsed.getTime())) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(parsed)
  }

  return text.slice(0, 10).replace(/\//g, '-')
}

function cleanNotePart(value: string): string {
  const v = value.trim()
  if (!v || v === '/') return ''
  return v
}

function findHeaderIndexInLines(lines: string[]): number {
  return lines.findIndex(
    (line) => line.includes('交易时间') && (line.includes('金额') || line.includes('收/支')),
  )
}

function findHeaderIndexInTable(rows: string[][]): number {
  return rows.findIndex((row) => {
    const joined = row.join(',')
    return joined.includes('交易时间') && (joined.includes('金额') || joined.includes('收/支'))
  })
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
  const direction = get(['收/支'])
  const amountRaw = get(['金额'])
  const category = get(['交易类型']) || '其他'
  const counterparty = cleanNotePart(get(['交易对方', '对方']))
  const product = cleanNotePart(get(['商品', '商品说明']))
  const noteRaw = cleanNotePart(get(['备注']))

  if (!dateRaw || !amountRaw) {
    return null
  }

  const amount = normalizeAmount(amountRaw)
  if (!Number.isFinite(amount) || amount === 0) {
    return null
  }

  const isIncome = direction.includes('收入')
  const isExpense = direction.includes('支出')
  if (!isIncome && !isExpense) {
    // 中性流水（充值/提现/理财通等）跳过
    return null
  }

  const date = normalizeDate(dateRaw)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return null
  }

  const note = [counterparty, product, noteRaw].filter(Boolean).join(' · ')

  return {
    date,
    amount,
    type: isIncome ? 'income' : 'expense',
    category: category || '其他',
    note,
  }
}

function parseFromTable(rows: string[][], accountId: string): ImportResult {
  const errors: string[] = []
  const headerIdx = findHeaderIndexInTable(rows)
  if (headerIdx < 0) {
    return {
      success: false,
      transactions: [],
      errors: ['未识别到微信账单表头，请确认是微信导出的账单（xlsx/csv）'],
      skipped: 0,
    }
  }

  const headers = rows[headerIdx]!.map((h) => h.trim())
  const transactions: ImportResult['transactions'] = []
  let skipped = 0

  for (let i = headerIdx + 1; i < rows.length; i += 1) {
    const cols = rows[i] ?? []
    if (cols.filter((c) => c.trim()).length < 3) {
      skipped += 1
      continue
    }
    try {
      const parsed = mapRow(
        cols.map((c) => c.trim()),
        headers,
      )
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
}

export const wechatImporter: BillImporter = {
  source: 'wechat',
  label: '微信账单',

  async parse(csvText: string, accountId: string): Promise<ImportResult> {
    const lines = csvText
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)

    const headerIdx = findHeaderIndexInLines(lines)
    if (headerIdx < 0) {
      return {
        success: false,
        transactions: [],
        errors: ['未识别到微信账单表头，请确认导出的是微信账单文件'],
        skipped: 0,
      }
    }

    const table = lines.map((line) => splitCsvLine(line))
    return parseFromTable(table, accountId)
  },

  async parseTable(rows: string[][], accountId: string): Promise<ImportResult> {
    return parseFromTable(rows, accountId)
  },
}
