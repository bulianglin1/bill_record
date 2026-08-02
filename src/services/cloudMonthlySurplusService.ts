/**
 * Supabase public.monthly_account_surplus：账户 × 自然月结余（手动重算写入）。
 */
import { requireSessionUserId } from '@/lib/authSession'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import type { MonthlyAccountSurplus } from '@/types'

interface CloudMonthlySurplusRow {
  id: string
  user_id: string
  account_id: string
  year_month: string
  income: number | string
  expense: number | string
  net: number | string
  updated_at: string
}

export interface ListCloudMonthlySurplusOptions {
  accountId?: string
  /** YYYY-MM，含 */
  startMonth?: string
  /** YYYY-MM，含 */
  endMonth?: string
}

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('需要联网并配置 Supabase 后才能管理月结余')
  }
  return supabase
}

function fromRow(row: CloudMonthlySurplusRow): MonthlyAccountSurplus {
  return {
    id: row.id,
    accountId: row.account_id,
    yearMonth: row.year_month,
    income: Number(row.income),
    expense: Number(row.expense),
    net: Number(row.net),
    updatedAt: row.updated_at,
  }
}

/** 按条件列出云端月结余 */
export async function listCloudMonthlySurplus(
  options?: ListCloudMonthlySurplusOptions,
): Promise<MonthlyAccountSurplus[]> {
  const client = requireClient()
  const userId = requireSessionUserId()

  let query = client
    .from('monthly_account_surplus')
    .select('id, user_id, account_id, year_month, income, expense, net, updated_at')
    .eq('user_id', userId)

  if (options?.accountId) {
    query = query.eq('account_id', options.accountId)
  }
  if (options?.startMonth) {
    query = query.gte('year_month', options.startMonth)
  }
  if (options?.endMonth) {
    query = query.lte('year_month', options.endMonth)
  }

  const { data, error } = await query.order('year_month', { ascending: false })

  if (error) {
    throw new Error(`拉取月结余失败: ${error.message}`)
  }
  return ((data as CloudMonthlySurplusRow[]) ?? []).map(fromRow)
}

/** 批量 upsert 月结余（冲突键：user_id + account_id + year_month） */
export async function upsertCloudMonthlySurplus(
  rows: Omit<MonthlyAccountSurplus, 'id' | 'updatedAt'>[],
): Promise<void> {
  if (rows.length === 0) return

  const client = requireClient()
  const userId = requireSessionUserId()
  const now = new Date().toISOString()

  const payload = rows.map((row) => ({
    user_id: userId,
    account_id: row.accountId,
    year_month: row.yearMonth,
    income: row.income,
    expense: row.expense,
    net: row.net,
    updated_at: now,
  }))

  const { error } = await client.from('monthly_account_surplus').upsert(payload, {
    onConflict: 'user_id,account_id,year_month',
  })

  if (error) {
    throw new Error(`写入月结余失败: ${error.message}`)
  }
}
