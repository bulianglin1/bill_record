import type { EncryptedPayload } from '@/types'

/** 备份适配器统一接口（GitHub / WebDAV 等） */
export interface BackupAdapter {
  readonly name: string
  /** 上传已加密载荷 */
  upload(payload: EncryptedPayload, filename?: string): Promise<void>
  /** 下载最近一份加密载荷 */
  download(filename?: string): Promise<EncryptedPayload | null>
}
