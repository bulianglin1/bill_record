/**
 * 方案 B：GitHub 私有仓库 JSON 备份（适配器骨架）。
 * 需要 Personal Access Token（repo 权限），切勿把 Token 提交到代码库。
 *
 * 启用方式（后续可接到设置页）：
 *   const adapter = createGitHubBackupAdapter({ token, owner, repo, path })
 *   await adapter.upload(encryptedPayload)
 */
import type { EncryptedPayload } from '@/types'
import type { BackupAdapter } from '@/lib/backup/types'

export interface GitHubBackupConfig {
  token: string
  owner: string
  repo: string
  /** 仓库内路径，如 backups/vault.json */
  path: string
}

export function createGitHubBackupAdapter(config: GitHubBackupConfig): BackupAdapter {
  const apiBase = 'https://api.github.com'

  async function getFileSha(path: string): Promise<string | undefined> {
    const res = await fetch(
      `${apiBase}/repos/${config.owner}/${config.repo}/contents/${path}`,
      {
        headers: {
          Authorization: `Bearer ${config.token}`,
          Accept: 'application/vnd.github+json',
        },
      },
    )
    if (res.status === 404) return undefined
    if (!res.ok) {
      throw new Error(`GitHub 读取失败: ${res.status}`)
    }
    const json = (await res.json()) as { sha?: string }
    return json.sha
  }

  return {
    name: 'github',

    async upload(payload: EncryptedPayload, filename = config.path) {
      const sha = await getFileSha(filename)
      const content = btoa(unescape(encodeURIComponent(JSON.stringify(payload, null, 2))))
      const res = await fetch(
        `${apiBase}/repos/${config.owner}/${config.repo}/contents/${filename}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${config.token}`,
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: `chore: backup vault ${new Date().toISOString()}`,
            content,
            sha,
          }),
        },
      )
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`GitHub 上传失败: ${res.status} ${text}`)
      }
    },

    async download(filename = config.path) {
      const res = await fetch(
        `${apiBase}/repos/${config.owner}/${config.repo}/contents/${filename}`,
        {
          headers: {
            Authorization: `Bearer ${config.token}`,
            Accept: 'application/vnd.github+json',
          },
        },
      )
      if (res.status === 404) return null
      if (!res.ok) {
        throw new Error(`GitHub 下载失败: ${res.status}`)
      }
      const json = (await res.json()) as { content?: string; encoding?: string }
      if (!json.content) return null
      const decoded = decodeURIComponent(escape(atob(json.content.replace(/\n/g, ''))))
      return JSON.parse(decoded) as EncryptedPayload
    },
  }
}
