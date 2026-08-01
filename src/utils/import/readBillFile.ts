/**
 * 账单文件读取：CSV 文本 / Excel 二维表。
 * 支付宝/微信 CSV 常见为 GBK，不能直接用 file.text()（按 UTF-8 解会乱码）。
 */
import * as XLSX from 'xlsx'

export type BillFilePayload =
  | { kind: 'csv'; text: string }
  | { kind: 'table'; rows: string[][] }

function cellToString(cell: unknown): string {
  if (cell == null || cell === '') return ''
  if (cell instanceof Date) {
    // 微信账单时间为东八区；用上海时区取自然日
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(cell)
  }
  if (typeof cell === 'number') {
    return String(cell)
  }
  return String(cell).trim()
}

function isExcelFile(file: File): boolean {
  const name = file.name.toLowerCase()
  return (
    name.endsWith('.xlsx') ||
    name.endsWith('.xls') ||
    file.type.includes('spreadsheet') ||
    file.type === 'application/vnd.ms-excel'
  )
}

/** 是否像微信/支付宝账单（含可识别表头） */
function looksLikeBillCsv(text: string): boolean {
  return (
    text.includes('交易时间') &&
    (text.includes('收/支') || text.includes('金额') || text.includes('交易分类'))
  )
}

function tryDecode(buffer: ArrayBuffer, encoding: string): string | null {
  try {
    return new TextDecoder(encoding).decode(buffer).replace(/^\uFEFF/, '')
  } catch {
    return null
  }
}

/**
 * 解码账单 CSV：优先能认出表头的编码（utf-8 → gbk → gb18030）。
 */
export async function decodeCsvText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const candidates = ['utf-8', 'gbk', 'gb18030'] as const

  for (const encoding of candidates) {
    const text = tryDecode(buffer, encoding)
    if (text && looksLikeBillCsv(text)) {
      return text
    }
  }

  // 都认不出表头时仍返回 utf-8，交给解析器报更具体的错误
  return tryDecode(buffer, 'utf-8') ?? ''
}

/** 将 Excel 工作簿第一张表转成字符串二维数组 */
export async function excelFileToTable(file: File): Promise<string[][]> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    throw new Error('Excel 文件中没有工作表')
  }
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) {
    throw new Error('无法读取 Excel 工作表')
  }
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: true,
  })
  return raw.map((row) => {
    const cells = Array.isArray(row) ? row : []
    return cells.map((cell) => cellToString(cell))
  })
}

/** 按扩展名读取账单：xlsx → table，其余按文本 CSV（自动识别 GBK） */
export async function readBillFile(file: File): Promise<BillFilePayload> {
  if (isExcelFile(file)) {
    return { kind: 'table', rows: await excelFileToTable(file) }
  }
  return { kind: 'csv', text: await decodeCsvText(file) }
}
