/**
 * 自建登录会话（localStorage）。
 * 不使用 Supabase Auth；仅保存 userId / email 供同步与门禁使用。
 */
import type { AuthUser } from '@/types'

const AUTH_SESSION_KEY = 'bill_record_auth_user'

export function loadAuthSession(): AuthUser | null {
  const raw = localStorage.getItem(AUTH_SESSION_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as AuthUser
    if (!parsed?.id || !parsed?.email) return null
    return parsed
  } catch {
    return null
  }
}

export function saveAuthSession(user: AuthUser): void {
  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(user))
}

export function clearAuthSession(): void {
  localStorage.removeItem(AUTH_SESSION_KEY)
}

/** 供同步层读取当前用户 id */
export function requireSessionUserId(): string {
  const session = loadAuthSession()
  if (!session?.id) {
    throw new Error('请先登录后再同步')
  }
  return session.id
}
