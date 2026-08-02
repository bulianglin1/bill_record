/**
 * 合并同一 key 的进行中 Promise。
 * 主要用于抵消 React Strict Mode 开发环境双挂载导致的重复请求。
 */
const inflight = new Map<string, Promise<unknown>>()

export function dedupeAsync<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key)
  if (existing) {
    return existing as Promise<T>
  }

  const promise = factory().finally(() => {
    if (inflight.get(key) === promise) {
      inflight.delete(key)
    }
  })

  inflight.set(key, promise)
  return promise
}
