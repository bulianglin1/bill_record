/**
 * 自建账号认证（public.users）。
 * 用户信息落 localStorage；密码仅落 sessionStorage（刷新可续登，关标签清除）。
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
import { SESSION_LOGIN_PASSWORD_KEY } from '@/lib/constants'
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
  /** 登录密码（内存 + 同标签 sessionStorage） */
  getLoginPassword: () => string | null
}

const AuthContext = createContext<AuthContextValue | null>(null)

function loadSessionPassword(): string | null {
  try {
    return sessionStorage.getItem(SESSION_LOGIN_PASSWORD_KEY)
  } catch {
    return null
  }
}

function saveSessionPassword(password: string): void {
  try {
    sessionStorage.setItem(SESSION_LOGIN_PASSWORD_KEY, password)
  } catch {
    // 隐私模式等场景写失败时仍可本页使用内存密码
  }
}

function clearSessionPassword(): void {
  try {
    sessionStorage.removeItem(SESSION_LOGIN_PASSWORD_KEY)
  } catch {
    // ignore
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<AuthUser | null>(null)
  /** 是否已持有登录密码（可进入账本） */
  const [passwordReady, setPasswordReady] = useState(false)
  const passwordRef = useRef<string | null>(null)

  useEffect(() => {
    const session = loadAuthSession()
    const pwd = loadSessionPassword()
    setUser(session)
    if (session && pwd) {
      passwordRef.current = pwd
      setPasswordReady(true)
    } else {
      passwordRef.current = null
      setPasswordReady(false)
    }
    setLoading(false)
  }, [])

  const rememberPassword = useCallback((password: string) => {
    passwordRef.current = password
    setPasswordReady(true)
    saveSessionPassword(password)
  }, [])

  const signUp = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      if (!isSupabaseConfigured) {
        return { success: false, message: '未配置 Supabase，请检查 .env' }
      }
      try {
        const next = await registerUser(email, password)
        rememberPassword(password)
        saveAuthSession(next)
        setUser(next)
        return { success: true, message: '注册成功，已自动登录' }
      } catch (err) {
        return {
          success: false,
          message: err instanceof Error ? err.message : '注册失败',
        }
      }
    },
    [rememberPassword],
  )

  const signIn = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      if (!isSupabaseConfigured) {
        return { success: false, message: '未配置 Supabase，请检查 .env' }
      }
      try {
        const next = await loginUser(email, password)
        rememberPassword(password)
        saveAuthSession(next)
        setUser(next)
        return { success: true, message: '登录成功' }
      } catch (err) {
        return {
          success: false,
          message: err instanceof Error ? err.message : '登录失败',
        }
      }
    },
    [rememberPassword],
  )

  const signOut = useCallback(async () => {
    passwordRef.current = null
    setPasswordReady(false)
    clearSessionPassword()
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
