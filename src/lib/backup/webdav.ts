/**
 * 方案 C：WebDAV 备份适配器（骨架）。
 * 可对接坚果云、Nextcloud、群晖等。
 *
 * 注意：浏览器直连 WebDAV 常受 CORS 限制，生产环境可能需要：
 * 1) 自建极薄代理；或
 * 2) 使用支持 CORS 的网盘 / 桌面壳。
 */
import type { EncryptedPayload } from '@/types'
import type { BackupAdapter } from '@/lib/backup/types'

export interface WebDavBackupConfig {
  /** 例如 https://dav.jianguoyun.com/dav/bill-record/ */
  baseUrl: string
  username: string
  password: string
  filename?: string
}

function authHeader(username: string, password: string): string {
  return `Basic ${btoa(`${username}:${password}`)}`
}

export function createWebDavBackupAdapter(config: WebDavBackupConfig): BackupAdapter {
  const filename = config.filename ?? 'vault.json'
  const url = config.baseUrl.replace(/\/?$/, '/') + filename

  return {
    name: 'webdav',

    async upload(payload: EncryptedPayload) {
      const res = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: authHeader(config.username, config.password),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        throw new Error(`WebDAV 上传失败: ${res.status}`)
      }
    },

    async download() {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: authHeader(config.username, config.password),
        },
      })
      if (res.status === 404) return null
      if (!res.ok) {
        throw new Error(`WebDAV 下载失败: ${res.status}`)
      }
      return (await res.json()) as EncryptedPayload
    },
  }
}
