/**
 * 账户月结余业务：从流水汇总收入/支出/净额，手动触发写入云端。
 * 转账不计入。
 */
import { roundMoney } from '@/services/accountService'
import {
  listCloudMonthlySurplus,
  upsertCloudMonthlySurplus,
} from '@/services/cloudMonthlySurplusService'
import {
  monthDateRange,
} from '@/services/cloudAssetSnapshotService'
import { listTransactions } from '@/services/transactionService'
import type { MonthlyAccountSurplus, Transaction } from '@/types'

const YEAR_MONTH_PATTERN = /^\d{4}-\d{2}$/

function assertYearMonths(yearMonths: string[]): string[] {
  const unique = [...new Set(yearMonths)]
  if (unique.length === 0) {
    throw new Error('请至少选择一个月')
  }
  for (const ym of unique) {
    if (!YEAR_MONTH_PATTERN.test(ym)) {
      throw new Error(`无效的月份格式: ${ym}`)
    }
  }
  return unique.sort()
}

/** 从已拉取的流水中汇总某账户某月结余（忽略转账） */
export function computeAccountMonthSurplus(
  accountId: string,
  yearMonth: string,
  txs: Transaction[],
): { income: number; expense: number; net: number } {
  let income = 0
  let expense = 0
  for (const t of txs) {
    if (!t.date.startsWith(yearMonth)) continue
    if (t.accountId !== accountId) continue
    if (t.type === 'income') {
      income += t.amount
    } else if (t.type === 'expense') {
      expense += t.amount
    }
  }
  income = roundMoney(income)
  expense = roundMoney(expense)
  return {
    income,
    expense,
    net: roundMoney(income - expense),
  }
}

/** 列出云端月结余 */
export async function listMonthlySurplus(options?: {
  accountId?: string
  startMonth?: string
  endMonth?: string
}): Promise<MonthlyAccountSurplus[]> {
  return listCloudMonthlySurplus(options)
}

/**
 * 重算某账户在多个自然月的结余并 upsert。
 * 一次拉取覆盖区间流水，内存按月汇总。
 */
export async function recalculateMonthlySurplus(
  accountId: string,
  yearMonths: string[],
): Promise<MonthlyAccountSurplus[]> {
  if (!accountId) {
    throw new Error('请选择账户')
  }
  const months = assertYearMonths(yearMonths)
  const startMonth = months[0]!
  const endMonth = months[months.length - 1]!
  const { start } = monthDateRange(startMonth)
  const { end } = monthDateRange(endMonth)

  const txs = await listTransactions({
    accountId,
    startDate: start,
    endDate: end,
  })

  const rows = months.map((yearMonth) => {
    const { income, expense, net } = computeAccountMonthSurplus(
      accountId,
      yearMonth,
      txs,
    )
    return { accountId, yearMonth, income, expense, net }
  })

  await upsertCloudMonthlySurplus(rows)
  return listCloudMonthlySurplus({
    accountId,
    startMonth,
    endMonth,
  })
}

/**
 * 对多个账户 × 多个月份批量重算。
 * 某账户失败时保留已成功结果，最后汇总报错。
 */
export async function recalculateAllAccountsForMonths(
  accountIds: string[],
  yearMonths: string[],
): Promise<number> {
  const months = assertYearMonths(yearMonths)
  if (accountIds.length === 0) {
    throw new Error('没有可更新的账户')
  }

  let updated = 0
  const failures: string[] = []

  for (const accountId of accountIds) {
    try {
      await recalculateMonthlySurplus(accountId, months)
      updated += months.length
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误'
      failures.push(`${accountId}: ${msg}`)
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `部分账户更新失败（已成功 ${updated} 条）: ${failures.join('; ')}`,
    )
  }
  return updated
}
