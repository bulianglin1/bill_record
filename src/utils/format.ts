/** 金额格式化为人民币显示 */
export function formatMoney(value: number, options?: { sign?: boolean }): string {
  const abs = Math.abs(value)
  const formatted = new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2,
  }).format(abs)

  if (!options?.sign) {
    return value < 0 ? `-${formatted}` : formatted
  }
  if (value > 0) return `+${formatted}`
  if (value < 0) return `-${formatted}`
  return formatted
}

export function formatDate(date: string): string {
  if (!date) return ''
  return date.slice(0, 10)
}

export function todayIsoDate(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}
