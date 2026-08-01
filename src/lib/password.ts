/**
 * 登录密码哈希（与 Master Password 加密相互独立）。
 * 使用 PBKDF2-SHA256，仅存 hash + salt，不明文落库。
 */
import { PBKDF2_ITERATIONS } from '@/lib/constants'
import { base64ToBytes, bytesToBase64, randomBase64 } from '@/lib/crypto'

const textEncoder = new TextEncoder()

/** 生成登录密码盐 */
export function createPasswordSalt(): string {
  return randomBase64(16)
}

/** 将登录密码派生为可存储的哈希（Base64） */
export async function hashLoginPassword(
  password: string,
  saltBase64: string,
): Promise<string> {
  const salt = base64ToBytes(saltBase64)
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    256,
  )

  return bytesToBase64(new Uint8Array(bits))
}

/** 校验登录密码 */
export async function verifyLoginPassword(
  password: string,
  saltBase64: string,
  expectedHash: string,
): Promise<boolean> {
  const actual = await hashLoginPassword(password, saltBase64)
  return actual === expectedHash
}
