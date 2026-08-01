/**
 * 基于 Web Crypto API 的 AES-GCM 加密工具。
 * Master Password 仅存在于内存中，通过 PBKDF2 派生密钥，不落盘。
 */
import {
  AES_IV_LENGTH,
  AES_KEY_LENGTH,
  PBKDF2_ITERATIONS,
} from '@/lib/constants'
import type { EncryptedPayload } from '@/types'

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

/** 生成随机字节并转为 Base64 */
export function randomBase64(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength))
  return bytesToBase64(bytes)
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary)
}

export function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/**
 * 从 Master Password + salt 派生 AES-GCM 密钥。
 * salt 建议首次设置密码时随机生成并持久化。
 */
export async function deriveKey(
  password: string,
  saltBase64: string,
): Promise<CryptoKey> {
  const salt = base64ToBytes(saltBase64)
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: AES_KEY_LENGTH },
    false,
    ['encrypt', 'decrypt'],
  )
}

/** 加密任意可序列化对象，返回 Base64 密文载荷 */
export async function encryptPayload(
  data: unknown,
  password: string,
  saltBase64?: string,
): Promise<EncryptedPayload> {
  const salt = saltBase64 ?? randomBase64(16)
  const key = await deriveKey(password, salt)
  const iv = crypto.getRandomValues(new Uint8Array(AES_IV_LENGTH))
  const plaintext = textEncoder.encode(JSON.stringify(data))

  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext,
  )

  return {
    ciphertext: bytesToBase64(new Uint8Array(cipherBuffer)),
    iv: bytesToBase64(iv),
    salt,
  }
}

/** 解密载荷；密码错误时会抛出 DOMException */
export async function decryptPayload<T>(
  payload: EncryptedPayload,
  password: string,
): Promise<T> {
  const key = await deriveKey(password, payload.salt)
  const iv = base64ToBytes(payload.iv)
  const ciphertext = base64ToBytes(payload.ciphertext)

  const plainBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext,
  )

  return JSON.parse(textDecoder.decode(plainBuffer)) as T
}

/** 校验 Master Password 是否能解密给定载荷 */
export async function verifyPassword(
  payload: EncryptedPayload,
  password: string,
): Promise<boolean> {
  try {
    await decryptPayload(payload, password)
    return true
  } catch {
    return false
  }
}
