/**
 * 自建账号认证（public.users）。
 * 登录密码同时用于 vaults AES 加密（仅存内存，不落盘）。
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  clearAuthSession,
  loadAuthSession,
  saveAuthSession,
} from '@/lib/authSession'
import { isSupabaseConfigured } from '@/lib/supabase'
import { loginUser, registerUser } from '@/services/userService'
import type { AuthUser } from '@/types'

export interface AuthResult {
  success: boolean
  message: string
}

interface AuthContextValue {
  configured: boolean
  loading: boolean
  user: AuthUser | null
  isAuthenticated: boolean
  signUp: (email: string, password: string) => Promise<AuthResult>
  signIn: (email: string, password: string) => Promise<AuthResult>
  signOut: () => Promise<void>
  /** 内存中的登录密码（供 vaults 加密；刷新后需重新登录） */
  getLoginPassword: () => string | null
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<AuthUser | null>(null)
  /** 是否已在内存中持有登录密码（刷新后为 false） */
  const [passwordReady, setPasswordReady] = useState(false)
  const passwordRef = useRef<string | null>(null)

  useEffect(() => {
    // 刷新后只恢复邮箱展示用会话不够进入应用，须重新输入密码
    const session = loadAuthSession()
    setUser(session)
    setLoading(false)
  }, [])

  const signUp = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    if (!isSupabaseConfigured) {
      return { success: false, message: '未配置 Supabase，请检查 .env' }
    }
    try {
      const next = await registerUser(email, password)
      passwordRef.current = password
      setPasswordReady(true)
      saveAuthSession(next)
      setUser(next)
      return { success: true, message: '注册成功，已自动登录' }
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : '注册失败',
      }
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    if (!isSupabaseConfigured) {
      return { success: false, message: '未配置 Supabase，请检查 .env' }
    }
    try {
      const next = await loginUser(email, password)
      passwordRef.current = password
      setPasswordReady(true)
      saveAuthSession(next)
      setUser(next)
      return { success: true, message: '登录成功' }
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : '登录失败',
      }
    }
  }, [])

  const signOut = useCallback(async () => {
    passwordRef.current = null
    setPasswordReady(false)
    clearAuthSession()
    setUser(null)
  }, [])

  const getLoginPassword = useCallback(() => passwordRef.current, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: isSupabaseConfigured,
      loading,
      user,
      isAuthenticated: Boolean(user) && passwordReady,
      signUp,
      signIn,
      signOut,
      getLoginPassword,
    }),
    [loading, user, passwordReady, signUp, signIn, signOut, getLoginPassword],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
