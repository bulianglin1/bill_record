import { alipayImporter } from '@/utils/import/alipay'
import { wechatImporter } from '@/utils/import/wechat'
import type { BillImporter } from '@/utils/import/types'

export type { BillImporter } from '@/utils/import/types'

/** 已注册的账单导入器 */
export const importers: Record<'wechat' | 'alipay', BillImporter> = {
  wechat: wechatImporter,
  alipay: alipayImporter,
}

export function getImporter(source: 'wechat' | 'alipay'): BillImporter {
  return importers[source]
}
