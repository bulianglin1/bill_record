/**
 * public.users 自建注册 / 登录（不走 Supabase Auth）。
 */
import { createPasswordSalt, hashLoginPassword, verifyLoginPassword } from '@/lib/password'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import type { AuthUser } from '@/types'

interface UserRow {
  id: string
  email: string
  password_hash: string
  password_salt: string
  created_at: string
}

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('未配置 Supabase，请检查 .env')
  }
  return supabase
}

/** 注册：写入 public.users 并返回会话用户 */
export async function registerUser(
  email: string,
  password: string,
): Promise<AuthUser> {
  const client = requireClient()
  const normalized = email.trim().toLowerCase()
  if (!normalized) {
    throw new Error('邮箱不能为空')
  }
  if (password.length < 6) {
    throw new Error('登录密码至少 6 位')
  }

  const { data: existing, error: findError } = await client
    .from('users')
    .select('id')
    .eq('email', normalized)
    .maybeSingle()

  if (findError) {
    throw new Error(`查询用户失败: ${findError.message}`)
  }
  if (existing) {
    throw new Error('该邮箱已注册，请直接登录')
  }

  const passwordSalt = createPasswordSalt()
  const passwordHash = await hashLoginPassword(password, passwordSalt)

  const { data, error } = await client
    .from('users')
    .insert({
      email: normalized,
      password_hash: passwordHash,
      password_salt: passwordSalt,
    })
    .select('id, email')
    .single()

  if (error || !data) {
    if (error?.message?.toLowerCase().includes('duplicate')) {
      throw new Error('该邮箱已注册，请直接登录')
    }
    throw new Error(error?.message ?? '注册失败')
  }

  return { id: data.id as string, email: data.email as string }
}

/** 登录：校验哈希后返回会话用户 */
export async function loginUser(
  email: string,
  password: string,
): Promise<AuthUser> {
  const client = requireClient()
  const normalized = email.trim().toLowerCase()

  const { data, error } = await client
    .from('users')
    .select('id, email, password_hash, password_salt')
    .eq('email', normalized)
    .maybeSingle()

  if (error) {
    throw new Error(`登录失败: ${error.message}`)
  }

  const row = data as UserRow | null
  if (!row) {
    throw new Error('邮箱或密码错误')
  }

  const ok = await verifyLoginPassword(
    password,
    row.password_salt,
    row.password_hash,
  )
  if (!ok) {
    throw new Error('邮箱或密码错误')
  }

  return { id: row.id, email: row.email }
}
